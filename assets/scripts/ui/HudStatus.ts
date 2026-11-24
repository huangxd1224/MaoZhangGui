/**
 * HUD 动态刷新 —— Step 4
 *
 * 职责：
 *   1. 经验条随玩家经验增长刷新（重画 UI/ExpBar 的填充比例）；
 *   2. 在经验条上叠加「等级 + 进度」文字（运行时创建 Label，工程里没有字体资源，
 *      必须 useSystemFont = true 否则一个字都渲染不出来）；
 *   3. 金币文字随拾取刷新。
 *
 * 刷新策略：每帧比对缓存值，**只在数值变化时重画**（Graphics 重绘有开销）。
 */
import { _decorator, Component, Node, Graphics, Color, Label, Widget, UITransform, HorizontalTextAlignment, VerticalTextAlignment } from 'cc';
import { PlayerStats } from '../player/PlayerStats';
import { UI_2D_LAYER } from '../core/Layers';

const { ccclass } = _decorator;

/** 经验条底色 */
const COLOR_BAR_BACK = new Color(20, 20, 24, 255);
/** 经验条填充色 */
const COLOR_EXP = new Color(86, 196, 118, 255);
/** 文字颜色 */
const COLOR_TEXT = new Color(236, 236, 236, 255);

@ccclass('HudStatus')
export class HudStatus extends Component {
    /** 玩家属性 */
    private stats: PlayerStats | null = null;
    /** 经验条节点 */
    private expBar: Node | null = null;
    /** 经验条上的等级文字 */
    private expLabel: Label | null = null;
    /** 金币文字 */
    private coinLabel: Label | null = null;

    /** 上一次的数值（用于判断是否需要重画） */
    private lastExp = -1;
    private lastLevel = -1;
    private lastCoins = -1;

    /**
     * 装配。
     * @param stats 玩家属性
     */
    public setup(stats: PlayerStats): void {
        this.stats = stats;
        // 用场景绝对路径取 HUD 节点，避免相对路径 '..' 的解析差异
        this.expBar = this.node.scene?.getChildByPath('Canvas/UI/ExpBar') ?? null;
        const coinNode = this.node.scene?.getChildByPath('Canvas/UI/CoinText') ?? null;
        if (coinNode) {
            this.coinLabel = coinNode.getComponent(Label);
            if (this.coinLabel) {
                this.coinLabel.useSystemFont = true;
                this.coinLabel.fontFamily = 'Arial';
                this.coinLabel.color = COLOR_TEXT;
                this.coinLabel.horizontalAlign = HorizontalTextAlignment.RIGHT;
                this.coinLabel.verticalAlign = VerticalTextAlignment.CENTER;
            }
        }
        this.createExpLabel();
        this.refresh(true);
    }

    protected update(): void {
        if (!this.stats) {
            return;
        }
        this.refresh(false);
    }

    /** 刷新经验条与金币文字 */
    private refresh(force: boolean): void {
        if (!this.stats) {
            return;
        }
        const expChanged = this.stats.exp !== this.lastExp || this.stats.level !== this.lastLevel;
        if (expChanged || force) {
            this.lastExp = this.stats.exp;
            this.lastLevel = this.stats.level;
            this.drawExpBar();
            if (this.expLabel) {
                this.expLabel.string = `Lv.${this.stats.level}  ${this.stats.exp}/${this.stats.expNeeded}`;
            }
        }
        if (this.stats.coins !== this.lastCoins || force) {
            this.lastCoins = this.stats.coins;
            if (this.coinLabel) {
                this.coinLabel.string = `金币 ${this.stats.coins}`;
            }
        }
    }

    /** 重画经验条填充比例 */
    private drawExpBar(): void {
        if (!this.expBar || !this.stats) {
            return;
        }
        const graphics = this.expBar.getComponent(Graphics);
        const transform = this.expBar.getComponent(UITransform);
        if (!graphics || !transform) {
            return;
        }
        const w = transform.contentSize.width;
        const h = transform.contentSize.height;
        graphics.clear();
        graphics.fillColor = COLOR_BAR_BACK;
        graphics.rect(-w / 2, -h / 2, w, h);
        graphics.fill();
        const ratio = this.stats.expRatio;
        if (ratio > 0) {
            graphics.fillColor = COLOR_EXP;
            graphics.rect(-w / 2, -h / 2, w * ratio, h);
            graphics.fill();
        }
    }

    /** 在经验条上创建「等级 + 进度」文字 */
    private createExpLabel(): void {
        if (!this.expBar || this.expLabel) {
            return;
        }
        const labelNode = new Node('ExpLabel');
        // 必须显式设层：新建节点默认在 DEFAULT（世界层），UI 相机只渲染 UI_2D 层，
        // 不设的话文字节点存在但渲染不出来（内容对、看不见）。
        labelNode.layer = UI_2D_LAYER;
        const transform = labelNode.addComponent(UITransform);
        transform.setContentSize(120, 20);
        const label = labelNode.addComponent(Label);
        label.useSystemFont = true;
        label.fontFamily = 'Arial';
        label.fontSize = 14;
        label.color = COLOR_TEXT;
        label.horizontalAlign = HorizontalTextAlignment.CENTER;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        label.cacheMode = Label.CacheMode.CHAR;
        this.expBar.addChild(labelNode);
        // 拉伸铺满经验条（Widget 目标 = 父节点）。
        // 注意顺序：必须先 addChild 再设 target —— target 必须是自己的父节点之一，
        // 否则引擎报 "Widget target must be one of the parent nodes of it"。
        const widget = labelNode.addComponent(Widget);
        widget.target = this.expBar;
        widget.isAlignTop = true;
        widget.isAlignBottom = true;
        widget.isAlignLeft = true;
        widget.isAlignRight = true;
        widget.alignMode = Widget.AlignMode.ALWAYS;
        this.expLabel = label;
    }
}
