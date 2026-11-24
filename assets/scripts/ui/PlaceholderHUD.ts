/**
 * 灰盒占位绘制（Step 1 场景骨架）
 *
 * 职责：按场景节点树把 World/UI 的占位色块与文字填上，便于验收节点树，
 *       并把 Config 中的玩家移速等数值显示出来，用来验证「改 Config 即生效」。
 * 边界：本步不含任何玩法逻辑（移动、波次、战斗属 Step 2 及以后）。
 */
import { _decorator, Component, Graphics, Color, Label, Node, UITransform, HorizontalTextAlignment, VerticalTextAlignment, Camera, Canvas, view } from 'cc';
import { GLOBAL, WAVES } from '../Config';
import { SceneSetup } from '../core/SceneSetup';
import { DEFAULT_LAYER, UI_2D_LAYER } from '../core/Layers';

const { ccclass } = _decorator;

/** 灰盒配色 */
const COLOR_GROUND = new Color(52, 58, 72, 255);
const COLOR_GROUND_EDGE = new Color(96, 106, 128, 255);
const COLOR_GRID = new Color(74, 82, 100, 255);
const COLOR_STALL = new Color(222, 140, 62, 255);
const COLOR_BAR_BACK = new Color(20, 20, 24, 255);
const COLOR_HP = new Color(214, 74, 74, 255);
const COLOR_EXP = new Color(86, 196, 118, 255);
const COLOR_TEXT = new Color(236, 236, 236, 255);

/**
 * 地图网格分格数（灰盒视觉常量，非玩法数值）。
 * 网格线的作用：地图尺寸大于视口、边框落在视野外，若底色又与相机清屏色接近，
 * 整屏会是一片同色，看起来像"没有画面"；网格提供可辨认的地图结构。
 */
const GROUND_GRID_CELLS = 10;

/** UI_2D 层 / DEFAULT 层的常量定义在 core/Layers.ts（Step 3 起统一引用，避免多处各写一份） */

@ccclass('PlaceholderHUD')
export class PlaceholderHUD extends Component {
    protected onLoad(): void {
        // Step 2：装配玩家 / 摇杆 / 镜头跟随（节点已在场景里摆好，这里只挂组件）
        SceneSetup.setup(this.node);
        this.setupRenderPipeline();
        this.syncUISize();
        this.drawGround();
        this.drawStall();
        this.drawBars();
        this.refreshText();
    }

    /**
     * 搭建渲染管线：世界层与 HUD 层分离 + 一台固定的 UI 相机。
     *
     * 原因：若 UI_2D 层与世界内容共用「会平移的主相机」，HUD 会跟着镜头一起被推出屏幕，
     * 预览表现为「没有画面」（只剩被清屏色铺满的背景）；地图、摊位这类世界内容也要
     * 跟着镜头走，所以两者必须由不同的相机渲染，且两台相机的正交高度一致，
     * 这样世界坐标与 UI 坐标才是 1:1 对应，HUD 与世界内容不会错位。
     */
    private setupRenderPipeline(): void {
        const canvas = this.node;

        // 世界内容 → DEFAULT 层，由主相机（可平移、跟随玩家）渲染
        const worldGroups = ['World', 'Actors', 'Drops'];
        for (const group of worldGroups) {
            const groupNode = canvas.getChildByPath(group);
            if (!groupNode) {
                continue;
            }
            groupNode.layer = DEFAULT_LAYER;
            for (const child of groupNode.children) {
                child.layer = DEFAULT_LAYER;
            }
        }
        const mainCameraNode = canvas.getChildByPath('Camera');
        const mainCamera = mainCameraNode ? mainCameraNode.getComponent(Camera) : null;
        if (mainCamera) {
            mainCamera.visibility = DEFAULT_LAYER;
        }

        // UI 相机：固定不动，只渲染 HUD（UI_2D 层）
        let uiCameraNode = canvas.getChildByPath('UICamera');
        if (!uiCameraNode) {
            uiCameraNode = new Node('UICamera');
            uiCameraNode.setParent(canvas);
        }
        uiCameraNode.layer = UI_2D_LAYER;
        uiCameraNode.setPosition(0, 0, 1000);
        let uiCamera = uiCameraNode.getComponent(Camera);
        if (!uiCamera) {
            uiCamera = uiCameraNode.addComponent(Camera);
        }
        uiCamera.projection = Camera.ProjectionType.ORTHO;
        uiCamera.orthoHeight = view.getFrameSize().height / 2;
        uiCamera.visibility = UI_2D_LAYER;
        uiCamera.clearFlags = Camera.ClearFlag.DONT_CLEAR;
        uiCamera.priority = 1;

        const canvasComponent = canvas.getComponent(Canvas);
        if (canvasComponent) {
            canvasComponent.cameraComponent = uiCamera;
        }
    }

    protected update(): void {
        // 窗口尺寸变化时 Canvas 的 UITransform 会变，UI 层要跟着变，
        // 否则 Widget 会按过期尺寸把 HUD 元素摆到屏幕外（表现为"看不到画面"）。
        this.syncUISize();
        this.syncCameras();
    }

