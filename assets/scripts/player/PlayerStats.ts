/**
 * 玩家属性（经验 / 等级 / 金币）—— Step 4
 *
 * 职责：
 *   1. 接收拾取到的经验与金币；
 *   2. 经验满则升级（升级所需经验 = base + 当前等级 × perLevel，读 Config）；
 *   3. Step 5 会在「经验刚好满」时弹出三选一，这里只负责累积。
 */
import { _decorator, Component } from 'cc';
import { GLOBAL } from '../Config';

const { ccclass } = _decorator;

@ccclass('PlayerStats')
export class PlayerStats extends Component {
    /** 当前经验（升级后结余） */
    public exp = 0;
    /** 当前等级（0 = 未升级） */
    public level = 0;
    /** 累计金币 */
    public coins = 0;
    /**
     * 累计获得经验（只增不减）。
     *
     * 口径说明（Step 4 自检时问过）：
     *   - exp      = 当前条结余，已扣除升级消耗；
     *   - totalExp = 从头到尾拿到的经验总和（= 累计拾取的经验）；
     *   - 两者关系：totalExp = exp + Σ(已升级消耗)。
     */
    public totalExp = 0;
    /** 待处理的升级次数（三选一面板每选完一次减 1） */
    public pendingUpgrades = 0;

    /** 升到下一级所需经验 */
    public get expNeeded(): number {
        return GLOBAL.expToLevelBase + this.level * GLOBAL.expToLevelPerLevel;
    }

    /** 经验条进度（0~1） */
    public get expRatio(): number {
        const needed = this.expNeeded;
        return needed > 0 ? Math.min(1, this.exp / needed) : 0;
    }

    /** 加经验（会触发升级） */
    public addExp(amount: number): void {
        if (amount <= 0) {
            return;
        }
        this.totalExp += amount;
        this.exp += amount;
        // 可能一次拾取跨过多级
        while (this.exp >= this.expNeeded) {
            this.exp -= this.expNeeded;
            this.level++;
            this.pendingUpgrades++;
        }
    }

    /** 消耗一次待处理升级（三选一面板选完一个后调用） */
    public consumeUpgrade(): void {
        if (this.pendingUpgrades > 0) {
            this.pendingUpgrades--;
        }
    }

    /** 加金币 */
    public addCoins(amount: number): void {
        if (amount <= 0) {
            return;
        }
        this.coins += amount;
    }
}
