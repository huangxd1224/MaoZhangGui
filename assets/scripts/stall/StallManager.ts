/**
 * 摊位管理 —— Step 7：基地血量 + 间歇摆摊（奶茶摊）+ 减速光环
 *
 * 职责：
 *   1. **基地摊位**（场景里的 World/Stall）：血量读 GLOBAL.stallHp，
 *      被敌人啃到 0 → 判负（回调 onDefeat）；
 *   2. **防御摊**（原型只有奶茶摊）：间歇期花金币（读 STALLS.cost）在**固定点**摆放，
 *      数值（血量 / 作用半径 / 减速比例）全部读 Config 的 stalls 表，脚本里不写死；
 *   3. **减速光环**：范围内的敌人移速乘 slowFactor（Enemy.applySlow）；
 *   4. 防御摊可被怪打坏（血量归零 → 摊子消失），下一间歇可花 repairCost 维修。
 *
 * 数值纪律：所有玩法数值都来自 Config（STALLS / GLOBAL / PROTOTYPE_ONLY）。
 */
import { _decorator, Component, Node, Graphics, Color, Label, UITransform, HorizontalTextAlignment, VerticalTextAlignment } from 'cc';
import { GLOBAL, PROTOTYPE_ONLY, PROTOTYPE_STALLS, StallConfig } from '../Config';
import { PlayerStats } from '../player/PlayerStats';
import { EnemySpawner } from '../enemy/EnemySpawner';
import { Enemy } from '../enemy/Enemy';
import { StallProvider, StallTarget } from './StallTypes';
import { DEFAULT_LAYER } from '../core/Layers';

const { ccclass } = _decorator;

/** 摊位色块配色（视觉常量） */
const COLOR_STALL = new Color(226, 178, 96, 255);
const COLOR_AURA = new Color(120, 196, 226, 190);
const COLOR_BAR_BACK = new Color(20, 20, 24, 255);
const COLOR_BAR_FILL = new Color(216, 88, 88, 255);
const COLOR_TEXT = new Color(28, 28, 32, 255);

/** 一个防御摊的运行时数据 */
export class DefensiveStall {
    /** 配置（数值全部来自 Config） */
    public readonly config: StallConfig;
    /** 摊子节点 */
    public readonly node: Node;
    /** 当前血量 */
    public hp: number;
    /** 血量上限 */
    public readonly maxHp: number;
    /** 占用的摆摊点下标 */
    public readonly pointIndex: number;
    /** 血条填充绘制组件 */
    private readonly barFill: Graphics;
    /** 上次绘制的血量（避免每帧重绘） */
    private lastDrawnHp = -1;

    constructor(config: StallConfig, node: Node, pointIndex: number, barFill: Graphics) {
        this.config = config;
        this.node = node;
        this.pointIndex = pointIndex;
        this.maxHp = config.hp;
        this.hp = config.hp;
        this.barFill = barFill;
    }

    /** 刷新血条 */
    public refreshBar(): void {
        if (this.hp === this.lastDrawnHp) {
            return;
        }
        this.lastDrawnHp = this.hp;
        const g = this.barFill;
        if (!g) {
            return;
        }
        const w = PROTOTYPE_ONLY.stallHpBarWidth;
        const h = PROTOTYPE_ONLY.stallHpBarHeight;
        const ratio = this.maxHp > 0 ? Math.max(0, this.hp / this.maxHp) : 0;
        g.clear();
        g.fillColor = COLOR_BAR_FILL;
        g.rect(-w / 2, -h / 2, w * ratio, h);
        g.fill();
    }
}

