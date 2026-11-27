/**
 * 摊位数据结构 —— Step 7
 *
 * 单独成文件是为了让 Enemy 与 StallManager 互相引用时不产生循环依赖：
 *   - Enemy 只认 StallProvider 接口（不 import StallManager）；
 *   - StallManager 实现该接口。
 */

/** 一个可被啃的摊位（基地或防御摊） */
export interface StallTarget {
    /** 摊位 id：基地固定 'base_stall'，防御摊用 Config 里的摊位 id */
    id: string;
    /** 摊位中心坐标（与 Canvas 本地坐标一致） */
    x: number;
    y: number;
    /** 接触判定半径（摊位半边长 + 敌人半径） */
    touchRadius: number;
    /** 是否是基地（被啃光 → 判负） */
    isBase: boolean;
}

/** 敌人侧用到的摊位接口（由 StallManager 实现） */
export interface StallProvider {
    /** 找敌人接触范围内的摊位（最近的） */
    findStallTarget(x: number, y: number): StallTarget | null;
    /** 啃摊位：按敌人是否精英决定扣血 */
    attackStall(target: StallTarget, elite: boolean): void;
}
