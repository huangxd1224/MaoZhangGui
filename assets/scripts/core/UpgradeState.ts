/**
 * 被动加成汇总 —— Step 5
 *
 * 职责：把「三选一里选到的被动」按**层数**汇总成各系统要用的系数。
 *       被动定义读 Config.PASSIVES（策划表：每层效果 perStack、最多 maxStacks 层）。
 *
 * 被动 id 与实际效果的对应（策划表的语义）：
 *   speed  移速       → 玩家移速倍率
 *   pickup 拾取范围   → 拾取半径倍率
 *   maxhp  最大生命   → Step 7 玩家血量（先记录层数）
 *   attack 攻击       → 伤害倍率
 *   haste  急速       → 冷却倍率（perStack 为负 → 冷却缩减）
 *   area   扩张       → 光环/冰冻/环绕半径倍率
 *   coins  招财       → 金币倍率
 *   exp    慧眼       → 经验倍率
 */
import { PASSIVES, PassiveConfig } from '../Config';

export class UpgradeState {
    /** 被动 id → 已叠加层数 */
    private static readonly stacks = new Map<string, number>();

    /**
     * 叠加一层被动。
     * @param passive 被动配置
     * @returns 是否成功叠加（已达上限返回 false）
     */
    public static addPassive(passive: PassiveConfig): boolean {
        const current = this.stacks.get(passive.id) ?? 0;
        if (current >= passive.maxStacks) {
            return false;
        }
        this.stacks.set(passive.id, current + 1);
        return true;
    }

    /** 某被动的当前层数 */
    public static stackOf(passiveId: string): number {
        return this.stacks.get(passiveId) ?? 0;
    }

    /** 已选被动（自检用：id + 层数） */
    public static get passiveStacks(): { id: string; stacks: number }[] {
        const result: { id: string; stacks: number }[] = [];
        for (const passive of PASSIVES) {
            const count = this.stackOf(passive.id);
            if (count > 0) {
                result.push({ id: passive.id, stacks: count });
            }
        }
        return result;
    }

    /** 伤害倍率 = 1 + 攻击层数 × 每层加成 */
    public static get damageMul(): number {
        return 1 + this.sumById('attack');
    }

    /** 冷却倍率 = 1 + 急速层数 × 每层加成（perStack 为负 → 冷却缩减，下限 0.25） */
    public static get cooldownMul(): number {
        return Math.max(0.25, 1 + this.sumById('haste'));
    }

    /** 经验倍率 = 1 + 慧眼层数 × 每层加成 */
    public static get expMul(): number {
        return 1 + this.sumById('exp');
    }

    /** 拾取半径倍率 = 1 + 拾取范围层数 × 每层加成 */
    public static get pickupMul(): number {
        return 1 + this.sumById('pickup');
    }

    /** 金币倍率 = 1 + 招财层数 × 每层加成 */
    public static get coinsMul(): number {
        return 1 + this.sumById('coins');
    }

    /** 范围倍率 = 1 + 扩张层数 × 每层加成 */
    public static get areaMul(): number {
        return 1 + this.sumById('area');
    }

    /** 移速倍率 = 1 + 移速层数 × 每层加成 */
    public static get speedMul(): number {
        return 1 + this.sumById('speed');
    }

    /** 重置（重新开局用） */
    public static reset(): void {
        this.stacks.clear();
    }

    /** 某被动 id 的加成总值（层数 × 每层效果） */
    private static sumById(passiveId: string): number {
        const passive = PASSIVES.find((p) => p.id === passiveId);
        if (!passive) {
            return 0;
        }
        return this.stackOf(passiveId) * passive.perStack;
    }
}