@ccclass('StallManager')
export class StallManager extends Component implements StallProvider {
    /** 基地摊位节点（场景里的 World/Stall） */
    private baseStallNode: Node | null = null;
    /** 基地当前血量 */
    private baseHp = 0;
    /** 基地血量上限 */
    private baseMaxHp = 0;
    /** 基地接触判定半径 */
    private baseTouchRadius = 0;
    /** 玩家属性（扣金币） */
    private stats: PlayerStats | null = null;
    /** 刷怪器（取活着的敌人做光环判定） */
    private spawner: EnemySpawner | null = null;
    /** 已摆放的防御摊 */
    private readonly stalls: DefensiveStall[] = [];
    /** 摆摊点占用情况 */
    private readonly usedPoints: boolean[] = [];
    /** 判负回调（外部注入 → GameManager） */
    private onDefeat: (() => void) | null = null;
    /** 摊位容器节点 */
    private container: Node | null = null;

    /**
     * 装配。
     * @param baseStallNode 基地摊位节点
     * @param stats 玩家属性（扣金币）
     * @param spawner 刷怪器
     * @param onDefeat 基地被啃光 → 判负
     */
    public setup(baseStallNode: Node | null, stats: PlayerStats, spawner: EnemySpawner, onDefeat: () => void): void {
        this.baseStallNode = baseStallNode;
        this.stats = stats;
        this.spawner = spawner;
        this.onDefeat = onDefeat;
        this.baseMaxHp = GLOBAL.stallHp;
        this.baseHp = GLOBAL.stallHp;
        // 接触半径 = 摊位半边长 + 敌人半径（都从节点/Config 读，不写死）
        const baseTransform = baseStallNode ? baseStallNode.getComponent(UITransform) : null;
        const baseSize = baseTransform ? Math.min(baseTransform.contentSize.width, baseTransform.contentSize.height) : 0;
        this.baseTouchRadius = baseSize / 2 + PROTOTYPE_ONLY.enemySize / 2;
        this.usedPoints.length = 0;
        for (let i = 0; i < PROTOTYPE_ONLY.stallPoints.length; i++) {
            this.usedPoints.push(false);
        }
        this.ensureContainer();
    }

    // ==================== 对外状态（自检用） ====================

    /** 基地当前血量 */
    public get baseStallHp(): number {
        return this.baseHp;
    }

    /** 基地血量上限 */
    public get baseStallMaxHp(): number {
        return this.baseMaxHp;
    }

    /** 已摆放的防御摊 */
    public get defensiveStalls(): DefensiveStall[] {
        return this.stalls;
    }

    /** 剩余空摆摊点数 */
    public get freePointCount(): number {
        let count = 0;
        for (const used of this.usedPoints) {
            if (!used) {
                count++;
            }
        }
        return count;
    }

    /** 是否还能摆这个摊子（金币够 + 有空点位） */
    public canPlace(config: StallConfig): boolean {
        return this.stats !== null && this.stats.coins >= config.cost && this.freePointCount > 0;
    }

    // ==================== 摆摊 / 维修 ====================

    /**
     * 摆摊：扣金币 → 在固定点建摊。
     * @param configId 摊位配置 id
     * @returns 是否摆成功
     */
    public placeStall(configId: string): boolean {
        const config = PROTOTYPE_STALLS.find((s) => s.id === configId);
        if (!config || !this.stats) {
            return false;
        }
        if (this.stats.coins < config.cost) {
            return false;
        }
        const pointIndex = this.findFreePoint();
        if (pointIndex < 0) {
            return false;
        }
        this.stats.coins -= config.cost;
        this.usedPoints[pointIndex] = true;
        const stall = this.createStall(config, pointIndex);
        this.stalls.push(stall);
        return true;
    }

    /**
     * 维修摊子：花 repairCost 恢复血量（doc 核心创新 3：下一间歇花金币维修）。
     * @param configId 摊位配置 id
     */
    public repairStall(configId: string): boolean {
        const stall = this.stalls.find((s) => s.config.id === configId);
        if (!stall || !this.stats) {
            return false;
        }
        if (stall.hp >= stall.maxHp || this.stats.coins < stall.config.repairCost) {
            return false;
        }
        this.stats.coins -= stall.config.repairCost;
        stall.hp = stall.maxHp;
        stall.refreshBar();
        return true;
    }

