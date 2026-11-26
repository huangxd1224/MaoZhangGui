/**
 * 菜品管理 + 自动攻击调度 —— Step 4 / Step 5 / Step 6
 *
 * 职责：
 *   - 持有玩家「已拥有的菜品」，每帧推进各自的冷却，到点开火；
 *   - 支持四种原型菜品（config DISHES 里的 inPrototype 项）：
 *       烤串 projectile / 辣椒粉 aura_dot / 大蒜瓣 orbit / 冰啤酒 freeze_aoe；
 *   - 提供升级接口（newDish / levelUp），供 Step 5 的三选一面板调用；
 *   - Step 6：菜谱进化（两道菜满级 → evolve），进化后两道基础菜退出武器栏；
 *   - 数值（伤害/冷却/穿透/弹速）一律读 Config，被动加成从 UpgradeState 读。
 */
import { _decorator, Component, Node } from 'cc';
import { DISHES, DishConfig, PROTOTYPE_ONLY, PROTOTYPE_RECIPES, RecipeConfig } from '../Config';
import { EnemySpawner } from '../enemy/EnemySpawner';
import { GameManager } from '../core/GameManager';
import { DishUpgradeTarget } from '../upgrade/UpgradePanel';
import { DishWeapon } from './DishWeapon';
import { Skewer } from './Skewer';
import { Chili } from './Chili';
import { Garlic } from './Garlic';
import { IcedBeer } from './IcedBeer';
import { Malatang } from './Malatang';

const { ccclass } = _decorator;

@ccclass('WeaponManager')
export class WeaponManager extends Component implements DishUpgradeTarget {
    /** 发射者（玩家） */
    private owner: Node | null = null;
    /** 敌人来源 */
    private spawner: EnemySpawner | null = null;
    /** 已拥有的武器组件 */
    private readonly weapons: DishWeapon[] = [];
    /** 菜品 id → 组件（升级时查找） */
    private readonly byDishId = new Map<string, DishWeapon>();
    /** 菜品 id → 等级 */
    private readonly levels = new Map<string, number>();

    /**
     * 装配。
     * @param owner 玩家节点
     * @param spawner 敌人来源
     */
    public setup(owner: Node, spawner: EnemySpawner): void {
        this.owner = owner;
        this.spawner = spawner;
        // 开局赠送的菜品（Config.PROTOTYPE_ONLY.initialWeapons）
        for (const dishId of PROTOTYPE_ONLY.initialWeapons) {
            this.addDish(dishId);
        }
    }

    protected update(dt: number): void {
        // 升级面板弹出时游戏暂停
        if (GameManager.paused) {
            return;
        }
        for (const weapon of this.weapons) {
            weapon.tick(dt);
        }
    }

    // ==================== 升级接口（DishUpgradeTarget） ====================

    /** 是否已拥有该菜 */
    public hasDish(dishId: string): boolean {
        return this.byDishId.has(dishId);
    }

    /** 已拥有的菜 id 列表 */
    public ownedDishIds(): string[] {
        return Array.from(this.byDishId.keys());
    }

    /** 该菜的当前等级（未拥有返回 0） */
    public dishLevel(dishId: string): number {
        return this.levels.get(dishId) ?? 0;
    }

    /**
     * 添加一道菜（Step 5 的三选一「新菜」走这里）。
     * @param dishId Config 里的菜品 id
     * @param level 等级（默认 1）
     */
    public addDish(dishId: string, level = 1): boolean {
        if (!this.owner || !this.spawner) {
            return false;
        }
        const dish = DISHES.find((d) => d.id === dishId);
        if (!dish || !dish.inPrototype) {
            return false;
        }
        // 已有则改为升级
        if (this.hasDish(dishId)) {
            return this.levelUp(dishId);
        }
        // 武器栏满（Step 6：武器栏 4 格）→ 不再接收新菜
        if (this.weapons.length >= PROTOTYPE_ONLY.weaponSlots) {
            return false;
        }
        const weapon = this.createWeapon(dish);
        if (!weapon) {
            return false;
        }
        weapon.setLevel(level);
        this.weapons.push(weapon);
        this.byDishId.set(dishId, weapon);
        this.levels.set(dishId, level);
        return true;
    }

    /**
     * 移除一道菜（Step 6：进化后两道基础菜退出武器栏）。
     * @param dishId 菜品 id
     */
    public removeDish(dishId: string): boolean {
        const weapon = this.byDishId.get(dishId);
        if (!weapon) {
            return false;
        }
        const index = this.weapons.indexOf(weapon);
        if (index >= 0) {
            this.weapons.splice(index, 1);
        }
        this.byDishId.delete(dishId);
        this.levels.delete(dishId);
        // 清理挂在玩家身上的表现节点（辣椒粉光环 / 大蒜瓣 / 冰冻环）
        if (weapon.dispose) {
            weapon.dispose();
        }
        const node = this.node.getChildByName(dishId);
        if (node) {
            node.destroy();
        }
        return true;
    }

    /**
     * 当前是否有可进化的配方（两道基础菜都已满级）。
     * Step 6：条件满足时，三选一里**必出**进化选项（不占随机权重）。
     */
    public canEvolve(): RecipeConfig | null {
        for (const recipe of PROTOTYPE_RECIPES) {
            const ready = recipe.from.every((id) => {
                const dish = DISHES.find((d) => d.id === id);
                return !!dish && this.hasDish(id) && this.dishLevel(id) >= dish.maxLevel;
            });
            if (ready) {
                return recipe;
            }
        }
        return null;
    }

