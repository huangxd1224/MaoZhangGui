/**
 * 场景装配 —— Step 2 / Step 3 / Step 4
 *
 * 职责：把「场景里已摆好的空节点」与「脚本组件」接起来：
 *   Actors/Player  → 挂 Player（Step 2）+ PlayerStats（Step 4：经验/金币）
 *   UI/Joystick     → 挂 Joystick，并把摇杆方向交给 Player（Step 2）
 *   Camera          → 挂 CameraFollow，目标为 Player（Step 2）
 *   Actors/Enemies  → 运行时创建的敌人容器 + EnemySpawner（Step 3）
 *   Actors/Weapons  → 运行时创建的武器容器 + WeaponManager（Step 4）
 *   Canvas/Drops    → 挂 DropManager（Step 4：死亡掉食材 + 走近自动拾取）
 *   Canvas/UI       → 挂 HudStatus（Step 4：经验条 / 金币刷新）
 *
 * 这样组件不需要写进场景的 uuid 引用，场景文件保持纯灰盒结构。
 */
import { Node, UITransform } from 'cc';
import { Player } from '../player/Player';
import { PlayerStats } from '../player/PlayerStats';
import { Joystick } from '../ui/Joystick';
import { HudStatus } from '../ui/HudStatus';
import { CameraFollow } from '../camera/CameraFollow';
import { EnemySpawner } from '../enemy/EnemySpawner';
import { WeaponManager } from '../weapon/WeaponManager';
import { DropManager } from '../drop/DropManager';
import { DEFAULT_LAYER, UI_2D_LAYER } from './Layers';

export class SceneSetup {
    /** 在 Canvas 节点下完成 Step 2 / Step 3 / Step 4 的组件装配 */
    public static setup(canvas: Node): void {
        const playerNode = canvas.getChildByPath('Actors/Player');
        if (playerNode) {
            const player = playerNode.getComponent(Player) ?? playerNode.addComponent(Player);
            const joystickNode = canvas.getChildByPath('UI/Joystick');
            if (joystickNode) {
                const joystick = joystickNode.getComponent(Joystick) ?? joystickNode.addComponent(Joystick);
                player.joystick = joystick;
            }
        }

        const cameraNode = canvas.getChildByName('Camera');
        if (cameraNode) {
            const follow = cameraNode.getComponent(CameraFollow) ?? cameraNode.addComponent(CameraFollow);
            if (playerNode) {
                follow.target = playerNode;
            }
        }

        const spawner = SceneSetup.setupEnemySpawner(canvas, playerNode);
        SceneSetup.setupWeapons(canvas, playerNode, spawner);
        SceneSetup.setupDrops(canvas, playerNode, spawner);
    }

    /**
     * Step 3：建敌人容器并挂上刷怪器。
     * 容器放在 Actors 下（与玩家同级），层设为 DEFAULT —— 世界内容由主相机渲染，
     * HUD 层（UI_2D）由固定的 UI 相机渲染，两者互不干扰。
     */
    private static setupEnemySpawner(canvas: Node, playerNode: Node | null): EnemySpawner | null {
        const actorsNode = canvas.getChildByPath('Actors');
        if (!actorsNode) {
            return null;
        }
        let enemiesRoot = actorsNode.getChildByName('Enemies');
        if (!enemiesRoot) {
            enemiesRoot = new Node('Enemies');
            enemiesRoot.layer = DEFAULT_LAYER;
            actorsNode.addChild(enemiesRoot);
            enemiesRoot.addComponent(UITransform);
        }
        const spawner = enemiesRoot.getComponent(EnemySpawner) ?? enemiesRoot.addComponent(EnemySpawner);
        const stallNode = canvas.getChildByPath('World/Stall');
        spawner.setup(enemiesRoot, playerNode, stallNode);
        return spawner;
    }

    /**
     * Step 4：建武器容器并挂上 WeaponManager（烤串从玩家位置发射）。
     */
    private static setupWeapons(canvas: Node, playerNode: Node | null, spawner: EnemySpawner | null): void {
        if (!playerNode || !spawner) {
            return;
        }
        const actorsNode = canvas.getChildByPath('Actors');
        if (!actorsNode) {
            return;
        }
        let weaponsRoot = actorsNode.getChildByName('Weapons');
        if (!weaponsRoot) {
            weaponsRoot = new Node('Weapons');
            weaponsRoot.layer = DEFAULT_LAYER;
            actorsNode.addChild(weaponsRoot);
            weaponsRoot.addComponent(UITransform);
        }
        const manager = weaponsRoot.getComponent(WeaponManager) ?? weaponsRoot.addComponent(WeaponManager);
        manager.setup(playerNode, spawner);
    }

    /**
     * Step 4：掉落与拾取。
     *  - Canvas/Drops 是场景里已有的空节点，直接挂 DropManager；
     *  - 玩家节点挂 PlayerStats（经验 / 金币）；
     *  - 敌人死亡 → 刷怪器的 deathListeners → 掉食材。
     */
    private static setupDrops(canvas: Node, playerNode: Node | null, spawner: EnemySpawner | null): void {
        const dropsNode = canvas.getChildByPath('Drops');
        if (!dropsNode || !playerNode) {
            return;
        }
        const stats = playerNode.getComponent(PlayerStats) ?? playerNode.addComponent(PlayerStats);
        const dropManager = dropsNode.getComponent(DropManager) ?? dropsNode.addComponent(DropManager);
        dropManager.setup(playerNode, stats);
        if (spawner) {
            spawner.deathListeners.push((enemy) => dropManager.onEnemyKilled(enemy));
        }

        // HUD 刷新（经验条 / 金币）
        const uiNode = canvas.getChildByPath('UI');
        if (uiNode) {
            let hudNode = uiNode.getChildByName('HudStatus');
            if (!hudNode) {
                hudNode = new Node('HudStatus');
                // 新建节点默认在 DEFAULT（世界层），HUD 必须放在 UI_2D 层才被 UI 相机渲染
                hudNode.layer = UI_2D_LAYER;
                uiNode.addChild(hudNode);
                hudNode.addComponent(UITransform);
            }
            const hud = hudNode.getComponent(HudStatus) ?? hudNode.addComponent(HudStatus);
            hud.setup(stats);
        }
    }
}