    // ==================== 敌人侧接口 ====================

    /** 找接触范围内的摊位（最近的） */
    public findStallTarget(x: number, y: number): StallTarget | null {
        let best: StallTarget | null = null;
        let bestDistSq = Infinity;
        // 防御摊
        for (const stall of this.stalls) {
            const p = stall.node.position;
            const dx = p.x - x;
            const dy = p.y - y;
            const distSq = dx * dx + dy * dy;
            const radius = this.touchRadiusOf(stall);
            if (distSq <= radius * radius && distSq < bestDistSq) {
                bestDistSq = distSq;
                best = { id: stall.config.id, x: p.x, y: p.y, touchRadius: radius, isBase: false };
            }
        }
        // 基地
        if (this.baseStallNode) {
            const p = this.baseStallNode.position;
            const dx = p.x - x;
            const dy = p.y - y;
            const distSq = dx * dx + dy * dy;
            if (distSq <= this.baseTouchRadius * this.baseTouchRadius && distSq < bestDistSq) {
                best = { id: 'base_stall', x: p.x, y: p.y, touchRadius: this.baseTouchRadius, isBase: true };
            }
        }
        return best;
    }

    /** 啃摊位：按敌人是否精英决定扣血（读 GLOBAL.stallTouchDamage*） */
    public attackStall(target: StallTarget, elite: boolean): void {
        const amount = elite ? GLOBAL.stallTouchDamageElite : GLOBAL.stallTouchDamage;
        if (target.isBase) {
            this.baseHp -= amount;
            if (this.baseHp <= 0) {
                this.baseHp = 0;
                if (this.onDefeat) {
                    this.onDefeat();
                }
            }
            return;
        }
        for (const stall of this.stalls) {
            if (stall.config.id === target.id) {
                stall.hp -= amount;
                stall.refreshBar();
                if (stall.hp <= 0) {
                    // 摊子被打坏 → 消失（点位释放，下次间歇可以重摆）
                    this.usedPoints[stall.pointIndex] = false;
                    stall.node.destroy();
                    this.stalls.splice(this.stalls.indexOf(stall), 1);
                }
                return;
            }
        }
    }

    // ==================== 每帧逻辑 ====================

    protected update(dt: number): void {
        this.applyAuras();
    }

    /**
     * 减速光环：范围内的敌人减速。
     * 每帧刷新一次减速剩余时间（离开光环即失效）。
     */
    private applyAuras(): void {
        if (!this.spawner || this.stalls.length === 0) {
            return;
        }
        const enemies = this.spawner.aliveEnemies;
        for (const stall of this.stalls) {
            const factor = stall.config.slowFactor;
            if (!factor || factor <= 0) {
                continue;
            }
            const radius = stall.config.radius;
            const radiusSq = radius * radius;
            const sp = stall.node.position;
            for (const enemy of enemies) {
                const ep = enemy.node.position;
                const dx = ep.x - sp.x;
                const dy = ep.y - sp.y;
                if (dx * dx + dy * dy > radiusSq) {
                    continue;
                }
                enemy.applySlow(factor, PROTOTYPE_ONLY.slowAuraRefreshSec);
            }
        }
    }

    // ==================== 内部 ====================

    /** 找第一个空摆摊点 */
    private findFreePoint(): number {
        for (let i = 0; i < this.usedPoints.length; i++) {
            if (!this.usedPoints[i]) {
                return i;
            }
        }
        return -1;
    }

    /** 摊子的接触判定半径 */
    private touchRadiusOf(stall: DefensiveStall): number {
        return PROTOTYPE_ONLY.stallSize / 2 + PROTOTYPE_ONLY.enemySize / 2;
    }

