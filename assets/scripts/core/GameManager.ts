/**
 * 游戏总控（对局状态机 + 波次 + 升级触发）—— Step 5 / Step 7
 *
 * 职责：
 *   1. **对局状态机**（Step 7）：
 *      battle（战斗）→ break（间歇摆摊）→ battle … → result（结算）；
 *      第 GLOBAL.breakAfterWaves 波后进入 GLOBAL.breakDurationSec 秒的间歇，
 *      间歇期间停刷怪并弹出摆摊 UI；
 *   2. **胜负判定**：基地摊位血量归零 → 判负；撑满 GLOBAL.runWaves 波（或击杀精英）→ 判胜；
 *   3. 波次计时：每波 GLOBAL.waveDurationSec 秒推进一格 PROTOTYPE_WAVES；
 *   4. 升级三选一：经验满升级后弹出面板，面板弹出期间**游戏暂停**；
 *   5. 暂停用静态标志实现（各系统在自己的 update 开头检查），
 *      不用 cc.director.pause()，这样面板自身与 UI 相机仍可正常刷新。
 *
 * 数值纪律：波次时长/间歇时长/总波数读 GLOBAL，波次参数读 PROTOTYPE_WAVES。
 */
import { _decorator, Component } from 'cc';
import { GLOBAL, PROTOTYPE_WAVES, WaveConfig } from '../Config';
import { PlayerStats } from '../player/PlayerStats';
import { UpgradePanel } from '../upgrade/UpgradePanel';
import { UpgradeState } from './UpgradeState';
import { RunState, RunSummary, ResultPanelPort, StallPanelPort } from './RunTypes';

const { ccclass } = _decorator;

/**
 * 刷怪器的波次接口（由 EnemySpawner 实现）。
 * 用接口而不是直接 import 具体类，是为了避免
 * 「EnemySpawner ↔ GameManager」循环依赖（EnemySpawner 需要读 GameManager.paused）。
 */
export interface WaveTarget {
    /** 切换到新的波次参数 */
    setWave(wave: WaveConfig): void;
    /** 是否允许刷怪（Step 7：间歇期间停刷） */
    setSpawningEnabled(enabled: boolean): void;
}

@ccclass('GameManager')
export class GameManager extends Component {
    /** 暂停标志（静态）：升级面板弹出时为 true */
    private static pausedFlag = false;

    /** 当前是否暂停 */
    public static get paused(): boolean {
        return GameManager.pausedFlag;
    }

    /** 设置暂停（各系统的 update 开头检查这个标志） */
    public static setPaused(paused: boolean): void {
        GameManager.pausedFlag = paused;
    }

    /** 刷怪器 */
    private spawner: WaveTarget | null = null;
    /** 玩家属性（升级信号来源） */
    private stats: PlayerStats | null = null;
    /** 升级面板 */
    private panel: UpgradePanel | null = null;
    /** 摆摊面板（Step 7） */
    private stallPanel: StallPanelPort | null = null;
    /** 结算面板（Step 7） */
    private resultPanel: ResultPanelPort | null = null;

    /** 当前波次在 PROTOTYPE_WAVES 中的下标 */
    private waveIndex = 0;
    /** 当前波次已过时间 */
    private waveTimer = 0;
    /** 对局状态 */
    private state: RunState = 'battle';
    /** 间歇已过时间 */
    private breakTimer = 0;
    /** 本局用时（秒） */
    private runTime = 0;
    /** 本局击杀数 */
    private killCount = 0;
    /** 是否已出结算 */
    private finished = false;

    /**
     * 装配。
     * @param spawner 刷怪器
     * @param stats 玩家属性
     * @param panel 升级面板
     */
    public setup(spawner: WaveTarget, stats: PlayerStats, panel: UpgradePanel): void {
        this.spawner = spawner;
        this.stats = stats;
        this.panel = panel;
        // 从第 1 波开始
        this.waveIndex = 0;
        this.waveTimer = 0;
        this.state = 'battle';
        this.breakTimer = 0;
        this.runTime = 0;
        this.killCount = 0;
        this.finished = false;
        this.spawner.setWave(PROTOTYPE_WAVES[0]);
        this.spawner.setSpawningEnabled(true);
    }

    /** 注入摆摊面板 */
    public setStallPanel(panel: StallPanelPort | null): void {
        this.stallPanel = panel;
    }

    /** 注入结算面板 */
    public setResultPanel(panel: ResultPanelPort | null): void {
        this.resultPanel = panel;
    }

    protected update(dt: number): void {
        if (GameManager.pausedFlag) {
            return;
        }
        if (this.state === 'result') {
            return;
        }
        this.runTime += dt;
        if (this.state === 'battle') {
            this.updateWave(dt);
        } else if (this.state === 'break') {
            this.updateBreak(dt);
        }
        this.checkUpgrade();
    }

