/**
 * 辣椒粉（光环灼烧）—— Step 5
 *
 * 行为（config DISHES.chili）：type = aura_dot
 *   - 以玩家为中心、半径 radius 的光环；
 *   - 每 cooldownSec 秒结算一次：范围内敌人吃 damage 伤害，并被灼烧
 *     （burnDps 每秒、持续 burnDurationSec 秒）；
 *   - 等级提升 → 伤害按 damageGrowthPerLevel 递增；被动加成从 UpgradeState 读。
 *
 * 红线：数值全读 Config；命中判定用距离平方；不用物理引擎。
 */
import { _decorator, Component, Node, Graphics, Color, UITransform } from 'cc';
import { DISHES, DishConfig } from '../Config';
import { UpgradeState } from '../core/UpgradeState';
import { EnemySpawner } from '../enemy/EnemySpawner';
import { DishWeapon } from './DishWeapon';

const { ccclass } = _decorator;

/** 光环配色（视觉常量） */
const COLOR_RING = new Color(226, 86, 62, 150);

@ccclass('Chili')
export class Chili extends Component implements DishWeapon {
    /** 对应 Config 的菜品 id */
    public static readonly DISH_ID = 'chili';

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
    /** 已应用的范围倍率（被动变化时重画光环） */
    private appliedAreaMul = 1;
    /** 光环节点 */
    private ringNode: Node | null = null;

    /** 装配 */
    public setup(owner: Node, spawner: EnemySpawner): void {
        this.owner = owner;
        this.spawner = spawner;
        this.drawRing();
    }

    public get dishId(): string {
        return Chili.DISH_ID;
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
        // 「扩张」被动会改范围 → 光环表现跟着重画
        if (this.appliedAreaMul !== UpgradeState.areaMul) {
            this.appliedAreaMul = UpgradeState.areaMul;
            this.drawRing();
        }
        this.timer += dt;
        const cooldown = this.cooldownOf(dish);
        if (this.timer < cooldown) {
            return;
        }
        this.timer -= cooldown;
        this.trigger(dish);
    }

    /** 结算一次光环 */
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
            enemy.applyBurn(dish.burnDps ?? 0, dish.burnDurationSec ?? 0);
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

    /** 读 Config 的辣椒粉配置 */
    private dishConfig(): DishConfig | null {
        for (const dish of DISHES) {
            if (dish.id === Chili.DISH_ID) {
                return dish;
            }
        }
        return null;
    }

    /** 光环表现：挂在玩家节点下，随玩家移动 */
    private drawRing(): void {
        if (!this.owner) {
            return;
        }
        const dish = this.dishConfig();
        const radius = (dish?.radius ?? 0) * UpgradeState.areaMul;
        if (!this.ringNode) {
            this.ringNode = new Node('ChiliRing');
            const transform = this.ringNode.addComponent(UITransform);
            transform.setContentSize(radius * 2, radius * 2);
            const graphics = this.ringNode.addComponent(Graphics);
            graphics.strokeColor = COLOR_RING;
            graphics.lineWidth = 6;
            this.owner.addChild(this.ringNode);
        }
        const graphics = this.ringNode.getComponent(Graphics);
        if (!graphics) {
            return;
        }
        graphics.clear();
        graphics.strokeColor = COLOR_RING;
        graphics.lineWidth = 6;
        graphics.circle(0, 0, radius);
        graphics.stroke();
    }
}