    /** 摊位容器（放在 World 下，跟随世界相机） */
    private ensureContainer(): Node | null {
        if (this.container) {
            return this.container;
        }
        const world = this.node.scene?.getChildByPath('Canvas/World');
        if (!world) {
            return null;
        }
        let node = world.getChildByName('Stalls');
        if (!node) {
            node = new Node('Stalls');
            node.layer = DEFAULT_LAYER;
            world.addChild(node);
            node.addComponent(UITransform);
        }
        this.container = node;
        return node;
    }

    /** 建一个防御摊（色块 + 文字 + 减速光环 + 血条） */
    private createStall(config: StallConfig, pointIndex: number): DefensiveStall {
        const container = this.ensureContainer();
        const point = PROTOTYPE_ONLY.stallPoints[pointIndex];
        const basePos = this.baseStallNode ? this.baseStallNode.position : { x: 0, y: 0 };

        const node = new Node(`Stall_${config.id}`);
        node.layer = DEFAULT_LAYER;
        const transform = node.addComponent(UITransform);
        transform.setContentSize(PROTOTYPE_ONLY.stallSize, PROTOTYPE_ONLY.stallSize);
        node.setPosition(basePos.x + point.x, basePos.y + point.y, 0);
        if (container) {
            container.addChild(node);
        }

        // 色块
        const graphics = node.addComponent(Graphics);
        const size = PROTOTYPE_ONLY.stallSize;
        graphics.fillColor = COLOR_STALL;
        graphics.rect(-size / 2, -size / 2, size, size);
        graphics.fill();

        // 文字（摊位名首字）
        const labelNode = new Node('Text');
        labelNode.layer = DEFAULT_LAYER;
        const labelTransform = labelNode.addComponent(UITransform);
        labelTransform.setContentSize(size, size);
        const label = labelNode.addComponent(Label);
        label.useSystemFont = true;
        label.fontFamily = 'Arial';
        label.fontSize = Math.round(size * 0.5);
        label.horizontalAlign = HorizontalTextAlignment.CENTER;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        label.color = COLOR_TEXT;
        label.cacheMode = Label.CacheMode.CHAR;
        label.string = config.name.charAt(0);
        node.addChild(labelNode);

        // 减速光环
        const auraNode = new Node('Aura');
        auraNode.layer = DEFAULT_LAYER;
        const auraTransform = auraNode.addComponent(UITransform);
        const radius = config.radius;
        auraTransform.setContentSize(radius * 2, radius * 2);
        const aura = auraNode.addComponent(Graphics);
        aura.strokeColor = COLOR_AURA;
        aura.lineWidth = 4;
        aura.circle(0, 0, radius);
        aura.stroke();
        node.addChild(auraNode);

        // 血条（摊子上方）
        const barNode = new Node('HpBar');
        barNode.layer = DEFAULT_LAYER;
        const barTransform = barNode.addComponent(UITransform);
        barTransform.setContentSize(PROTOTYPE_ONLY.stallHpBarWidth, PROTOTYPE_ONLY.stallHpBarHeight);
        barNode.setPosition(0, size / 2 + PROTOTYPE_ONLY.stallHpBarHeight, 0);
        const barBack = barNode.addComponent(Graphics);
        barBack.fillColor = COLOR_BAR_BACK;
        barBack.rect(-PROTOTYPE_ONLY.stallHpBarWidth / 2, -PROTOTYPE_ONLY.stallHpBarHeight / 2,
            PROTOTYPE_ONLY.stallHpBarWidth, PROTOTYPE_ONLY.stallHpBarHeight);
        barBack.fill();
        const fillNode = new Node('Fill');
        const fillTransform = fillNode.addComponent(UITransform);
        fillTransform.setContentSize(PROTOTYPE_ONLY.stallHpBarWidth, PROTOTYPE_ONLY.stallHpBarHeight);
        const barFill = fillNode.addComponent(Graphics);
        barNode.addChild(fillNode);
        node.addChild(barNode);

        const stall = new DefensiveStall(config, node, pointIndex, barFill);
        stall.refreshBar();
        return stall;
    }
}
