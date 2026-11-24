/**
 * 刷怪器 —— Step 3
 *
 * 职责：
 *   1. 按波次表刷怪（当前用第 1 波参数），刷怪点落在**地图边缘之外**；
 *   2. 敌人类型按 mix 权重抽取：**先按 PROTOTYPE_ENEMIES 过滤，再按过滤后的总权重归一化**，
 *      被过滤掉的权重（醉汉/偷吃贼等 MVP 怪）不能直接丢弃——否则刷新总量平白缩水；
 *   3. 同屏上限 GLOBAL.maxEnemiesOnScreen 生效：达到上限**暂停生成**，本该生成的敌人进队列，
 *      有敌人死亡时**排队补入**；
 *   4. 敌人节点全部来自对象池（PoolUtil），运行期不 instantiate。
 *
 * 红线：
 *   - 数值只从 Config 读（间隔/上限/血量倍率/权重/刷怪边距）；
 *   - 索敌、死亡判定用距离平方，不用物理引擎；
 *   - update 内不 new 对象。
 */
import { _decorator, Component, Node, Vec3, UITransform, Graphics, Label, Color, HorizontalTextAlignment, VerticalTextAlignment } from 'cc';
import { GLOBAL, PROTOTYPE_ENEMIES, PROTOTYPE_ONLY, PROTOTYPE_WAVES, WaveConfig } from '../Config';
import { PoolUtil } from '../core/PoolUtil';
import { DEFAULT_LAYER } from '../core/Layers';
import { Enemy } from './Enemy';

const { ccclass } = _decorator;

/** 敌人文字颜色（视觉常量） */
const COLOR_TEXT = new Color(28, 28, 32, 255);

@ccclass('EnemySpawner')
export class EnemySpawner extends Component {
    /** 敌人容器节点（所有敌人父节点） */
    private container: Node | null = null;
    /** 玩家节点 */
    private player: Node | null = null;
    /** 摊位节点 */
    private stall: Node | null = null;
    /** 敌人对象池 */
    private pool: PoolUtil<Node> | null = null;

    /** 当前在场的敌人 */
    private readonly activeEnemies: Enemy[] = [];
    /**
     * 敌人死亡监听器（外部订阅：掉食材、加金币等）。
     * Step 4 的 DropManager 挂在这里；死亡结算必须读死亡瞬间的敌人配置。
     */
    public readonly deathListeners: ((enemy: Enemy) => void)[] = [];
    /** 排队等待补入的敌人类型 id（达到上限时积累） */
    private readonly pendingIds: string[] = [];

    /** 距下一次刷怪的累计时间 */
    private spawnTimer = 0;
    /** 当前波次配置（Step 3 固定用第 1 波） */
    private readonly wave: WaveConfig = PROTOTYPE_WAVES[0];
    /** 原型允许的敌人 id（过滤刷怪池用） */
    private readonly prototypeIds: Set<string> = new Set<string>(PROTOTYPE_ENEMIES.map((e) => e.id));

    /** 地图中心与半宽半高（从场景的 MapBlock 读取，不写死） */
    private mapCenterX = 0;
    private mapCenterY = 0;
    private mapHalfWidth = 0;
    private mapHalfHeight = 0;
    /** 最近一次生成的出生点（自检用：应落在地图边缘之外） */
    private lastSpawnX = 0;
    private lastSpawnY = 0;

    /**
     * 死亡回调（箭头函数字段）。
     * 传方法引用会让 this 丢失 → 回收链会断在第一步，所以这里必须绑定。
     */
    private readonly handleEnemyDeath = (enemy: Enemy): void => {
        this.onEnemyDeath(enemy);
    };

    /**
     * 装配刷怪器。
     * @param container 敌人容器（会自动创建敌人节点）
     * @param player 玩家节点
     * @param stall 摊位节点
     */
    public setup(container: Node, player: Node | null, stall: Node | null): void {
        this.container = container;
        this.player = player;
        this.stall = stall;
        this.readMapBounds();
        this.pool = new PoolUtil<Node>(() => this.createEnemyNode(), GLOBAL.maxEnemiesOnScreen);
    }

    protected update(dt: number): void {
        if (!this.pool) {
            return;
        }
        this.spawnTimer += dt;
        const interval = this.wave.spawnIntervalSec;
        // 用 while 而不是 if：掉帧时补刷，不让刷新节奏随帧率漂移
        while (this.spawnTimer >= interval) {
            this.spawnTimer -= interval;
            this.requestSpawn();
        }
    }

