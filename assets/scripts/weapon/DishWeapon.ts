/**
 * 菜品武器的统一接口 —— Step 5
 *
 * WeaponManager 只认这个接口，不关心具体是签子、光环、环绕还是冰冻；
 * 新增菜品时实现它即可（辣椒粉 / 大蒜瓣 / 冰啤酒 已按此实现）。
 */
export interface DishWeapon {
    /** 对应 Config 里的菜品 id */
    readonly dishId: string;
    /** 每帧推进（各武器自己管冷却） */
    tick(dt: number): void;
    /** 设置等级 */
    setLevel(level: number): void;
    /** 当前等级 */
    readonly weaponLevel: number;
    /** 累计命中次数（自检用：确认这把菜真的在生效） */
    readonly hits: number;
    /** 累计造成伤害（自检用） */
    readonly damageDealt: number;
}
