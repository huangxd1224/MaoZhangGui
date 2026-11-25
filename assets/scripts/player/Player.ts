/**
 * 玩家（橘猫）—— Step 2：摇杆移动 + WASD 兼容调试
 *
 * 职责：
 *   1. 读取摇杆方向（由 Joystick 写入）与键盘 WASD/方向键，合成为移动方向；
 *   2. 按 Config 的 playerSpeed 移动，并把玩家限制在地图矩形内；
 *   3. 灰盒：60×60 橙色方块（尺寸由场景节点 UITransform 决定）。
 *
 * 红线：
 *   - 速度等数值只从 Config 读；
 *   - 不用物理引擎，边界判定用坐标比较；
 *   - update 内不 new 对象（Vec2 / Set 均在初始化时分配）。
 */
import { _decorator, Component, Node, Vec2, Vec3, input, Input, EventKeyboard, KeyCode, Graphics, Color, UITransform } from 'cc';
import { GLOBAL } from '../Config';
import { GameManager } from '../core/GameManager';
import { UpgradeState } from '../core/UpgradeState';

const { ccclass } = _decorator;

/** 摇杆数据来源接口（由 Joystick 实现，避免 Player 与 Joystick 循环依赖） */
export interface JoystickSource {
    /** 当前拖动方向，长度 0~1，未拖动为 (0,0) */
    readonly dir: Vec2;
}

@ccclass('Player')
export class Player extends Component {
    /** 由场景装配代码注入 */
    public joystick: JoystickSource | null = null;

    /** 按下的按键集合（初始化时分配，update 内只读不建） */
    private readonly pressedKeys: Set<number> = new Set<number>();
    /** 复用的方向向量（避免 update 内 new） */
    private readonly moveDir: Vec2 = new Vec2();
    /** 地图半宽 / 半高（世界坐标，地图中心为原点） */
    private mapHalfWidth = 0;
    private mapHalfHeight = 0;
    /** 玩家自身半径（来自节点尺寸） */
    private selfRadius = 0;

    protected onLoad(): void {
        this.readMapBounds();
        this.drawSelf();
    }

    protected onEnable(): void {
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
    }

    protected onDisable(): void {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
    }

    protected update(dt: number): void {
        // 升级面板弹出时游戏暂停（Step 5）
        if (GameManager.paused) {
            return;
        }
        this.moveDir.set(0, 0);

        // 摇杆输入
        const joy = this.joystick;
        if (joy) {
            this.moveDir.x += joy.dir.x;
            this.moveDir.y += joy.dir.y;
        }

        // 键盘输入（WASD / 方向键），调试用
        if (this.pressedKeys.has(KeyCode.KEY_A) || this.pressedKeys.has(KeyCode.ARROW_LEFT)) {
            this.moveDir.x -= 1;
        }
        if (this.pressedKeys.has(KeyCode.KEY_D) || this.pressedKeys.has(KeyCode.ARROW_RIGHT)) {
            this.moveDir.x += 1;
        }
        if (this.pressedKeys.has(KeyCode.KEY_W) || this.pressedKeys.has(KeyCode.ARROW_UP)) {
            this.moveDir.y += 1;
        }
        if (this.pressedKeys.has(KeyCode.KEY_S) || this.pressedKeys.has(KeyCode.ARROW_DOWN)) {
            this.moveDir.y -= 1;
        }

        const len = this.moveDir.length();
        if (len <= 0) {
            return;
        }
        if (len > 1) {
            this.moveDir.x /= len;
            this.moveDir.y /= len;
        }

        // 按 Config 速度移动（乘「移速」被动的加成）
        const step = GLOBAL.playerSpeed * UpgradeState.speedMul * dt;
        const pos = this.node.position;
        let x = pos.x + this.moveDir.x * step;
        let y = pos.y + this.moveDir.y * step;

        // 限制在地图矩形内（不依赖物理引擎）
        const limitX = Math.max(0, this.mapHalfWidth - this.selfRadius);
        const limitY = Math.max(0, this.mapHalfHeight - this.selfRadius);
        x = Math.min(limitX, Math.max(-limitX, x));
        y = Math.min(limitY, Math.max(-limitY, y));

        this.node.setPosition(x, y, pos.z);
    }

    /** 从场景里的地图色块读取地图范围（不写死数值） */
    private readMapBounds(): void {
        const mapNode = this.node.scene?.getChildByPath('Canvas/World/MapBlock');
        const mapTransform = mapNode ? mapNode.getComponent(UITransform) : null;
        if (mapTransform) {
            this.mapHalfWidth = mapTransform.contentSize.width / 2;
            this.mapHalfHeight = mapTransform.contentSize.height / 2;
        }
        const selfTransform = this.node.getComponent(UITransform);
        if (selfTransform) {
            this.selfRadius = Math.min(selfTransform.contentSize.width, selfTransform.contentSize.height) / 2;
        }
    }

    /** 灰盒绘制：橘猫色块 */
    private drawSelf(): void {
        const g = this.node.getComponent(Graphics);
        const t = this.node.getComponent(UITransform);
        if (!g || !t) {
            return;
        }
        const w = t.contentSize.width;
        const h = t.contentSize.height;
        g.clear();
        g.fillColor = new Color(240, 160, 70, 255);
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
    }

    private onKeyDown(event: EventKeyboard): void {
        this.pressedKeys.add(event.keyCode);
    }

    private onKeyUp(event: EventKeyboard): void {
        this.pressedKeys.delete(event.keyCode);
    }

    /** 供其他系统查询当前是否在移动（预留） */
    public get isMoving(): boolean {
        return this.moveDir.length() > 0;
    }
}