    /** 波次推进 */
    private updateWave(dt: number): void {
        this.waveTimer += dt;
        while (this.waveTimer >= GLOBAL.waveDurationSec) {
            this.waveTimer -= GLOBAL.waveDurationSec;
            this.onWaveFinished();
            // 判胜/进间歇后状态变了，退出推进
            if (this.state !== 'battle') {
                return;
            }
        }
    }

    /** 间歇计时（25 秒后继续下一波） */
    private updateBreak(dt: number): void {
        this.breakTimer += dt;
        if (this.breakTimer >= GLOBAL.breakDurationSec) {
            this.endBreak();
        }
    }

    /** 一波打完 */
    private onWaveFinished(): void {
        const finishedWave = this.waveIndex + 1;
        // 第 3/6/9 波后进入间歇摆摊
        if (GLOBAL.breakAfterWaves.indexOf(finishedWave) >= 0) {
            this.enterBreak();
            return;
        }
        // 撑满总波数 → 判胜
        if (finishedWave >= GLOBAL.runWaves) {
            this.victory('守住了全部波次');
            return;
        }
        this.advanceWave();
    }

    /** 进入间歇：停刷怪 + 弹摆摊 UI */
    private enterBreak(): void {
        this.state = 'break';
        this.breakTimer = 0;
        if (this.spawner) {
            this.spawner.setSpawningEnabled(false);
        }
        if (this.stallPanel) {
            this.stallPanel.open(GLOBAL.breakDurationSec);
        }
    }

    /** 间歇结束：恢复刷怪 + 关摆摊 UI + 进下一波 */
    private endBreak(): void {
        this.state = 'battle';
        if (this.spawner) {
            this.spawner.setSpawningEnabled(true);
        }
        if (this.stallPanel) {
            this.stallPanel.close();
        }
        this.advanceWave();
    }

    /** 进入下一波（超出表则判胜） */
    private advanceWave(): void {
        if (!this.spawner) {
            return;
        }
        const next = this.waveIndex + 1;
        if (next >= PROTOTYPE_WAVES.length) {
            this.victory('守住了全部波次');
            return;
        }
        this.waveIndex = next;
        this.spawner.setWave(PROTOTYPE_WAVES[next]);
    }

    /** 有待处理的升级 → 弹三选一（面板会暂停游戏） */
    private checkUpgrade(): void {
        if (!this.stats || !this.panel) {
            return;
        }
        if (this.stats.pendingUpgrades > 0 && !this.panel.visible) {
            this.panel.open();
        }
    }

    // ==================== 胜负 ====================

    /** 判负（基地摊位被啃光） */
    public defeat(reason: string): void {
        if (this.finished) {
            return;
        }
        this.finished = true;
        this.state = 'result';
        if (this.spawner) {
            this.spawner.setSpawningEnabled(false);
        }
        this.showResult(false, reason);
    }

    /** 判胜（撑满波次 / 击杀精英） */
    public victory(reason: string): void {
        if (this.finished) {
            return;
        }
        this.finished = true;
        this.state = 'result';
        if (this.spawner) {
            this.spawner.setSpawningEnabled(false);
        }
        this.showResult(true, reason);
    }

    /** 敌人死亡计数 */
    public onEnemyKilled(): void {
        this.killCount++;
    }

    /** 弹出结算面板 */
    private showResult(victory: boolean, reason: string): void {
        const summary: RunSummary = {
            victory,
            elapsedSec: Math.round(this.runTime),
            kills: this.killCount,
            coins: this.stats ? this.stats.coins : 0,
            wave: this.waveNumber,
            reason,
        };
        if (this.resultPanel) {
            this.resultPanel.show(summary);
        }
    }

    // ==================== 对外可查状态（自检用） ====================

    /** 当前波次序号（从 1 开始） */
    public get waveNumber(): number {
        return this.waveIndex + 1;
    }

    /** 当前波次已过时间 */
    public get waveElapsed(): number {
        return this.waveTimer;
    }

    /** 当前波次的血量倍率 */
    public get currentHpMul(): number {
        const wave = PROTOTYPE_WAVES[this.waveIndex];
        return wave ? wave.hpMul : 1;
    }

    /** 对局状态 */
    public get runState(): RunState {
        return this.state;
    }

    /** 间歇剩余秒数（不在间歇时为 0） */
    public get breakRemainSec(): number {
        if (this.state !== 'break') {
            return 0;
        }
        return Math.max(0, Math.ceil(GLOBAL.breakDurationSec - this.breakTimer));
    }

    /** 本局用时（秒） */
    public get elapsedSec(): number {
        return this.runTime;
    }

    /** 本局击杀数 */
    public get kills(): number {
        return this.killCount;
    }

    /** 是否已分出胜负 */
    public get isFinished(): boolean {
        return this.finished;
    }

    /** 已选被动及其层数（自检用） */
    public get passiveStacks(): { id: string; stacks: number }[] {
        return UpgradeState.passiveStacks;
    }
}