    // ==================== 对外可查状态（自检 / 后续步骤用） ====================

    /** 当前在场敌人数 */
    public get enemyCount(): number {
        return this.activeEnemies.length;
    }

    /** 排队等待补入的数量 */
    public get pendingCount(): number {
        return this.pendingIds.length;
    }

    /** 对象池空闲数 */
    public get poolFreeCount(): number {
        return this.pool ? this.pool.freeCount : 0;
    }

    /** 对象池累计创建数（稳定后不应增长 = 没有 instantiate 抖动） */
    public get poolCreatedCount(): number {
        return this.pool ? this.pool.created : 0;
    }

    /** 同屏上限 */
    public get capacity(): number {
        return GLOBAL.maxEnemiesOnScreen;
    }

    /** 当前波次序号 */
    public get waveNumber(): number {
        return this.wave.wave;
    }

    /** 最近一次生成的出生点坐标（自检用） */
    public get lastSpawn(): { x: number; y: number } {
        return { x: this.lastSpawnX, y: this.lastSpawnY };
    }

    /** 地图范围（自检用：出生点应在其之外） */
    public get mapBounds(): { centerX: number; centerY: number; halfWidth: number; halfHeight: number } {
        return {
            centerX: this.mapCenterX,
            centerY: this.mapCenterY,
            halfWidth: this.mapHalfWidth,
            halfHeight: this.mapHalfHeight,
        };
    }

