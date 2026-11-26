/**
 * 投射物（签子）—— Step 4
 *
 * 职责：
 *   1. 沿发射方向匀速飞行（速度读 Config 的 projectileSpeed）；
 *   2. 命中判定用**距离平方**，不依赖物理引擎、不用碰撞体；
 *   3. 命中扣血走 Enemy.applyDamage()，穿透数读 Config 的 pierce；
 *   4. 命中次数用尽或飞出射程 → 归还对象池（节点不销毁）。
 *
 * 红线：数值只从 Config 读；update 内不 new 对象（命中集合复用，只在 launch 时 clear）。
 */
import { _decorator, Component, Node } from 'cc';
import { PoolUtil } from '../core/PoolUtil';
import { EnemySpawner } from '../enemy/EnemySpawner';
import { Enemy } from '../enemy/Enemy';
import { PROTOTYPE_ONLY } from '../Config';

const { ccclass } = _decorator;

@ccclass('Projectile')
export class Projectile extends Component {
    /** 是否在飞行中（池中为 false） */
    public flying = false;

    /** 单位方向向量 */
    private dirX = 1;
    private dirY = 0;
    /** 速度（像素/秒） */
    private speed = 0;
    /** 单次命中伤害 */
    private damage = 0;
    /** 剩余穿透次数 */
    private pierceLeft = 0;
    /** 已飞行距离 */
    private traveled = 0;
    /** 本次飞行的最远距离（进化签子要打穿全屏，所以可配） */
    private maxTravel = 0;
    /** 命中判定半径（投射物半径 + 敌人半径） */
    private hitRadiusSq = 0;

    /** 敌人来源（命中判定用） */
    private spawner: EnemySpawner | null = null;
    /** 所属对象池（回收用） */
    private pool: PoolUtil<Node> | null = null;
    /** 本次飞行已命中的敌人（避免同一敌人被重复扣血） */
    private readonly hitEnemies: Set<Node> = new Set<Node>();
    /** 命中回调（由武器注入，用于统计命中次数与伤害；进化签子还要附加灼烧） */
    private onHit: ((damage: number, enemy: Enemy) => void) | null = null;

    /**
     * 发射。
     * @param fromX 起点 x
     * @param fromY 起点 y
     * @param toX 目标 x
     * @param toY 目标 y
     * @param damage 单次伤害
     * @param pierce 穿透数（可命中几个敌人）
     * @param speed 飞行速度
     * @param spawner 敌人来源
     * @param pool 所属对象池
     * @param onHit 命中回调（带敌人引用）
     * @param maxTravel 最远飞行距离（默认读 PROTOTYPE_ONLY.projectileMaxTravel）
     */
    public launch(
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
        damage: number,
        pierce: number,
        speed: number,
        spawner: EnemySpawner,
        pool: PoolUtil<Node>,
        onHit?: ((damage: number, enemy: Enemy) => void) | null,
        maxTravel?: number,
    ): void {
        const dx = toX - fromX;
        const dy = toY - fromY;
        const len = Math.sqrt(dx * dx + dy * dy);
        this.dirX = len > 0 ? dx / len : 1;
        this.dirY = len > 0 ? dy / len : 0;
        this.damage = damage;
        this.pierceLeft = Math.max(1, pierce);
        this.speed = speed;
        this.traveled = 0;
        this.maxTravel = maxTravel ?? PROTOTYPE_ONLY.projectileMaxTravel;
        this.spawner = spawner;
        this.pool = pool;
        this.onHit = onHit ?? null;
        this.hitEnemies.clear();

        // 命中半径 = 投射物半径 + 敌人半径（敌人边长的一半）
        const radius = PROTOTYPE_ONLY.projectileSize / 2 + PROTOTYPE_ONLY.enemySize / 2;
        this.hitRadiusSq = radius * radius;

        this.node.setPosition(fromX, fromY, this.node.position.z);
        this.flying = true;
    }

    protected update(dt: number): void {
        if (!this.flying) {
            return;
        }
        const pos = this.node.position;
        const step = this.speed * dt;
        const x = pos.x + this.dirX * step;
        const y = pos.y + this.dirY * step;
        this.traveled += step;
        this.node.setPosition(x, y, pos.z);

        // 命中判定：距离平方
        if (this.spawner && this.checkHit(x, y)) {
            return;
        }

        // 超出射程 → 回收
        if (this.traveled >= this.maxTravel) {
            this.recycle();
        }
    }

    /** 命中检测：命中则扣血，返回 true 表示本帧已处理（可能已回收） */
    private checkHit(x: number, y: number): boolean {
        const enemies = this.spawner ? this.spawner.aliveEnemies : null;
        if (!enemies) {
            return false;
        }
        for (const enemy of enemies) {
            const node = enemy.node;
            if (this.hitEnemies.has(node)) {
                continue;
            }
            const ep = node.position;
            const dx = ep.x - x;
            const dy = ep.y - y;
            if (dx * dx + dy * dy > this.hitRadiusSq) {
                continue;
            }
            // 命中：扣血（死亡由 Enemy 内部处理 → 刷怪器 → 掉落）
            this.hitEnemies.add(node);
            enemy.applyDamage(this.damage);
            if (this.onHit) {
                this.onHit(this.damage, enemy);
            }
            this.pierceLeft--;
            if (this.pierceLeft <= 0) {
                this.recycle();
                return true;
            }
            // 还能穿透：继续飞，但同一个敌人不再重复命中
            break;
        }
        return false;
    }

    /** 归还对象池 */
    private recycle(): void {
        if (!this.flying) {
            return;
        }
        this.flying = false;
        const pool = this.pool;
        this.pool = null;
        this.spawner = null;
        this.onHit = null;
        this.hitEnemies.clear();
        if (pool) {
            pool.release(this.node);
        }
    }
}
