/**
 * 菜品管理 + 自动攻击调度 —— Step 4
 *
 * 职责（03 文档）：
 *   - 持有玩家「已拥有的菜品」（烤串开局就有，Step 5 的三选一会往里加）；
 *   - 每帧按各自的冷却推进，到点就开火；
 *   - 数值（伤害/冷却/穿透/弹速）一律读 Config 的 DISHES 表。
 *
 * 说明：原型期只实现烤串一种 projectile 武器；
 *       辣椒粉 / 大蒜瓣 / 冰啤酒属 Step 5，届时在这里按 type 分发。
 */
import { _decorator, Component, Node } from 'cc';
import { DISHES, PROTOTYPE_ONLY } from '../Config';
import { EnemySpawner } from '../enemy/EnemySpawner';
import { Skewer } from './Skewer';

const { ccclass } = _decorator;

@ccclass('WeaponManager')
export class WeaponManager extends Component {
    /** 发射者（玩家） */
    private owner: Node | null = null;
    /** 敌人来源 */
    private spawner: EnemySpawner | null = null;
    /** 已拥有的武器组件 */
    private readonly weapons: Skewer[] = [];

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
        for (const weapon of this.weapons) {
            weapon.tick(dt);
        }
    }

    /**
     * 添加一道菜（Step 5 的三选一也走这里）。
     * @param dishId Config 里的菜品 id
     * @param level 等级（默认 1）
     * @returns 是否成功添加
     */
    public addDish(dishId: string, level = 1): boolean {
        if (!this.owner || !this.spawner) {
            return false;
        }
        const dish = DISHES.find((d) => d.id === dishId);
        if (!dish) {
            return false;
        }
        // 已有则升级
        const existing = this.weapons.find((w) => w.node.name === dishId);
        if (existing) {
            existing.setLevel(level);
            return true;
        }
        if (dish.type === 'projectile') {
            const node = new Node(dishId);
            this.node.addChild(node);
            const weapon = node.addComponent(Skewer);
            weapon.setup(this.owner, this.spawner);
            weapon.setLevel(level);
            this.weapons.push(weapon);
            return true;
        }
        // 其他攻击类型属 Step 5（辣椒粉/大蒜瓣/冰啤酒），原型期先不实现
        return false;
    }

    /** 已拥有菜品数量（Step 5 三选一要占栏位） */
    public get weaponCount(): number {
        return this.weapons.length;
    }

    /** 已拥有菜品 id 列表（调试用） */
    public get weaponIds(): string[] {
        return this.weapons.map((w) => w.node.name);
    }

    /** 累计开火次数（自检用） */
    public get totalShots(): number {
        let sum = 0;
        for (const weapon of this.weapons) {
            sum += weapon.firedCount;
        }
        return sum;
    }
}
