/**
 * 游戏总控（波次 + 暂停 + 升级触发）—— Step 5
 *
 * 职责：
 *   1. 波次计时：每波 GLOBAL.waveDurationSec 秒推进一格 waves 表；
 *      血量倍率（hpMul）、刷怪间隔、敌人 mix 都由当前波次决定；
 *   2. 升级三选一：玩家经验满升级后弹出面板，面板弹出期间**游戏暂停**；
 *   3. 暂停用静态标志实现（各系统在自己的 update 开头检查），
 *      不用 cc.director.pause()，这样面板自身与 UI 相机仍可正常刷新。
 *
 * 数值纪律：波次时长读 GLOBAL，波次参数读 PROTOTYPE_WAVES（已做原型过滤与归一化）。
 */
import { _decorator, Component } from 'cc';
import { GLOBAL, PROTOTYPE_WAVES, WaveConfig } from '../Config';
import { PlayerStats } from '../player/PlayerStats';
import { UpgradePanel } from '../upgrade/UpgradePanel';
import { UpgradeState } from './UpgradeState';

const { ccclass } = _decorator;

/**
 * 刷怪器的波次接口（由 EnemySpawner 实现）。
 * 用接口而不是直接 import 具体类，是为了避免
 * 「EnemySpawner ↔ GameManager」循环依赖（EnemySpawner 需要读 GameManager.paused）。
 */
export interface WaveTarget {
    /** 切换到新的波次参数 */
    setWave(wave: WaveConfig): void;
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
    /** 当前波次在 PROTOTYPE_WAVES 中的下标 */
    private waveIndex = 0;
    /** 当前波次已过时间 */
    private waveTimer = 0;

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
        this.spawner.setWave(PROTOTYPE_WAVES[0]);
    }

    protected update(dt: number): void {
        if (GameManager.pausedFlag) {
            return;
        }
        this.updateWave(dt);
        this.checkUpgrade();
    }

    /** 波次推进 */
    private updateWave(dt: number): void {
        this.waveTimer += dt;
        while (this.waveTimer >= GLOBAL.waveDurationSec) {
            this.waveTimer -= GLOBAL.waveDurationSec;
            this.advanceWave();
        }
    }

    /** 进入下一波（超出表则停在最后一波，胜负判定属 Step 7） */
    private advanceWave(): void {
        if (!this.spawner) {
            return;
        }
        const next = this.waveIndex + 1;
        if (next >= PROTOTYPE_WAVES.length) {
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

    /** 已选被动及其层数（自检用） */
    public get passiveStacks(): { id: string; stacks: number }[] {
        return UpgradeState.passiveStacks;
    }
}
