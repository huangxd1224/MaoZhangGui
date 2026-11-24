/**
 * 场景装配 —— Step 2 / Step 3
 *
 * 职责：把「场景里已摆好的空节点」与「脚本组件」接起来：
 *   Actors/Player  → 挂 Player
 *   UI/Joystick     → 挂 Joystick，并把摇杆方向交给 Player
 *   Camera          → 挂 CameraFollow，目标为 Player
 *   Actors/Enemies  → 运行时创建的敌人容器 + EnemySpawner（Step 3）
 *
 * 这样组件不需要写进场景的 uuid 引用，场景文件保持纯灰盒结构。
 */
import { Node, UITransform } from 'cc';
import { Player } from '../player/Player';
import { Joystick } from '../ui/Joystick';
import { CameraFollow } from '../camera/CameraFollow';
import { EnemySpawner } from '../enemy/EnemySpawner';
import { DEFAULT_LAYER } from './Layers';

export class SceneSetup {
    /** 在 Canvas 节点下完成 Step 2 / Step 3 的组件装配 */
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

        SceneSetup.setupEnemySpawner(canvas, playerNode);
    }

    /**
     * Step 3：建敌人容器并挂上刷怪器。
     * 容器放在 Actors 下（与玩家同级），层设为 DEFAULT —— 世界内容由主相机渲染，
     * HUD 层（UI_2D）由固定的 UI 相机渲染，两者互不干扰。
     */
    private static setupEnemySpawner(canvas: Node, playerNode: Node | null): void {
        const actorsNode = canvas.getChildByPath('Actors');
        if (!actorsNode) {
            return;
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
    }
}
