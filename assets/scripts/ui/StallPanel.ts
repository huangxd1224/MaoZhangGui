/**
 * 间歇摆摊面板 —— Step 7
 *
 * 职责：
 *   1. 第 3/6/9 波后的间歇期弹出（GameManager 调 open()）；
 *   2. 列出可摆放的摊位（Config 的 PROTOTYPE_STALLS）与其价格（STALLS.cost）；
 *   3. 点击 → StallManager.placeStall() 扣金币并在**固定点**摆摊；
 *   4. 摊子被打坏后可在这里花 repairCost 维修（doc 核心创新 3）；
 *   5. 面板**不暂停游戏**（间歇期间场上的怪还在动），只显示剩余秒数。
 *
 * 数值纪律：价格/半径/减速比例/维修价格全部读 Config，脚本里不写死。
 */
import { _decorator, Component, Node, Graphics, Color, Label, UITransform, HorizontalTextAlignment, VerticalTextAlignment } from 'cc';
import { PROTOTYPE_ONLY, PROTOTYPE_STALLS, StallConfig } from '../Config';
import { UI_2D_LAYER } from '../core/Layers';
import { StallManager } from '../stall/StallManager';
import { PlayerStats } from '../player/PlayerStats';

const { ccclass } = _decorator;

/** 配色（视觉常量） */
const COLOR_PANEL_BG = new Color(30, 34, 44, 240);
const COLOR_OPTION = new Color(214, 138, 62, 255);
const COLOR_OPTION_DISABLED = new Color(96, 100, 112, 255);
const COLOR_REPAIR = new Color(96, 186, 120, 255);
const COLOR_TITLE = new Color(246, 214, 120, 255);
const COLOR_TEXT = new Color(236, 236, 236, 255);

@ccclass('StallPanel')
export class StallPanel extends Component {
    /** 摊位管理 */
    private manager: StallManager | null = null;
    /** 玩家属性（显示金币） */
    private stats: PlayerStats | null = null;
    /** 是否显示 */
    private shown = false;
    /** 选项卡节点 */
    private optionNodes: Node[] = [];
    /** 标题 */
    private titleLabel: Label | null = null;
    /** 金币文字 */
    private coinLabel: Label | null = null;
    /** 剩余秒数（外部每帧刷新） */
    private remainSec = 0;

    /**
     * 装配。
     * @param manager 摊位管理
     * @param stats 玩家属性
     */
    public setup(manager: StallManager, stats: PlayerStats): void {
        this.manager = manager;
        this.stats = stats;
        this.buildFrame();
        this.node.active = false;
    }

    /** 面板是否显示 */
    public get visible(): boolean {
        return this.shown;
    }

    /**
     * 打开摆摊 UI。
     * @param remainingSec 间歇剩余秒数
     */
    public open(remainingSec: number): void {
        this.shown = true;
        this.remainSec = remainingSec;
        this.node.active = true;
        this.refresh();
    }

    /** 关闭摆摊 UI */
    public close(): void {
        this.shown = false;
        this.node.active = false;
        this.clearOptionNodes();
    }

    protected update(): void {
        if (!this.shown) {
            return;
        }
        // 剩余时间在递减（GameManager 是权威，这里只做显示）
        this.refreshText();
    }