    /**
     * 菜谱进化（Step 6）。
     * 条件：配方里的两道菜都已拥有且满级；
     * 结果：两道基础菜退出武器栏，换成进化后的新菜。
     * @param recipeId 配方 id（Config.RECIPES）
     */
    public evolve(recipeId: string): boolean {
        if (!this.owner || !this.spawner) {
            return false;
        }
        const recipe = PROTOTYPE_RECIPES.find((r) => r.id === recipeId);
        if (!recipe) {
            return false;
        }
        // 条件校验：from 的两道菜都满级
        for (const id of recipe.from) {
            const dish = DISHES.find((d) => d.id === id);
            if (!dish || !this.hasDish(id) || this.dishLevel(id) < dish.maxLevel) {
                return false;
            }
        }
        // 两道基础菜退出武器栏
        for (const id of recipe.from) {
            this.removeDish(id);
        }
        // 换上进化菜
        return this.addEvolutionDish(recipe);
    }

    /** 创建进化菜组件（进化菜不在 DISHES 里，单独走这条路径） */
    private addEvolutionDish(recipe: RecipeConfig): boolean {
        if (!this.owner || !this.spawner) {
            return false;
        }
        const node = new Node(recipe.id);
        this.node.addChild(node);
        const weapon = node.addComponent(Malatang);
        weapon.setup(this.owner, this.spawner, recipe);
        weapon.setLevel(1);
        this.weapons.push(weapon);
        this.byDishId.set(recipe.id, weapon);
        this.levels.set(recipe.id, 1);
        return true;
    }

    /**
     * 已有菜升一级（Step 5 的三选一「升级」走这里）。
     * @param dishId 菜品 id
     */
    public levelUp(dishId: string): boolean {
        const dish = DISHES.find((d) => d.id === dishId);
        const weapon = this.byDishId.get(dishId);
        if (!dish || !weapon) {
            return false;
        }
        const next = this.dishLevel(dishId) + 1;
        if (next > dish.maxLevel) {
            return false;
        }
        weapon.setLevel(next);
        this.levels.set(dishId, next);
        return true;
    }

    /** 按菜品类型创建武器组件 */
    private createWeapon(dish: DishConfig): DishWeapon | null {
        if (!this.owner || !this.spawner) {
            return null;
        }
        const node = new Node(dish.id);
        this.node.addChild(node);
        let weapon: DishWeapon | null = null;
        switch (dish.type) {
            case 'projectile': {
                const skewer = node.addComponent(Skewer);
                skewer.setup(this.owner, this.spawner);
                weapon = skewer;
                break;
            }
            case 'aura_dot': {
                const chili = node.addComponent(Chili);
                chili.setup(this.owner, this.spawner);
                weapon = chili;
                break;
            }
            case 'orbit': {
                const garlic = node.addComponent(Garlic);
                garlic.setup(this.owner, this.spawner);
                weapon = garlic;
                break;
            }
            case 'freeze_aoe': {
                const beer = node.addComponent(IcedBeer);
                beer.setup(this.owner, this.spawner);
                weapon = beer;
                break;
            }
            default:
                break;
        }
        if (!weapon) {
            node.destroy();
            return null;
        }
        return weapon;
    }

    // ==================== 对外可查状态（自检用） ====================

    /** 已拥有菜品数量（Step 5 三选一要占栏位） */
    public get weaponCount(): number {
        return this.weapons.length;
    }

    /** 已拥有菜品 id 列表（调试用） */
    public get weaponIds(): string[] {
        return this.ownedDishIds();
    }

    /** 累计开火次数（签子专用，自检用） */
    public get totalShots(): number {
        let sum = 0;
        for (const weapon of this.weapons) {
            if (weapon instanceof Skewer) {
                sum += weapon.firedCount;
            }
        }
        return sum;
    }

    /**
     * 进化菜统计（Step 6 自检用）：确认「全屏穿透 + 命中灼烧」真的在跑。
     */
    public get evolutionStats(): {
        dishId: string;
        level: number;
        hits: number;
        burnHits: number;
        shots: number;
        pierce: number;
        travel: number;
    } | null {
        for (const weapon of this.weapons) {
            if (weapon instanceof Malatang) {
                return {
                    dishId: weapon.dishId,
                    level: weapon.weaponLevel,
                    hits: weapon.hits,
                    burnHits: weapon.burnHits,
                    shots: weapon.firedCount,
                    pierce: PROTOTYPE_ONLY.evolutionPierce,
                    travel: PROTOTYPE_ONLY.evolutionMaxTravel,
                };
            }
        }
        return null;
    }

    /**
     * 每把菜的命中统计（自检用：确认四道菜都真的在生效）。
     */
    public get weaponStats(): { dishId: string; level: number; hits: number; damage: number }[] {
        const result: { dishId: string; level: number; hits: number; damage: number }[] = [];
        for (const weapon of this.weapons) {
            result.push({
                dishId: weapon.dishId,
                level: weapon.weaponLevel,
                hits: weapon.hits,
                damage: Math.round(weapon.damageDealt * 10) / 10,
            });
        }
        return result;
    }
}
