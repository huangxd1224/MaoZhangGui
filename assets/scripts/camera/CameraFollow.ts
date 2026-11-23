/**
 * 镜头跟随 —— Step 2
 *
 * 职责：镜头跟随玩家，并做地图边缘钳制，保证画面不露黑边。
 *
 * 钳制逻辑（一句话）：
 *   把镜头中心限制在「地图矩形」与「可视矩形」的交集内——
 *   即 X 夹到 [-半地图宽 + 半视口宽, 半地图宽 - 半视口宽]，
 *   Y 夹到 [-半地图高 + 半视口高, 半地图高 - 半视口高]；
 *   若某轴地图比视口还小（区间反转），该轴直接锁在地图中心。
 *
 * 红线：
 *   - 地图尺寸读场景节点 UITransform、视口尺寸读 Camera 组件与设计分辨率，不写死数值；
 *   - lateUpdate 内不 new 对象。
 */
import { _decorator, Component, Node, Camera, UITransform, view } from 'cc';

const { ccclass } = _decorator;

@ccclass('CameraFollow')
export class CameraFollow extends Component {
    /** 跟随目标（玩家节点），由场景装配代码注入 */
    public target: Node | null = null;

    /** 地图半宽 / 半高（世界坐标，地图中心为原点） */
    private mapHalfWidth = 0;
    private mapHalfHeight = 0;
    /** 可视区域半宽 / 半高 */
    private viewHalfWidth = 0;
    private viewHalfHeight = 0;
    /** 地图范围是否就绪 */
    private boundsReady = false;
    /** 相机组件（缓存，避免每帧查找） */
    private camera: Camera | null = null;

    protected onLoad(): void {
        this.camera = this.node.getComponent(Camera);
        this.readBounds();
    }

    protected lateUpdate(): void {
        if (!this.target || !this.boundsReady || !this.camera) {
            return;
        }
        const p = this.target.position;

        // 可视区域按「实际画布宽高比」计算：
        // 正交相机可见宽 = orthoHeight × (画布宽/画布高)，
        // 用设计分辨率比例会在非 16:9 画布上算出过窄的视口 → 镜头走到边缘会露黑边。
        const frame = view.getFrameSize();
        const aspect = frame.height > 0 ? frame.width / frame.height : 1;
        const halfHeight = this.camera.orthoHeight;
        const halfWidth = halfHeight * aspect;
        this.viewHalfHeight = halfHeight;
        this.viewHalfWidth = halfWidth;

        // 钳制区间：地图边界内缩半个视口，保证不露黑边
        const minX = -this.mapHalfWidth + this.viewHalfWidth;
        const maxX = this.mapHalfWidth - this.viewHalfWidth;
        const minY = -this.mapHalfHeight + this.viewHalfHeight;
        const maxY = this.mapHalfHeight - this.viewHalfHeight;

        let x = p.x;
        let y = p.y;
        // 区间反转说明该轴地图比视口小 → 锁死在地图中心
        x = minX > maxX ? 0 : Math.min(maxX, Math.max(minX, x));
        y = minY > maxY ? 0 : Math.min(maxY, Math.max(minY, y));

        this.node.setPosition(x, y, this.node.position.z);
    }

    /** 读取地图范围与视口范围 */
    private readBounds(): void {
        const mapNode = this.node.scene?.getChildByPath('Canvas/World/MapBlock');
        const mapTransform = mapNode ? mapNode.getComponent(UITransform) : null;
        if (mapTransform) {
            this.mapHalfWidth = mapTransform.contentSize.width / 2;
            this.mapHalfHeight = mapTransform.contentSize.height / 2;
        }

        const camera = this.camera ?? this.node.getComponent(Camera);
        const design = view.getDesignResolutionSize();
        if (camera && design.width > 0 && design.height > 0) {
            this.viewHalfHeight = camera.orthoHeight;
            this.viewHalfWidth = camera.orthoHeight * (design.width / design.height);
        }
        this.boundsReady = this.mapHalfWidth > 0 && this.mapHalfHeight > 0 && this.viewHalfWidth > 0;
    }
}