    /** 刷新选项（摆摊/维修后会重画） */
    public refresh(): void {
        if (!this.shown) {
            return;
        }
        this.clearOptionNodes();
        const manager = this.manager;
        if (!manager) {
            return;
        }
        const options: StallConfig[] = PROTOTYPE_STALLS;
        const step = PROTOTYPE_ONLY.stallOptionWidth + PROTOTYPE_ONLY.stallOptionSpacing;
        let index = 0;
        for (const config of options) {
            const affordable = this.stats !== null && this.stats.coins >= config.cost;
            const hasPoint = manager.freePointCount > 0;
            const enabled = affordable && hasPoint;
            const node = this.buildOption(
                `${config.name}`,
                `${config.cost} 金币`,
                this.describeStall(config),
                enabled ? COLOR_OPTION : COLOR_OPTION_DISABLED,
                () => {
                    if (manager.placeStall(config.id)) {
                        this.refresh();
                    }
                },
            );
            node.setPosition((index - (options.length - 1) / 2) * step, -20, 0);
            this.node.addChild(node);
            this.optionNodes.push(node);
            index++;
        }
        // 维修（被打坏的摊子）
        for (const stall of manager.defensiveStalls) {
            if (stall.hp >= stall.maxHp) {
                continue;
            }
            const cost = stall.config.repairCost;
            const affordable = this.stats !== null && this.stats.coins >= cost;
            const node = this.buildOption(
                `维修 ${stall.config.name}`,
                `${cost} 金币`,
                `血量 ${stall.hp}/${stall.maxHp} → 修复`,
                affordable ? COLOR_REPAIR : COLOR_OPTION_DISABLED,
                () => {
                    if (manager.repairStall(stall.config.id)) {
                        this.refresh();
                    }
                },
            );
            node.setPosition((index - (options.length - 1) / 2) * step, -20, 0);
            this.node.addChild(node);
            this.optionNodes.push(node);
            index++;
        }
        this.refreshText();
    }

    /** 摊位效果描述（数值读 Config） */
    private describeStall(config: StallConfig): string {
        if (config.type === 'slow_aura') {
            return `减速光环 半径 ${config.radius}\n移速 -${Math.round((config.slowFactor ?? 0) * 100)}%\n血量 ${config.hp}`;
        }
        return `作用半径 ${config.radius}\n血量 ${config.hp}`;
    }

    /** 刷新标题与金币文字 */
    private refreshText(): void {
        if (this.titleLabel) {
            this.titleLabel.string = `间歇摆摊（剩余 ${this.remainSec} 秒）`;
        }
        if (this.coinLabel && this.stats) {
            this.coinLabel.string = `金币 ${this.stats.coins}`;
        }
    }

    // ==================== UI 构建 ====================

    /** 建外框（面板底 + 标题 + 金币） */
    private buildFrame(): void {
        const size = this.node.scene?.getChildByPath('Canvas')?.getComponent(UITransform)?.contentSize;
        const w = size ? size.width : 1280;
        const h = size ? size.height : 720;

        // 面板靠屏幕右侧（不挡住中间的战斗区）
        this.node.setPosition(w / 2 - PROTOTYPE_ONLY.stallPanelWidth / 2 - 30, 0, 0);

        const panel = new Node('Panel');
        panel.layer = UI_2D_LAYER;
        const panelTransform = panel.addComponent(UITransform);
        panelTransform.setContentSize(PROTOTYPE_ONLY.stallPanelWidth, PROTOTYPE_ONLY.stallPanelHeight);
        const panelGraphics = panel.addComponent(Graphics);
        panelGraphics.fillColor = COLOR_PANEL_BG;
        panelGraphics.rect(
            -PROTOTYPE_ONLY.stallPanelWidth / 2,
            -PROTOTYPE_ONLY.stallPanelHeight / 2,
            PROTOTYPE_ONLY.stallPanelWidth,
            PROTOTYPE_ONLY.stallPanelHeight,
        );
        panelGraphics.fill();
        this.node.addChild(panel);

        const titleNode = new Node('Title');
        titleNode.layer = UI_2D_LAYER;
        titleNode.setPosition(0, PROTOTYPE_ONLY.stallPanelHeight / 2 - 34, 0);
        const titleTransform = titleNode.addComponent(UITransform);
        titleTransform.setContentSize(PROTOTYPE_ONLY.stallPanelWidth, 40);
        const title = titleNode.addComponent(Label);
        title.useSystemFont = true;
        title.fontFamily = 'Arial';
        title.fontSize = 24;
        title.color = COLOR_TITLE;
        title.horizontalAlign = HorizontalTextAlignment.CENTER;
        title.verticalAlign = VerticalTextAlignment.CENTER;
        title.cacheMode = Label.CacheMode.CHAR;
        this.node.addChild(titleNode);
        this.titleLabel = title;

        const coinNode = new Node('Coins');
        coinNode.layer = UI_2D_LAYER;
        coinNode.setPosition(0, -PROTOTYPE_ONLY.stallPanelHeight / 2 + 24, 0);
        const coinTransform = coinNode.addComponent(UITransform);
        coinTransform.setContentSize(PROTOTYPE_ONLY.stallPanelWidth, 30);
        const coin = coinNode.addComponent(Label);
        coin.useSystemFont = true;
        coin.fontFamily = 'Arial';
        coin.fontSize = 20;
        coin.color = COLOR_TEXT;
        coin.horizontalAlign = HorizontalTextAlignment.CENTER;
        coin.verticalAlign = VerticalTextAlignment.CENTER;
        coin.cacheMode = Label.CacheMode.CHAR;
        this.node.addChild(coinNode);
        this.coinLabel = coin;
    }

