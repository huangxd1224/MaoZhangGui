/**
 * 大蒜瓣（环绕）—— Step 5
 *
 * 行为（config DISHES.garlic）：type = orbit
 *   - orbitCount 瓣蒜绕着玩家转，半径 orbitRadius，角速度 orbitSpeedDegPerSec；
 *   - 每 orbitHitIntervalSec 秒做一次碰撞判定：命中的敌人吃 damage 伤害
 *     并被击退 knockback 像素（沿远离蒜瓣的方向）；
 *   - 等级提升 → 伤害按 damageGrowthPerLevel 递增；被动加成从 UpgradeState 读。
 *
 * 红线：数值全读 Config；判定用距离平方；不用物理引擎。
 */
import { _decorator, Component, Node, Graphics, Color, UITransform } from 'cc';
import { DISHES, DishConfig, PROTOTYPE_ONLY } from '../Config';
import { UpgradeState } from '../core/UpgradeState';
import { EnemySpawner } from '../enemy/EnemySpawner';
import { DishWeapon } from './DishWeapon';

const { ccclass } = _decorator;

/** 大蒜瓣配色（视觉常量） */
const COLOR_GARLIC = new Color(238, 236, 214, 255);
/** 大蒜瓣边长（视觉常量） */
const GARLIC_SIZE = 16;

@ccclass('Garlic')
export class Garlic extends Component implements DishWeapon {
    /** 对应 Config 的菜品 id */
    public static readonly DISH_ID = 'garlic';

    /** 玩家节点 */
    private owner: Node | null = null;
    /** 敌人来源 */
    private spawner: EnemySpawner | null = null;
    /** 等级 */
    private level = 1;
    /** 当前环绕角度（度） */
    private angle = 0;
    /** 命中判定计时 */
    private hitTimer = 0;
    /** 累计命中次数 */
    private hitCount = 0;
    /** 累计伤害 */
    private dealt = 0;
    /** 蒜瓣节点 */
    private readonly petals: Node[] = [];

    /** 装配 */
    public setup(owner: Node, spawner: EnemySpawner): void {
        this.owner = owner;
        this.spawner = spawner;
        this.buildPetals();
    }

    public get dishId(): string {
        return Garlic.DISH_ID;
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
        // 角度推进（度/秒 → 弧度）
        const speed = dish.orbitSpeedDegPerSec ?? 0;
        this.angle = (this.angle + speed * dt) % 360;

        // 瓣的位置（相对玩家）
        const radius = (dish.orbitRadius ?? 0) * UpgradeState.areaMul;
        const count = Math.max(1, dish.orbitCount ?? 1);
        for (let i = 0; i < this.petals.length; i++) {
            const rad = ((this.angle + (360 / count) * i) * Math.PI) / 180;
            this.petals[i].setPosition(Math.cos(rad) * radius, Math.sin(rad) * radius, 0);
        }

        // 命中判定（固定间隔，避免每帧重复命中同一敌人）
        this.hitTimer += dt;
        if (this.hitTimer < PROTOTYPE_ONLY.orbitHitIntervalSec) {
            return;
        }
        this.hitTimer = 0;
        this.checkHits(dish);
    }

    /**
     * 命中判定：敌人进入**环绕圈**（到玩家距离 ≤ orbitRadius）即被蒜瓣拍到。
     *
     * 为什么不是「瓣的边缘碰到敌人」：
     *   敌人会贴到玩家身边停下（自身半径 + 玩家半径 ≈ 48px），
     *   而 config 的 orbitRadius 是 95 —— 若按几何碰撞判，
     *   瓣在 95px 的圆周上、敌人在 48px 处，两者最近也差 47px，永远打不中。
     *   所以判「是否进入环绕圈」，瓣的旋转只负责表现与击退方向。
     */
    private checkHits(dish: DishConfig): void {
        const owner = this.owner;
        const spawner = this.spawner;
        if (!owner || !spawner) {
            return;
        }
        const damage = this.damageOf(dish);
        const knockback = dish.knockback ?? 0;
        const orbitRadius = (dish.orbitRadius ?? 0) * UpgradeState.areaMul;
        const ringSq = orbitRadius * orbitRadius;

        const ownerPos = owner.position;
        // 击退来源：取第一瓣的位置
        const petal = this.petals.length > 0 ? this.petals[0] : null;
        const px = ownerPos.x + (petal ? petal.position.x : 0);
        const py = ownerPos.y + (petal ? petal.position.y : 0);

        for (const enemy of spawner.aliveEnemies) {
            const ep = enemy.node.position;
            const dx = ep.x - ownerPos.x;
            const dy = ep.y - ownerPos.y;
            if (dx * dx + dy * dy > ringSq) {
                continue;
            }
            enemy.applyDamage(damage);
            if (knockback > 0) {
                enemy.applyKnockback(knockback, px, py);
            }
            this.hitCount++;
            this.dealt += damage;
        }
    }

    /** 当前等级伤害 = 基础 × 每级倍率 × 被动加成 */
    public damageOf(dish: DishConfig): number {
        return dish.damage * Math.pow(dish.damageGrowthPerLevel, this.level - 1) * UpgradeState.damageMul;
    }

    /** 读 Config 的大蒜瓣配置 */
    private dishConfig(): DishConfig | null {
        for (const dish of DISHES) {
            if (dish.id === Garlic.DISH_ID) {
                return dish;
            }
        }
        return null;
    }

    /** 建蒜瓣节点（挂在玩家节点下，随玩家移动） */
    private buildPetals(): void {
        if (!this.owner) {
            return;
        }
        const dish = this.dishConfig();
        const count = Math.max(1, dish?.orbitCount ?? 1);
        for (let i = 0; i < count; i++) {
            const node = new Node(`GarlicPetal${i}`);
            const transform = node.addComponent(UITransform);
            transform.setContentSize(GARLIC_SIZE, GARLIC_SIZE);
            const graphics = node.addComponent(Graphics);
            graphics.fillColor = COLOR_GARLIC;
            graphics.rect(-GARLIC_SIZE / 2, -GARLIC_SIZE / 2, GARLIC_SIZE, GARLIC_SIZE);
            graphics.fill();
            this.owner.addChild(node);
            this.petals.push(node);
        }
    }
}
