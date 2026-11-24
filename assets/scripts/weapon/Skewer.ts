/**
 * 烤串（签子武器）—— Step 4
 *
 * 行为（03 文档 Step 4）：
 *   按冷却向**最近敌人**发射签子 → 命中扣血 → 穿透数读 Config。
 *
 * 实现要点：
 *   - 索敌用 EnemySpawner.findNearestEnemy()（内部距离平方比较）；
 *   - 扣血用 Enemy.applyDamage()；
 *   - 伤害 / 冷却 / 穿透 / 弹速全部读 Config 的 DISHES（烤串条目），
 *     等级只作为倍率指数（Step 5 的三选一升级会改等级）；
 *   - 签子节点走对象池，运行期不 instantiate。
 */
import { _decorator, Component, Node, Graphics, Color, UITransform } from 'cc';
import { DISHES, DishConfig, PROTOTYPE_ONLY } from '../Config';
import { PoolUtil } from '../core/PoolUtil';
import { DEFAULT_LAYER } from '../core/Layers';
import { EnemySpawner } from '../enemy/EnemySpawner';
import { Projectile } from './Projectile';

const { ccclass } = _decorator;

/** 签子灰盒配色（视觉常量） */
const COLOR_SKEWER = new Color(214, 186, 132, 255);

@ccclass('Skewer')
export class Skewer extends Component {
    /** 对应 Config 里的菜品 id */
    public static readonly DISH_ID = 'skewer';

    /** 发射者（玩家） */
    private owner: Node | null = null;
    /** 敌人来源 */
    private spawner: EnemySpawner | null = null;
    /** 签子对象池 */
    private pool: PoolUtil<Node> | null = null;
    /** 武器等级（Step 5 升级会改） */
    private level = 1;
    /** 冷却累计计时 */
    private timer = 0;
    /** 累计开火次数（自检用） */
    private shotsFired = 0;

    /**
     * 装配武器。
     * @param owner 发射者节点（玩家）
     * @param spawner 敌人来源
     */
    public setup(owner: Node, spawner: EnemySpawner): void {
        this.owner = owner;
        this.spawner = spawner;
        this.pool = new PoolUtil<Node>(() => this.createProjectileNode(), PROTOTYPE_ONLY.projectilePoolSize);
    }

    /** 设置武器等级 */
    public setLevel(level: number): void {
        this.level = Math.max(1, level);
    }

    /** 当前等级 */
    public get weaponLevel(): number {
        return this.level;
    }

    /** 累计开火次数（自检用） */
    public get firedCount(): number {
        return this.shotsFired;
    }

    /** 每帧推进：冷却到点就朝最近敌人开火 */
    public tick(dt: number): void {
        if (!this.owner || !this.spawner || !this.pool) {
            return;
        }
        const dish = this.dishConfig();
        if (!dish) {
            return;
        }
        this.timer += dt;
        const cooldown = this.cooldownOf(dish);
        if (this.timer < cooldown) {
            return;
        }
        // 减去而非清零：掉帧时保持节奏
        this.timer -= cooldown;

        // 索敌：最近敌人（距离平方比较）
        const origin = this.owner.position;
        const target = this.spawner.findNearestEnemy(origin.x, origin.y);
        if (!target) {
            return;
        }
        this.fire(target.node.position.x, target.node.position.y, dish);
    }

    /** 开火：生成一枚签子 */
    private fire(toX: number, toY: number, dish: DishConfig): void {
        if (!this.pool || !this.owner || !this.spawner) {
            return;
        }
        const origin = this.owner.position;
        const node = this.pool.acquire();
        const projectile = node.getComponent(Projectile) ?? node.addComponent(Projectile);
        projectile.launch(
            origin.x,
            origin.y,
            toX,
            toY,
            this.damageOf(dish),
            dish.pierce ?? 1,
            dish.projectileSpeed ?? 0,
            this.spawner,
            this.pool,
        );
        this.shotsFired++;
    }

    /** 当前等级的伤害 = 基础伤害 × 每级倍率^(等级-1) */
    public damageOf(dish: DishConfig): number {
        return dish.damage * Math.pow(dish.damageGrowthPerLevel, this.level - 1);
    }

    /** 当前等级的冷却 = 基础冷却 × 每级倍率^(等级-1) */
    public cooldownOf(dish: DishConfig): number {
        return dish.cooldownSec * Math.pow(dish.cooldownGrowthPerLevel, this.level - 1);
    }

    /** 读 Config 里的烤串配置 */
    private dishConfig(): DishConfig | null {
        for (const dish of DISHES) {
            if (dish.id === Skewer.DISH_ID) {
                return dish;
            }
        }
        return null;
    }

    /** 对象池工厂：创建一枚签子节点（灰盒色块） */
    private createProjectileNode(): Node {
        const size = PROTOTYPE_ONLY.projectileSize;
        const node = new Node('SkewerShot');
        node.layer = DEFAULT_LAYER;
        const transform = node.addComponent(UITransform);
        transform.setContentSize(size, size);
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = COLOR_SKEWER;
        graphics.rect(-size / 2, -size / 2, size, size);
        graphics.fill();
        this.node.addChild(node);
        node.active = false;
        return node;
    }
}
