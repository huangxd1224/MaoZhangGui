/**
 * 食材掉落与拾取 —— Step 4
 *
 * 职责（03 文档 Step 4）：
 *   1. 敌人死亡 → 在原地掉一个食材（经验 + 金币，数值读 Config 的敌人配置）；
 *   2. 玩家走近（拾取半径读 GLOBAL.playerPickupRadius）→ 自动拾取、加经验、加金币；
 *   3. 掉落物走对象池，运行期不 instantiate；
 *   4. 拾取判定用距离平方，不用物理引擎。
 */
import { _decorator, Component, Node } from 'cc';
import { GLOBAL, PROTOTYPE_ONLY } from '../Config';
import { PoolUtil } from '../core/PoolUtil';
import { UpgradeState } from '../core/UpgradeState';
import { GameManager } from '../core/GameManager';
import { Enemy } from '../enemy/Enemy';
import { PlayerStats } from '../player/PlayerStats';
import { FoodDrop } from './FoodDrop';

const { ccclass } = _decorator;

@ccclass('DropManager')
export class DropManager extends Component {
    /** 玩家节点 */
    private player: Node | null = null;
    /** 玩家属性（经验 / 金币结算入口） */
    private stats: PlayerStats | null = null;
    /** 掉落物对象池 */
    private pool: PoolUtil<Node> | null = null;
    /** 当前在场的掉落物 */
    private readonly activeDrops: FoodDrop[] = [];
    /** 累计掉落次数（自检用） */
    private droppedCount = 0;

    /**
     * 装配。
     * @param player 玩家节点
     * @param stats 玩家属性
     */
    public setup(player: Node | null, stats: PlayerStats | null): void {
        this.player = player;
        this.stats = stats;
        this.pool = new PoolUtil<Node>(
            () => FoodDrop.createNode(this.node, PROTOTYPE_ONLY.dropSize),
            PROTOTYPE_ONLY.dropPoolSize,
        );
    }

    /**
     * 敌人死亡 → 掉食材。
     * @param enemy 刚死的敌人（enemy.enemyConfig 保留着，可读 expDrop / coins）
     */
    public onEnemyKilled(enemy: Enemy): void {
        if (!this.pool) {
            return;
        }
        const config = enemy.enemyConfig;
        if (!config) {
            return;
        }
        const big = config.expDrop === 'big';
        const exp = big ? GLOBAL.expBig : GLOBAL.expNormal;
        const coins = config.coins;
        if (exp <= 0 && coins <= 0) {
            return;
        }
        const node = this.pool.acquire();
        const drop = node.getComponent(FoodDrop) ?? node.addComponent(FoodDrop);
        const pos = enemy.node.position;
        node.setPosition(pos.x, pos.y, pos.z);
        drop.setup(exp, coins, big, this.pool);
        this.activeDrops.push(drop);
        this.droppedCount++;
    }

    protected update(dt: number): void {
        if (!this.player || !this.stats || this.activeDrops.length === 0) {
            return;
        }
        // 升级面板弹出时游戏暂停
        if (GameManager.paused) {
            return;
        }
        const pickupRadius = GLOBAL.playerPickupRadius * UpgradeState.pickupMul;
        const pickupSq = pickupRadius * pickupRadius;
        const magnetRadius = PROTOTYPE_ONLY.magnetRadius;
        const magnetSq = magnetRadius * magnetRadius;
        const playerPos = this.player.position;
        for (let i = this.activeDrops.length - 1; i >= 0; i--) {
            const drop = this.activeDrops[i];
            const pos = drop.node.position;
            const dx = playerPos.x - pos.x;
            const dy = playerPos.y - pos.y;
            const distSq = dx * dx + dy * dy;

            if (distSq <= pickupSq) {
                // 拾取：加经验（被动加成）+ 加金币
                const exp = Math.round(drop.exp * UpgradeState.expMul);
                const coins = Math.round(drop.coins * UpgradeState.coinsMul);
                this.stats.addExp(exp);
                this.stats.addCoins(coins);
                drop.recycle();
                this.activeDrops.splice(i, 1);
                continue;
            }

            // 磁吸：食材飞向玩家。
            // 没有这一步，站在原地时食材会掉在远处（怪在路上就被远程打死），
            // 玩家永远够不到 → 经验条不涨。
            if (distSq <= magnetSq) {
                const dist = Math.sqrt(distSq);
                if (dist > 0) {
                    const step = PROTOTYPE_ONLY.magnetSpeed * dt;
                    drop.node.setPosition(pos.x + (dx / dist) * step, pos.y + (dy / dist) * step, pos.z);
                }
            }
        }
    }

    // ==================== 对外可查状态（自检用） ====================

    /** 当前在场掉落物数量 */
    public get dropCount(): number {
        return this.activeDrops.length;
    }

    /** 累计掉落数量（自检用） */
    public get droppedTotal(): number {
        return this.droppedCount;
    }
}
