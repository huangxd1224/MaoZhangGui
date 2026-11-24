/**
 * 敌人 —— Step 3：灰盒色块 + 文字、索敌移动、死亡走对象池
 *
 * 职责：
 *   1. 灰盒表现：色块 + 类型首字（老鼠→「鼠」、蟑螂→「蟑」）；
 *   2. 索敌：按 Config 的 aggroMode 决定追玩家还是冲摊位，
 *      「是否到达目标」「该打谁」全部用**距离平方**比较，不用物理引擎；
 *   3. 移动：速度读 EnemyConfig.speed；
 *   4. 死亡：applyDamage → 血量归零 → die() → 归还对象池（不销毁节点）。
 *
 * 红线：
 *   - 数值只从 Config 读（血量/速度来自 EnemyConfig，边距等来自 PROTOTYPE_ONLY）；
 *   - update 内不 new 对象；
 *   - 不用物理引擎、不做真实碰撞体。
 */
import { _decorator, Component, Node, Graphics, Color, Label, UITransform, HorizontalTextAlignment, VerticalTextAlignment } from 'cc';
import { EnemyConfig, PROTOTYPE_ONLY } from '../Config';
import { PoolUtil } from '../core/PoolUtil';

const { ccclass } = _decorator;

/** 灰盒配色（视觉常量，非玩法数值） */
const COLOR_RAT = new Color(196, 196, 206, 255);
const COLOR_ROACH = new Color(126, 170, 112, 255);
const COLOR_ELITE = new Color(214, 84, 84, 255);
const COLOR_TEXT = new Color(28, 28, 32, 255);

/** 索敌模式（与 Config.PROTOTYPE_ONLY.aggroMode 同义，便于脚本内表达） */
export type AggroMode = 'player' | 'stall' | 'nearest';

@ccclass('Enemy')
export class Enemy extends Component {
    /** 本体配置（原型敌人，来自 PROTOTYPE_ENEMIES） */
    public enemyConfig: EnemyConfig | null = null;
    /** 当前血量 */
    public hp = 0;
    /** 血量上限 */
    public maxHp = 0;
    /** 是否存活（池中为 false） */
    public alive = false;
    /** 死亡回调（由刷怪器注入，用于计数与排队补入） */
    public deathHandler: ((enemy: Enemy) => void) | null = null;
    /** 所属对象池 */
    public pool: PoolUtil<Node> | null = null;

    /** 玩家节点（索敌用） */
    private playerNode: Node | null = null;
    /** 摊位节点（索敌用） */
    private stallNode: Node | null = null;
    /** 索敌模式 */
    private aggroMode: AggroMode = 'player';
    /** nearest 模式：摊位距离 < 玩家距离 × 该比例时改冲摊位 */
    private stallAggroRatio = 0.8;

    /** 绘制组件缓存 */
    private graphics: Graphics | null = null;
    private label: Label | null = null;
    /** 自身碰撞半径（灰盒边长的一半） */
    private selfRadius = 0;

    /**
     * 从池中取出时初始化。
     * @param config 敌人配置（只允许 PROTOTYPE_ENEMIES 里的类型）
     * @param hpMul 本波血量倍率
     * @param pool 所属对象池
     * @param deathHandler 死亡回调
     * @param player 玩家节点
     * @param stall 摊位节点
     * @param aggroMode 索敌模式
     * @param stallAggroRatio nearest 模式的摊位优先比例
     */
    public activate(
        config: EnemyConfig,
        hpMul: number,
        pool: PoolUtil<Node>,
        deathHandler: (enemy: Enemy) => void,
        player: Node | null,
        stall: Node | null,
        aggroMode: AggroMode,
        stallAggroRatio: number,
    ): void {
        this.enemyConfig = config;
        this.maxHp = Math.max(1, Math.round(config.hp * hpMul));
        this.hp = this.maxHp;
        this.pool = pool;
        this.deathHandler = deathHandler;
        this.playerNode = player;
        this.stallNode = stall;
        this.aggroMode = aggroMode;
        this.stallAggroRatio = stallAggroRatio;

        this.cacheComponents();
        this.draw(config);
        this.alive = true;
    }

    /** 归还池前清理状态 */
    public deactivate(): void {
        this.alive = false;
        this.enemyConfig = null;
        this.playerNode = null;
        this.stallNode = null;
        this.deathHandler = null;
    }