    /**
     * 索敌基础：找离 (x, y) 最近的敌人（距离平方比较）。
     * Step 4 的武器按冷却找最近目标就用它。
     */
    public findNearestEnemy(x: number, y: number): Enemy | null {
        let best: Enemy | null = null;
        let bestDistSq = Infinity;
        for (const enemy of this.activeEnemies) {
            const p = enemy.node.position;
            const dx = p.x - x;
            const dy = p.y - y;
            const distSq = dx * dx + dy * dy;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                best = enemy;
            }
        }
        return best;
    }

    /**
     * 在场敌人列表（只读用途）：投射物每帧要做命中判定，需要遍历全体。
     * 调用方只读，不得增删元素。
     */
    public get aliveEnemies(): Enemy[] {
        return this.activeEnemies;
    }

    // ==================== 调试（验收自检用，不属于玩法） ====================

    /** 立刻补满到同屏上限，返回补入数量（用于 FPS 自检） */
    public fillToCap(): number {
        if (!this.pool) {
            return 0;
        }
        let added = 0;
        while (this.activeEnemies.length < GLOBAL.maxEnemiesOnScreen) {
            const id = this.pickEnemyId();
            if (!id || !this.spawnEnemy(id)) {
                break;
            }
            added++;
        }
        return added;
    }

    /** 秒杀离玩家最近的敌人（验证死亡 → 对象池回收），返回是否成功 */
    public killNearestToPlayer(): boolean {
        const player = this.player;
        if (!player || this.activeEnemies.length === 0) {
            return false;
        }
        const target = this.findNearestEnemy(player.position.x, player.position.y);
        if (!target) {
            return false;
        }
        target.die();
        return true;
    }

    // ==================== 内部逻辑 ====================

    /**
     * 请求刷一只怪。
     * 达到同屏上限 → 暂停生成并排队；有死亡时再补进来。
     */
    private requestSpawn(): void {
        const enemyId = this.pickEnemyId();
        if (!enemyId) {
            return;
        }
        if (this.activeEnemies.length >= GLOBAL.maxEnemiesOnScreen) {
            this.pendingIds.push(enemyId);
            return;
        }
        this.spawnEnemy(enemyId);
    }

    /**
     * 按 mix 权重抽敌人类型。
     *
     * 过滤 + 归一化纪律：
     *   1. 先剔除不在 PROTOTYPE_ENEMIES 里的类型（config v2 第 5 波起混入了醉汉/偷吃贼）；
     *   2. 抽签用**过滤后的总权重**做区间 → 等价于把剩余权重按比例归一化，
     *      被过滤掉的权重不会被丢弃成"刷新量缩水"。
     */
    private pickEnemyId(): string | null {
        const mix = this.wave.mix;
        const ids: string[] = [];
        let total = 0;
        for (const id of Object.keys(mix)) {
            if (!this.prototypeIds.has(id)) {
                continue;
            }
            const weight = mix[id];
            if (weight > 0) {
                ids.push(id);
                total += weight;
            }
        }
        if (ids.length === 0 || total <= 0) {
            return null;
        }
        let roll = Math.random() * total;
        for (const id of ids) {
            roll -= mix[id];
            if (roll <= 0) {
                return id;
            }
        }
        return ids[ids.length - 1];
    }

    /** 生成一只敌人 */
    private spawnEnemy(id: string): boolean {
        if (!this.pool) {
            return false;
        }
        const config = PROTOTYPE_ENEMIES.find((e) => e.id === id);
        if (!config) {
            return false;
        }
        const node = this.pool.acquire();
        const enemy = node.getComponent(Enemy) ?? node.addComponent(Enemy);
        const pos = this.randomSpawnPosition();
        this.lastSpawnX = pos.x;
        this.lastSpawnY = pos.y;
        node.setPosition(pos.x, pos.y, pos.z);
        enemy.activate(
            config,
            this.wave.hpMul,
            this.pool,
            this.handleEnemyDeath,
            this.player,
            this.stall,
            PROTOTYPE_ONLY.aggroMode,
            PROTOTYPE_ONLY.stallAggroRatio,
        );
        this.activeEnemies.push(enemy);
        return true;
    }

    /** 敌人死亡：移出在场列表 + 排队补入 + 通知外部（掉食材等） */
    private onEnemyDeath(enemy: Enemy): void {
        const index = this.activeEnemies.indexOf(enemy);
        if (index >= 0) {
            this.activeEnemies.splice(index, 1);
        }
        // 先通知外部做死亡结算（读 enemy.enemyConfig 的 expDrop/coins）
        for (const listener of this.deathListeners) {
            listener(enemy);
        }
        while (this.pendingIds.length > 0 && this.activeEnemies.length < GLOBAL.maxEnemiesOnScreen) {
            const id = this.pendingIds.shift();
            if (id === undefined || !this.spawnEnemy(id)) {
                break;
            }
        }
    }

    /** 地图边缘之外的随机出生点（四条边外侧随机一条） */
    private randomSpawnPosition(): Vec3 {
        const margin = PROTOTYPE_ONLY.spawnMargin;
        const halfW = this.mapHalfWidth;
        const halfH = this.mapHalfHeight;
        const side = Math.floor(Math.random() * 4);
        let x = 0;
        let y = 0;
        if (side === 0) {
            x = -halfW - margin;
            y = (Math.random() * 2 - 1) * halfH;
        } else if (side === 1) {
            x = halfW + margin;
            y = (Math.random() * 2 - 1) * halfH;
        } else if (side === 2) {
            x = (Math.random() * 2 - 1) * halfW;
            y = -halfH - margin;
        } else {
            x = (Math.random() * 2 - 1) * halfW;
            y = halfH + margin;
        }
        return new Vec3(this.mapCenterX + x, this.mapCenterY + y, 0);
    }

    /** 从场景的 MapBlock 读取地图范围 */
    private readMapBounds(): void {
        const mapNode = this.node.scene?.getChildByPath('Canvas/World/MapBlock');
        const mapTransform = mapNode ? mapNode.getComponent(UITransform) : null;
        if (mapTransform) {
            this.mapHalfWidth = mapTransform.contentSize.width / 2;
            this.mapHalfHeight = mapTransform.contentSize.height / 2;
            this.mapCenterX = mapNode ? mapNode.position.x : 0;
            this.mapCenterY = mapNode ? mapNode.position.y : 0;
        }
    }

    /** 对象池工厂：创建一个敌人节点（灰盒色块 + 类型文字） */
    private createEnemyNode(): Node {
        const size = PROTOTYPE_ONLY.enemySize;
        const node = new Node('Enemy');
        node.layer = DEFAULT_LAYER;

        const transform = node.addComponent(UITransform);
        transform.setContentSize(size, size);
        node.addComponent(Graphics);

        const labelNode = new Node('Text');
        labelNode.layer = DEFAULT_LAYER;
        const labelTransform = labelNode.addComponent(UITransform);
        labelTransform.setContentSize(size, size);
        const label = labelNode.addComponent(Label);
        label.useSystemFont = true;
        label.fontFamily = 'Arial';
        label.fontSize = Math.round(size * 0.55);
        label.horizontalAlign = HorizontalTextAlignment.CENTER;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        label.color = COLOR_TEXT;
        label.cacheMode = Label.CacheMode.CHAR;
        node.addChild(labelNode);

        if (this.container) {
            this.container.addChild(node);
        }
        node.active = false;
        return node;
    }
}