    /** 建一个选项卡 */
    private buildOption(title: string, price: string, desc: string, color: Color, onClick: () => void): Node {
        const node = new Node('Option');
        node.layer = UI_2D_LAYER;
        const transform = node.addComponent(UITransform);
        transform.setContentSize(PROTOTYPE_ONLY.stallOptionWidth, PROTOTYPE_ONLY.stallOptionHeight);

        const graphics = node.addComponent(Graphics);
        graphics.fillColor = color;
        graphics.rect(
            -PROTOTYPE_ONLY.stallOptionWidth / 2,
            -PROTOTYPE_ONLY.stallOptionHeight / 2,
            PROTOTYPE_ONLY.stallOptionWidth,
            PROTOTYPE_ONLY.stallOptionHeight,
        );
        graphics.fill();

        const titleNode = new Node('Text');
        titleNode.layer = UI_2D_LAYER;
        titleNode.setPosition(0, PROTOTYPE_ONLY.stallOptionHeight / 2 - 28, 0);
        const titleTransform = titleNode.addComponent(UITransform);
        titleTransform.setContentSize(PROTOTYPE_ONLY.stallOptionWidth, 32);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.useSystemFont = true;
        titleLabel.fontFamily = 'Arial';
        titleLabel.fontSize = 18;
        titleLabel.color = COLOR_TEXT;
        titleLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
        titleLabel.verticalAlign = VerticalTextAlignment.CENTER;
        titleLabel.cacheMode = Label.CacheMode.CHAR;
        titleLabel.string = title;
        node.addChild(titleNode);

        const priceNode = new Node('Price');
        priceNode.layer = UI_2D_LAYER;
        priceNode.setPosition(0, PROTOTYPE_ONLY.stallOptionHeight / 2 - 58, 0);
        const priceTransform = priceNode.addComponent(UITransform);
        priceTransform.setContentSize(PROTOTYPE_ONLY.stallOptionWidth, 26);
        const priceLabel = priceNode.addComponent(Label);
        priceLabel.useSystemFont = true;
        priceLabel.fontFamily = 'Arial';
        priceLabel.fontSize = 15;
        priceLabel.color = COLOR_TITLE;
        priceLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
        priceLabel.verticalAlign = VerticalTextAlignment.CENTER;
        priceLabel.cacheMode = Label.CacheMode.CHAR;
        priceLabel.string = price;
        node.addChild(priceNode);

        const descNode = new Node('Desc');
        descNode.layer = UI_2D_LAYER;
        descNode.setPosition(0, -14, 0);
        const descTransform = descNode.addComponent(UITransform);
        descTransform.setContentSize(PROTOTYPE_ONLY.stallOptionWidth - 16, 70);
        const descLabel = descNode.addComponent(Label);
        descLabel.useSystemFont = true;
        descLabel.fontFamily = 'Arial';
        descLabel.fontSize = 13;
        descLabel.color = COLOR_TEXT;
        descLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
        descLabel.verticalAlign = VerticalTextAlignment.CENTER;
        descLabel.cacheMode = Label.CacheMode.CHAR;
        descLabel.string = desc;
        node.addChild(descNode);

        node.on(Node.EventType.TOUCH_END, onClick, this);
        return node;
    }

    /** 清掉旧选项卡 */
    private clearOptionNodes(): void {
        for (const node of this.optionNodes) {
            node.destroy();
        }
        this.optionNodes.length = 0;
    }
}
