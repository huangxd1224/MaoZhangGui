/**
 * 虚拟摇杆 —— Step 2
 *
 * 职责：鼠标 / 触摸拖拽产生方向向量（长度 0~1），供 Player 读取。
 *
 * 实现要点：
 *   - 用全局 input 监听指针事件（不依赖节点级 UI 命中测试，兼容性最好）；
 *   - 按下点落在底盘范围内才开始拖拽，否则忽略；
 *   - 事件坐标取 event.getUILocation()（UI 空间，原点 = Canvas 左下角，y 向上），
 *     底盘中心同样换算到 UI 空间后相减。
 *
 * 红线：
 *   - 半径按节点 UITransform 尺寸推导，不写死像素数值；
 *   - 摇杆头半径用节点尺寸的比例（UI 几何常量，非玩法数值）；
 *   - 拖拽处理内不 new 对象（Vec2 / Vec3 均在初始化时分配）。
 */
import {
    _decorator, Component, Vec2, Vec3, Graphics, Color, UITransform,
    input, Input, EventTouch, EventMouse, Node, view,
} from 'cc';
import type { JoystickSource } from '../player/Player';

const { ccclass } = _decorator;

/** 摇杆头半径 = 底盘半径 × 该比例（UI 几何比例） */
const KNOB_RADIUS_RATIO = 0.35;
/** 判定"按下即抓取"的容差倍数（相对底盘半径） */
const GRAB_TOLERANCE = 1.5;

@ccclass('Joystick')
export class Joystick extends Component implements JoystickSource {
    /** 当前方向（长度 0~1） */
    private readonly currentDir: Vec2 = new Vec2();
    /** 底盘半径（由节点尺寸推导） */
    private baseRadius = 0;
    /** 摇杆头半径 */
    private knobRadius = 0;
    /** 摇杆头当前偏移（UI 空间） */
    private readonly knobOffset: Vec2 = new Vec2();
    /** 是否正在拖拽 */
    private dragging = false;
    /** 复用的零向量（避免运行时 new） */
    private readonly zeroPos: Vec3 = new Vec3();
    /** Canvas 节点（用于把本地坐标换算到 UI 空间） */
    private canvasNode: Node | null = null;

    protected onLoad(): void {
        const t = this.node.getComponent(UITransform);
        if (t) {
            this.baseRadius = Math.min(t.contentSize.width, t.contentSize.height) / 2;
            this.knobRadius = this.baseRadius * KNOB_RADIUS_RATIO;
        }
        this.canvasNode = this.findCanvas();
        this.drawBase();
    }

    protected onEnable(): void {
        input.on(Input.EventType.MOUSE_DOWN, this.onPointerDown, this);
        input.on(Input.EventType.MOUSE_MOVE, this.onPointerMove, this);
        input.on(Input.EventType.MOUSE_UP, this.onPointerUp, this);
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    protected onDisable(): void {
        input.off(Input.EventType.MOUSE_DOWN, this.onPointerDown, this);
        input.off(Input.EventType.MOUSE_MOVE, this.onPointerMove, this);
        input.off(Input.EventType.MOUSE_UP, this.onPointerUp, this);
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    /** 对外只读方向 */
    public get dir(): Vec2 {
        return this.currentDir;
    }

    // ==================== 指针事件 ====================

    private onPointerDown(event: EventMouse): void {
        const ui = event.getUILocation();
        if (!this.isOnBase(ui.x, ui.y)) {
            return;
        }
        this.dragging = true;
        this.applyPointer(ui.x, ui.y);
    }

    private onPointerMove(event: EventMouse): void {
        if (!this.dragging) {
            return;
        }
        const ui = event.getUILocation();
        this.applyPointer(ui.x, ui.y);
    }

    private onPointerUp(): void {
        this.release();
    }

    private onTouchStart(event: EventTouch): void {
        const ui = event.getUILocation();
        if (!this.isOnBase(ui.x, ui.y)) {
            return;
        }
        this.dragging = true;
        this.applyPointer(ui.x, ui.y);
    }

    private onTouchMove(event: EventTouch): void {
        if (!this.dragging) {
            return;
        }
        const ui = event.getUILocation();
        this.applyPointer(ui.x, ui.y);
    }

    private onTouchEnd(): void {
        this.release();
    }

    /** 判断 UI 坐标是否落在底盘可抓取范围内 */
    private isOnBase(uiX: number, uiY: number): boolean {
        const center = this.baseCenterInUI();
        const dx = uiX - center.x;
        const dy = uiY - center.y;
        return dx * dx + dy * dy <= this.baseRadius * this.baseRadius * GRAB_TOLERANCE * GRAB_TOLERANCE;
    }

    /** 底盘中心在 UI 空间中的位置（UI 空间原点 = Canvas 左下角） */
    private baseCenterInUI(): Vec2 {
        const canvas = this.canvasNode;
        if (!canvas) {
            return this.centerFallback;
        }
        const canvasTransform = canvas.getComponent(UITransform);
        const size = canvasTransform ? canvasTransform.contentSize : view.getVisibleSize();
        const local = this.node.worldPosition;
        const origin = canvas.worldPosition;
        this.centerFallback.set(
            local.x - origin.x + size.width / 2,
            local.y - origin.y + size.height / 2,
        );
        return this.centerFallback;
    }

    /** 复用的中心点（避免运行时 new） */
    private readonly centerFallback: Vec2 = new Vec2();

    /** 更新方向 */
    private applyPointer(uiX: number, uiY: number): void {
        const center = this.baseCenterInUI();
        let dx = uiX - center.x;
        let dy = uiY - center.y;

        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > this.baseRadius) {
            const scale = this.baseRadius / dist;
            dx *= scale;
            dy *= scale;
        }

        this.knobOffset.set(dx, dy);
        this.currentDir.set(dx / this.baseRadius, dy / this.baseRadius);
        this.redraw();
    }

    private release(): void {
        this.dragging = false;
        this.knobOffset.set(0, 0);
        this.currentDir.set(0, 0);
        this.redraw();
    }

    /** 向上找 Canvas 节点 */
    private findCanvas(): Node | null {
        let node: Node | null = this.node;
        while (node) {
            if (node.name === 'Canvas') {
                return node;
            }
            node = node.parent;
        }
        return null;
    }

    // ==================== 绘制 ====================

    private drawBase(): void {
        this.redraw();
    }

    private redraw(): void {
        const g = this.node.getComponent(Graphics);
        if (!g) {
            return;
        }
        g.clear();
        g.fillColor = new Color(255, 255, 255, 60);
        g.circle(0, 0, this.baseRadius);
        g.fill();
        g.strokeColor = new Color(255, 255, 255, 120);
        g.lineWidth = 2;
        g.circle(0, 0, this.baseRadius);
        g.stroke();
        g.fillColor = new Color(255, 255, 255, 160);
        g.circle(this.knobOffset.x, this.knobOffset.y, this.knobRadius);
        g.fill();
    }
}
