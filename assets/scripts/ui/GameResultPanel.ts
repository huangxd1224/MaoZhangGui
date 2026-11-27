/**
 * 结算面板 —— Step 7
 *
 * 职责：
 *   1. 对局结束（胜负已定）时弹出：显示用时 / 击杀 / 金币 / 波次；
 *   2. 「再来一局」按钮：重新开始一局（重新加载主场景，从第 1 波再来）。
 *
 * 说明：原型阶段用「重载场景」实现重开 —— 这是最稳的重置方式，
 * 不用逐个系统写 reset（波次/金币/摊位/敌人/武器全部回到初始状态）。
 */
import { _decorator, Component, Node, Graphics, Color, Label, UITransform, HorizontalTextAlignment, VerticalTextAlignment, director } from 'cc';
import { PROTOTYPE_ONLY } from '../Config';
import { UI_2D_LAYER } from '../core/Layers';
import { RunSummary } from '../core/RunTypes';

const { ccclass } = _decorator;

/** 配色（视觉常量） */
const COLOR_MASK = new Color(0, 0, 0, 170);
const COLOR_PANEL_BG = new Color(30, 34, 44, 245);
const COLOR_WIN = new Color(120, 214, 130, 255);
const COLOR_LOSE = new Color(224, 96, 96, 255);
const COLOR_TITLE = new Color(246, 214, 120, 255);
const COLOR_TEXT = new Color(236, 236, 236, 255);
const COLOR_BUTTON = new Color(214, 138, 62, 255);

@ccclass('GameResultPanel')
export class GameResultPanel extends Component {
    /** 是否显示 */
    private shown = false;
    /** 标题（胜利/失败） */
    private titleLabel: Label | null = null;
    /** 明细文字 */
    private detailLabel: Label | null = null;

    /** 装配（建 UI） */
    public setup(): void {
        this.buildFrame();
        this.node.active = false;
    }

    /** 面板是否显示 */
    public get visible(): boolean {
        return this.shown;
    }

    /**
     * 显示结算。
     * @param summary 结算数据
     */
    public show(summary: RunSummary): void {
        this.shown = true;
        this.node.active = true;
        if (this.titleLabel) {
            this.titleLabel.string = summary.victory ? '守住了！胜利' : '摊位被啃光了…失败';
            this.titleLabel.color = summary.victory ? COLOR_WIN : COLOR_LOSE;
        }
        if (this.detailLabel) {
            this.detailLabel.string =
                `${summary.reason}\n` +
                `用时 ${summary.elapsedSec} 秒\n` +
                `击杀 ${summary.kills}\n` +
                `金币 ${summary.coins}\n` +
                `波次 ${summary.wave}`;
        }
    }

    /** 隐藏面板 */
    public close(): void {
        this.shown = false;
        this.node.active = false;
    }

    // ==================== UI 构建 ====================

    private buildFrame(): void {
        const size = this.node.scene?.getChildByPath('Canvas')?.getComponent(UITransform)?.contentSize;
        const w = size ? size.width : 1280;
        const h = size ? size.height : 720;

        // 遮罩
        const mask = new Node('Mask');
        mask.layer = UI_2D_LAYER;
        const maskTransform = mask.addComponent(UITransform);
        maskTransform.setContentSize(w, h);
        const maskGraphics = mask.addComponent(Graphics);
        maskGraphics.fillColor = COLOR_MASK;
        maskGraphics.rect(-w / 2, -h / 2, w, h);
        maskGraphics.fill();
        this.node.addChild(mask);

        // 面板底
        const panel = new Node('Panel');
        panel.layer = UI_2D_LAYER;
        const panelTransform = panel.addComponent(UITransform);
        panelTransform.setContentSize(PROTOTYPE_ONLY.resultPanelWidth, PROTOTYPE_ONLY.resultPanelHeight);
        const panelGraphics = panel.addComponent(Graphics);
        panelGraphics.fillColor = COLOR_PANEL_BG;
        panelGraphics.rect(
            -PROTOTYPE_ONLY.resultPanelWidth / 2,
            -PROTOTYPE_ONLY.resultPanelHeight / 2,
            PROTOTYPE_ONLY.resultPanelWidth,
            PROTOTYPE_ONLY.resultPanelHeight,
        );
        panelGraphics.fill();
        this.node.addChild(panel);

        // 标题
        const titleNode = new Node('Title');
        titleNode.layer = UI_2D_LAYER;
        titleNode.setPosition(0, PROTOTYPE_ONLY.resultPanelHeight / 2 - 48, 0);
        const titleTransform = titleNode.addComponent(UITransform);
        titleTransform.setContentSize(PROTOTYPE_ONLY.resultPanelWidth, 44);
        const title = titleNode.addComponent(Label);
        title.useSystemFont = true;
        title.fontFamily = 'Arial';
        title.fontSize = 30;
        title.color = COLOR_TITLE;
        title.horizontalAlign = HorizontalTextAlignment.CENTER;
        title.verticalAlign = VerticalTextAlignment.CENTER;
        title.cacheMode = Label.CacheMode.CHAR;
        this.node.addChild(titleNode);
        this.titleLabel = title;

        // 明细
        const detailNode = new Node('Detail');
        detailNode.layer = UI_2D_LAYER;
        detailNode.setPosition(0, 6, 0);
        const detailTransform = detailNode.addComponent(UITransform);
        detailTransform.setContentSize(PROTOTYPE_ONLY.resultPanelWidth - 40, 160);
        const detail = detailNode.addComponent(Label);
        detail.useSystemFont = true;
        detail.fontFamily = 'Arial';
        detail.fontSize = 18;
        detail.color = COLOR_TEXT;
        detail.horizontalAlign = HorizontalTextAlignment.CENTER;
        detail.verticalAlign = VerticalTextAlignment.CENTER;
        detail.cacheMode = Label.CacheMode.CHAR;
        this.node.addChild(detailNode);
        this.detailLabel = detail;

        // 再来一局按钮
        const button = new Node('Restart');
        button.layer = UI_2D_LAYER;
        button.setPosition(0, -PROTOTYPE_ONLY.resultPanelHeight / 2 + 46, 0);
        const buttonTransform = button.addComponent(UITransform);
        buttonTransform.setContentSize(220, 54);
        const buttonGraphics = button.addComponent(Graphics);
        buttonGraphics.fillColor = COLOR_BUTTON;
        buttonGraphics.rect(-110, -27, 220, 54);
        buttonGraphics.fill();
        const buttonLabelNode = new Node('Text');
        buttonLabelNode.layer = UI_2D_LAYER;
        const buttonLabelTransform = buttonLabelNode.addComponent(UITransform);
        buttonLabelTransform.setContentSize(220, 54);
        const buttonLabel = buttonLabelNode.addComponent(Label);
        buttonLabel.useSystemFont = true;
        buttonLabel.fontFamily = 'Arial';
        buttonLabel.fontSize = 22;
        buttonLabel.color = COLOR_TEXT;
        buttonLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
        buttonLabel.verticalAlign = VerticalTextAlignment.CENTER;
        buttonLabel.cacheMode = Label.CacheMode.CHAR;
        buttonLabel.string = '再来一局';
        button.addChild(buttonLabelNode);
        button.on(Node.EventType.TOUCH_END, () => this.restart(), this);
        this.node.addChild(button);
    }

    /** 再来一局：重新加载当前场景（对局全部重置） */
    private restart(): void {
        const scene = this.node.scene;
        const name = scene ? scene.name : 'Main';
        director.loadScene(name);
    }
}