    /**
     * 同步两台相机的正交高度 = 屏幕半高。
     * 主相机（跟随玩家，可平移）渲染世界层，UICamera（固定）渲染 HUD 层；
     * 两者的 orthoHeight 必须一致，世界坐标与 UI 坐标才是 1:1 对应，
     * 否则 HUD 会与世界内容错位。
     */
    private syncCameras(): void {
        const frame = view.getFrameSize();
        if (frame.height <= 0) {
            return;
        }
        const halfHeight = frame.height / 2;
        const cameraNode = this.node.getChildByPath('Camera');
        const uiCameraNode = this.node.getChildByPath('UICamera');
        const cameras = [cameraNode, uiCameraNode];
        for (const node of cameras) {
            if (!node) {
                continue;
            }
            const camera = node.getComponent(Camera);
            if (camera && camera.orthoHeight !== halfHeight) {
                camera.orthoHeight = halfHeight;
            }
        }
    }

    /**
     * 让 UI 层尺寸与 Canvas 一致。
     * Canvas 在 alignCanvasWithScreen 下尺寸 = 屏幕像素尺寸（如 1280×580），
     * 而 UI 层若还保持设计分辨率 720 高，Widget 对齐就会算到屏幕之外。
     */
    private syncUISize(): void {
        const canvasTransform = this.node.getComponent(UITransform);
        const uiNode = this.node.getChildByPath('UI');
        const uiTransform = uiNode ? uiNode.getComponent(UITransform) : null;
        if (!canvasTransform || !uiTransform) {
            return;
        }
        const canvasSize = canvasTransform.contentSize;
        const uiSize = uiTransform.contentSize;
        if (uiSize.width !== canvasSize.width || uiSize.height !== canvasSize.height) {
            uiTransform.setContentSize(canvasSize);
        }
    }

    /** 地图色块 2000×1200（含网格线，便于辨认地图结构） */
    private drawGround(): void {
        const node = this.node.getChildByPath('World/MapBlock');
        if (!node) { return; }
        const g = node.getComponent(Graphics);
        const t = node.getComponent(UITransform);
        const w = t.contentSize.width;
        const h = t.contentSize.height;
        g.clear();
        g.fillColor = COLOR_GROUND;
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();

        // 网格线
        g.strokeColor = COLOR_GRID;
        g.lineWidth = 2;
        const cellW = w / GROUND_GRID_CELLS;
        const cellH = h / GROUND_GRID_CELLS;
        for (let i = 1; i < GROUND_GRID_CELLS; i++) {
            const x = -w / 2 + i * cellW;
            g.moveTo(x, -h / 2);
            g.lineTo(x, h / 2);
        }
        for (let i = 1; i < GROUND_GRID_CELLS; i++) {
            const y = -h / 2 + i * cellH;
            g.moveTo(-w / 2, y);
            g.lineTo(w / 2, y);
        }
        g.stroke();

        // 外边框
        g.strokeColor = COLOR_GROUND_EDGE;
        g.lineWidth = 4;
        g.rect(-w / 2, -h / 2, w, h);
        g.stroke();
    }

    /** 中央摊位基地 */
    private drawStall(): void {
        const node = this.node.getChildByPath('World/Stall');
        if (!node) { return; }
        const g = node.getComponent(Graphics);
        const t = node.getComponent(UITransform);
        const w = t.contentSize.width;
        const h = t.contentSize.height;
        g.clear();
        g.fillColor = COLOR_STALL;
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
    }

    /** 玩家血条 / 经验条占位 */
    private drawBars(): void {
        this.drawBar('UI/HealthBar', COLOR_HP, 1);
        this.drawBar('UI/ExpBar', COLOR_EXP, 0.35);
    }

    private drawBar(path: string, fillColor: Color, ratio: number): void {
        const node = this.node.getChildByPath(path);
        if (!node) { return; }
        const g = node.getComponent(Graphics);
        const t = node.getComponent(UITransform);
        const w = t.contentSize.width;
        const h = t.contentSize.height;
        g.clear();
        g.fillColor = COLOR_BAR_BACK;
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
        g.fillColor = fillColor;
        g.rect(-w / 2, -h / 2, w * ratio, h);
        g.fill();
    }

    /** HUD 文字占位 */
    private refreshText(): void {
        const waveText = this.getLabel('UI/WaveText');
        if (waveText) {
            this.styleLabel(waveText, 'left');
            waveText.string = `第 1 / ${GLOBAL.runWaves} 波`;
        }
        const coinText = this.getLabel('UI/CoinText');
        if (coinText) {
            this.styleLabel(coinText, 'right');
            coinText.string = '金币 0';
        }
        const speedText = this.getLabel('UI/SpeedText');
        if (speedText) {
            this.styleLabel(speedText, 'right');
            speedText.string = `玩家移速 ${GLOBAL.playerSpeed}`;
        }
    }

    /**
     * 文字样式：工程里没有任何字体资源（Label 的 font 为 null），
     * 不开启系统字体的话 Label 一个字都渲染不出来 → 必须 useSystemFont = true。
     * align：贴左边的元素左对齐，贴右边的元素右对齐。
     */
    private styleLabel(label: Label, align: 'left' | 'right'): void {
        label.useSystemFont = true;
        label.fontFamily = 'Arial';
        label.color = COLOR_TEXT;
        label.horizontalAlign = align === 'left' ? HorizontalTextAlignment.LEFT : HorizontalTextAlignment.RIGHT;
        label.verticalAlign = VerticalTextAlignment.CENTER;
    }

    private getLabel(path: string): Label | null {
        const node: Node | null = this.node.getChildByPath(path);
        return node ? node.getComponent(Label) : null;
    }

    /** 供后续步骤参考：当前波次配置 */
    public get firstWaveEnemyMix(): string {
        const mix = WAVES[0].mix;
        return Object.keys(mix).join(',');
    }
}
