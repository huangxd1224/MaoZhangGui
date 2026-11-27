/**
 * 对局流程的数据结构 —— Step 7
 *
 * 单独成文件，避免 GameManager 与各 UI 面板互相 import 形成循环依赖。
 */

/** 对局状态 */
export type RunState = 'battle' | 'break' | 'result';

/** 结算面板要显示的数据 */
export interface RunSummary {
    /** 是否胜利 */
    victory: boolean;
    /** 本局用时（秒） */
    elapsedSec: number;
    /** 击杀数 */
    kills: number;
    /** 剩余金币 */
    coins: number;
    /** 到达的波次 */
    wave: number;
    /** 胜负原因文案 */
    reason: string;
}

/** 摆摊面板接口（由 StallPanel 实现） */
export interface StallPanelPort {
    /** 打开摆摊 UI（remainingSec = 间歇剩余秒数） */
    open(remainingSec: number): void;
    /** 关闭摆摊 UI */
    close(): void;
}

/** 结算面板接口（由 GameResultPanel 实现） */
export interface ResultPanelPort {
    /** 显示结算 */
    show(summary: RunSummary): void;
}
