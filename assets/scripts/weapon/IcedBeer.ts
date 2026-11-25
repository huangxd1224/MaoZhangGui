/**
 * 冰啤酒（冰冻范围）—— Step 5
 *
 * 行为（config DISHES.iced_beer）：type = freeze_aoe
 *   - 每 cooldownSec 秒在玩家周围 radius 范围内结算一次：
 *     范围内敌人吃 damage 伤害并被冰冻 freezeDurationSec 秒（冰冻期间不移动）。
 *
 * 红线：数值全读 Config；判定用距离平方；不用物理引擎。
 */
import { _decorator, Component, Node, Graphics, Color, UITransform } from 'cc';
import { DISHES, DishConfig } from '../Config';
import { UpgradeState } from '../core/UpgradeState';
import { EnemySpawner } from '../enemy/EnemySpawner';
import { DishWeapon } from './DishWeapon';

const { ccclass } = _decorator;

/** 冰冻范围配色（视觉常量） */
const COLOR_RING = new Color(96, 186, 236, 150);

@ccclass('IcedBeer')
export class IcedBeer extends Component implements DishWeapon {
    /** 对应 Config 的菜品 id */
    public static readonly DISH_ID = 'iced_beer';

    /** 玩家节点 */
    private owner: Node | null = null;
    /** 敌人来源 */
    private spawner: EnemySpawner | null = null;
    /** 等级 */
    private level = 1;
    /** 冷却计时 */
    private timer = 0;
    /** 累计命中次数 */
    private hitCount = 0;
    /** 累计伤害 */
    private dealt = 0;

    /** 装配 */
    public setup(owner: Node, spawner: EnemySpawner): void {
        this.owner = owner;
        this.spawner = spawner;
        this.drawRing();
    }

    public get dishId(): string {
        return IcedBeer.DISH_ID;
    }

    public get weaponLevel(): number {
        return this.level;
    }

    public setLevel(level: number): void {
        this.level = Math.max(1, level);
    }

    public get hits(): number {
        return this.hitCount;
    }

    public get damageDealt(): number {
        return this.dealt;
    }

    public tick(dt: number): void {
        const dish = this.dishConfig();
        if (!dish || !this.owner || !this.spawner) {
            return;
        }
        this.timer += dt;
        const cooldown = this.cooldownOf(dish);
        if (this.timer < cooldown) {
            return;
        }
        this.timer -= cooldown;
        this.trigger(dish);
    }

    /** 结算一次冰冻范围 */
    private trigger(dish: DishConfig): void {
        const owner = this.owner;
        const spawner = this.spawner;
        if (!owner || !spawner) {
            return;
        }
        const radius = (dish.radius ?? 0) * UpgradeState.areaMul;
        const radiusSq = radius * radius;
        const ox = owner.position.x;
        const oy = owner.position.y;
        const damage = this.damageOf(dish);
        for (const enemy of spawner.aliveEnemies) {
            const p = enemy.node.position;
            const dx = p.x - ox;
            const dy = p.y - oy;
            if (dx * dx + dy * dy > radiusSq) {
                continue;
            }
            enemy.applyDamage(damage);
            enemy.applyFreeze(dish.freezeDurationSec ?? 0);
            this.hitCount++;
            this.dealt += damage;
        }
    }

    /** 当前等级伤害 = 基础 × 每级倍率 × 被动加成 */
    public damageOf(dish: DishConfig): number {
        return dish.damage * Math.pow(dish.damageGrowthPerLevel, this.level - 1) * UpgradeState.damageMul;
    }

    /** 当前等级冷却 = 基础 × 每级倍率 × 被动加成 */
    public cooldownOf(dish: DishConfig): number {
        return dish.cooldownSec * Math.pow(dish.cooldownGrowthPerLevel, this.level - 1) * UpgradeState.cooldownMul;
    }

    /** 读 Config 的冰啤酒配置 */
    private dishConfig(): DishConfig | null {
        for (const dish of DISHES) {
            if (dish.id === IcedBeer.DISH_ID) {
                return dish;
            }
        }
        return null;
    }

    /** 范围表现：挂在玩家节点下，随玩家移动 */
    private drawRing(): void {
        if (!this.owner) {
            return;
        }
        const dish = this.dishConfig();
        const radius = dish?.radius ?? 0;
        const node = new Node('IcedBeerRing');
        const transform = node.addComponent(UITransform);
        transform.setContentSize(radius * 2, radius * 2);
        const graphics = node.addComponent(Graphics);
        graphics.strokeColor = COLOR_RING;
        graphics.lineWidth = 6;
        graphics.circle(0, 0, radius);
        graphics.stroke();
        this.owner.addChild(node);
    }
}
