/**
 * 麻辣烫（进化菜）—— Step 6
 *
 * 由**烤串 + 辣椒粉** 进化而来（Config.RECIPES 的 malatang）：
 *   - 伤害：继承烤串的伤害与冷却，再乘配方的伤害倍率（damageMul = 2.2）；
 *   - 全屏穿透：穿透数与飞行距离读 PROTOTYPE_ONLY 的进化参数（打穿整屏）；
 *   - 命中灼烧：继承辣椒粉的灼烧 DPS 与持续时间（4/秒 · 3 秒）。
 *
 * 红线：所有数值只从 Config 读 —— 配方读 RECIPES，基础菜读 DISHES，
 *      进化专用参数读 PROTOTYPE_ONLY，不在逻辑里写死。
 */
import { _decorator, Component, Node, Graphics, Color, UITransform } from 'cc';
import { DISHES, DishConfig, PROTOTYPE_ONLY, RecipeConfig } from '../Config';
import { PoolUtil } from '../core/PoolUtil';
import { DEFAULT_LAYER } from '../core/Layers';
import { UpgradeState } from '../core/UpgradeState';
import { EnemySpawner } from '../enemy/EnemySpawner';
import { Enemy } from '../enemy/Enemy';
import { DishWeapon } from './DishWeapon';
import { Projectile } from './Projectile';

const { ccclass } = _decorator;

/** 进化签子灰盒配色（视觉常量） */
const COLOR_MALATANG = new Color(214, 96, 72, 255);

@ccclass('Malatang')
export class Malatang extends Component implements DishWeapon {
    /** 进化菜 id（与 Config.RECIPES 的 malatang.id 对应） */
    public static readonly DISH_ID = 'malatang';

    /** 发射者（玩家） */
    private owner: Node | null = null;
    /** 敌人来源 */
    private spawner: EnemySpawner | null = null;
    /** 签子对象池 */
    private pool: PoolUtil<Node> | null = null;
    /** 配方（伤害倍率来自它） */
    private recipe: RecipeConfig | null = null;
    /** 继承伤害/冷却/弹速的基础菜（烤串） */
    private baseDish: DishConfig | null = null;
    /** 继承灼烧效果的菜（辣椒粉） */
    private burnDish: DishConfig | null = null;
    /** 武器等级 */
    private level = 1;
    /** 冷却累计计时 */
    private timer = 0;
    /** 累计开火次数（自检用） */
    private shotsFired = 0;
    /** 累计命中次数（自检用） */
    private hitCount = 0;
    /** 累计造成伤害（自检用） */
    private dealt = 0;
    /** 累计附加灼烧次数（自检用） */
    private burnApplied = 0;

    /**
     * 装配。
     * @param owner 发射者节点（玩家）
     * @param spawner 敌人来源
     * @param recipe 进化配方（Config.RECIPES）
     */
    public setup(owner: Node, spawner: EnemySpawner, recipe: RecipeConfig): void {
        this.owner = owner;
        this.spawner = spawner;
        this.recipe = recipe;
        // 基础菜 = 配方的第一道（烤串：伤害/冷却/弹速）；灼烧来源 = 第二道（辣椒粉）
        this.baseDish = this.findDish(recipe.from[0]);
        this.burnDish = this.findDish(recipe.from[1]);
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

    /** 对应菜品 id */
    public get dishId(): string {
        return Malatang.DISH_ID;
    }

    /** 累计命中次数（自检用） */
    public get hits(): number {
        return this.hitCount;
    }

    /** 累计造成伤害（自检用） */
    public get damageDealt(): number {
        return this.dealt;
    }

    /** 累计开火次数（自检用） */
    public get firedCount(): number {
        return this.shotsFired;
    }

    /** 累计附加灼烧次数（自检用：确认「命中附加灼烧」真的在跑） */
    public get burnHits(): number {
        return this.burnApplied;
    }

    /** 命中回调：扣血已在 Projectile 里做过，这里附加灼烧并统计 */
    private readonly handleHit = (damage: number, enemy: Enemy): void => {
        this.hitCount++;
        this.dealt += damage;
        const burn = this.burnDish;
        if (burn && burn.burnDps && burn.burnDurationSec) {
            enemy.applyBurn(burn.burnDps, burn.burnDurationSec);
            this.burnApplied++;
        }
    };

    /** 每帧推进：冷却到点就朝最近敌人开火 */
    public tick(dt: number): void {
        if (!this.owner || !this.spawner || !this.pool || !this.baseDish) {
            return;
        }
        this.timer += dt;
        const cooldown = this.cooldownOf(this.baseDish);
        if (this.timer < cooldown) {
            return;
        }
        this.timer -= cooldown;

        const origin = this.owner.position;
        const target = this.spawner.findNearestEnemy(origin.x, origin.y);
        if (!target) {
            return;
        }
        this.fire(target.node.position.x, target.node.position.y, this.baseDish);
    }

    /** 开火：生成一枚全屏穿透签子 */
    private fire(toX: number, toY: number, baseDish: DishConfig): void {
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
            this.damageOf(baseDish),
            PROTOTYPE_ONLY.evolutionPierce,
            baseDish.projectileSpeed ?? 0,
            this.spawner,
            this.pool,
            this.handleHit,
            PROTOTYPE_ONLY.evolutionMaxTravel,
        );
        this.shotsFired++;
    }

    /** 伤害 = 基础菜伤害 × 等级成长 × 配方倍率 × 被动加成 */
    public damageOf(dish: DishConfig): number {
        const mul = this.recipe ? this.recipe.damageMul : 1;
        return dish.damage * Math.pow(dish.damageGrowthPerLevel, this.level - 1) * mul * UpgradeState.damageMul;
    }

    /** 冷却 = 基础菜冷却 × 等级成长 × 被动加成 */
    public cooldownOf(dish: DishConfig): number {
        return dish.cooldownSec * Math.pow(dish.cooldownGrowthPerLevel, this.level - 1) * UpgradeState.cooldownMul;
    }

    /** 在 DISHES 里找菜 */
    private findDish(dishId: string): DishConfig | null {
        for (const dish of DISHES) {
            if (dish.id === dishId) {
                return dish;
            }
        }
        return null;
    }

    /** 对象池工厂：创建一枚签子节点（灰盒色块） */
    private createProjectileNode(): Node {
        const size = PROTOTYPE_ONLY.projectileSize;
        const node = new Node('MalatangShot');
        node.layer = DEFAULT_LAYER;
        const transform = node.addComponent(UITransform);
        transform.setContentSize(size, size);
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = COLOR_MALATANG;
        graphics.rect(-size / 2, -size / 2, size, size);
        graphics.fill();
        this.node.addChild(node);
        node.active = false;
        return node;
    }
}