    protected update(dt: number): void {
        if (!this.alive) {
            return;
        }
        const target = this.pickTarget();
        if (!target) {
            return;
        }
        const pos = this.node.position;
        const dx = target.position.x - pos.x;
        const dy = target.position.y - pos.y;
        const distSq = dx * dx + dy * dy;

        // 到达判定用距离平方（不用开方比较）
        const stopDist = this.selfRadius + this.targetRadius(target);
        if (distSq <= stopDist * stopDist) {
            return;
        }

        const dist = Math.sqrt(distSq);
        const step = (this.enemyConfig?.speed ?? 0) * dt;
        if (step <= 0 || dist <= 0) {
            return;
        }
        this.node.setPosition(pos.x + (dx / dist) * step, pos.y + (dy / dist) * step, pos.z);
    }

    /** 受伤（Step 4 的武器调用；Step 3 用调试键触发） */
    public applyDamage(damage: number): void {
        if (!this.alive) {
            return;
        }
        this.hp -= damage;
        if (this.hp <= 0) {
            this.die();
        }
    }

    /** 死亡：归还对象池 + 回调刷怪器（节点不销毁） */
    public die(): void {
        if (!this.alive) {
            return;
        }
        this.alive = false;
        const handler = this.deathHandler;
        const pool = this.pool;
        // 顺序很重要：先把自己的节点归还池，再通知刷怪器补入，
        // 这样补入的怪能直接复用这个节点，不会因为「池里暂时没空位」而新建节点。
        this.deactivate();
        if (pool) {
            pool.release(this.node);
        }
        if (handler) {
            handler(this);
        }
    }

    /** 到目标的距离平方（供刷怪器索敌 / 调试用） */
    public distanceSqTo(node: Node): number {
        const pos = this.node.position;
        const dx = node.position.x - pos.x;
        const dy = node.position.y - pos.y;
        return dx * dx + dy * dy;
    }

    /**
     * 选目标：距离平方比较。
     *   player  → 玩家；stall → 摊位；nearest → 默认玩家，摊位明显更近时改摊位。
     */
    private pickTarget(): Node | null {
        const player = this.playerNode;
        const stall = this.stallNode;
        if (this.aggroMode === 'stall') {
            return stall ?? player;
        }
        if (!player) {
            return stall;
        }
        if (this.aggroMode !== 'nearest' || !stall) {
            return player;
        }
        const playerDistSq = this.distanceSqTo(player);
        const stallDistSq = this.distanceSqTo(stall);
        // 摊位距离 < 玩家距离 × ratio → 改冲摊位
        return stallDistSq < playerDistSq * this.stallAggroRatio * this.stallAggroRatio ? stall : player;
    }

    /** 目标节点的粗略半径（用于到达判定） */
    private targetRadius(target: Node): number {
        const t = target.getComponent(UITransform);
        if (!t) {
            return 0;
        }
        return Math.min(t.contentSize.width, t.contentSize.height) / 2;
    }

    private cacheComponents(): void {
        if (!this.graphics) {
            this.graphics = this.node.getComponent(Graphics);
        }
        if (!this.label) {
            const labelNode = this.node.getChildByName('Text');
            this.label = labelNode ? labelNode.getComponent(Label) : null;
        }
        const t = this.node.getComponent(UITransform);
        if (t) {
            this.selfRadius = Math.min(t.contentSize.width, t.contentSize.height) / 2;
        }
    }

    /** 灰盒绘制：色块 + 类型首字 */
    private draw(config: EnemyConfig): void {
        const g = this.graphics;
        if (g) {
            const t = this.node.getComponent(UITransform);
            const w = t ? t.contentSize.width : 36;
            const h = t ? t.contentSize.height : 36;
            g.clear();
            g.fillColor = config.elite ? COLOR_ELITE : (config.id === 'roach' ? COLOR_ROACH : COLOR_RAT);
            g.rect(-w / 2, -h / 2, w, h);
            g.fill();
        }
        if (this.label) {
            // 灰盒辨识字取自 Config（老鼠→「鼠」），取不到才回退到名字首字
            this.label.string = PROTOTYPE_ONLY.enemyGlyphs[config.id] ?? config.name.charAt(0);
            this.label.color = COLOR_TEXT;
        }
    }
}
