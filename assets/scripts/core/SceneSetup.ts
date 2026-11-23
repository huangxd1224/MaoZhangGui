/**
 * 场景装配 —— Step 2
 *
 * 职责：把「场景里已摆好的空节点」与「脚本组件」接起来：
 *   Actors/Player  → 挂 Player
 *   UI/Joystick     → 挂 Joystick，并把摇杆方向交给 Player
 *   Camera          → 挂 CameraFollow，目标为 Player
 *
 * 这样组件不需要写进场景的 uuid 引用，场景文件保持纯灰盒结构。
 */
import { Node } from 'cc';
import { Player } from '../player/Player';
import { Joystick } from '../ui/Joystick';
import { CameraFollow } from '../camera/CameraFollow';

export class SceneSetup {
    /** 在 Canvas 节点下完成 Step 2 的组件装配 */
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
    }
}
