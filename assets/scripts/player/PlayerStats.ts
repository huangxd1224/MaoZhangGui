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
        this.exp += amount;
        // 可能一次拾取跨过多级
        while (this.exp >= this.expNeeded) {
            this.exp -= this.expNeeded;
            this.level++;
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
