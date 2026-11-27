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
import { GameManager } from '../core/GameManager';
import { GLOBAL, PROTOTYPE_ONLY } from '../Config';
import { StallManager } from '../stall/StallManager';
import { EnemySpawner } from '../enemy/EnemySpawner';

const { ccclass } = _decorator;

/** 经验条底色 */
const COLOR_BAR_BACK = new Color(20, 20, 24, 255);
/** 经验条填充色 */
const COLOR_EXP = new Color(86, 196, 118, 255);
/** 文字颜色 */
const COLOR_TEXT = new Color(236, 236, 236, 255);
/** 基地血条填充色 */
const COLOR_BASE = new Color(96, 186, 120, 255);
/** 精英血条填充色 */
const COLOR_ELITE = new Color(214, 84, 84, 255);

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
    /** 波次文字 */
    private waveLabel: Label | null = null;
    /** 波次总控 */
    private manager: GameManager | null = null;
    /** 摊位管理（Step 7：基地血量） */
    private stallManager: StallManager | null = null;
    /** 刷怪器（Step 7：精英血量） */
    private spawner: EnemySpawner | null = null;
    /** 基地血条填充 */
    private baseBarFill: Graphics | null = null;
    /** 基地血量文字 */
    private baseLabel: Label | null = null;
    /** 精英血条节点 */
    private eliteBarNode: Node | null = null;
    /** 精英血条填充 */
    private eliteBarFill: Graphics | null = null;
    /** 精英血量文字 */
    private eliteLabel: Label | null = null;
    /** 上次绘制的血量（避免每帧重绘） */
    private lastBaseHp = -1;
    private lastEliteHp = -1;

    /** 上一次的数值（用于判断是否需要重画） */
    private lastExp = -1;
    private lastLevel = -1;
    private lastCoins = -1;
    private lastWave = -1;

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
        const waveNode = this.node.scene?.getChildByPath('Canvas/UI/WaveText');
        if (waveNode) {
            this.waveLabel = waveNode.getComponent(Label);
            if (this.waveLabel) {
                this.waveLabel.useSystemFont = true;
                this.waveLabel.fontFamily = 'Arial';
                this.waveLabel.color = COLOR_TEXT;
                this.waveLabel.horizontalAlign = HorizontalTextAlignment.LEFT;
                this.waveLabel.verticalAlign = VerticalTextAlignment.CENTER;
            }
        }
        this.buildStatusBars();
        this.refresh(true);
    }

    protected update(): void {
        if (!this.stats) {
            return;
        }
        this.refresh(false);
        this.refreshWave();
        this.refreshStatusBars();
    }

    /**
     * Step 7：基地血条（屏幕下方中间）+ 精英血条（屏幕上方中间，精英在场才显示）。
     */
    private buildStatusBars(): void {
        const canvasSize = this.node.scene?.getChildByPath('Canvas')?.getComponent(UITransform)?.contentSize;
        const h = canvasSize ? canvasSize.height : 720;

        // 基地血条
        const baseNode = new Node('BaseStallBar');
        baseNode.layer = UI_2D_LAYER;
        baseNode.setPosition(0, -h / 2 + 56, 0);
        const baseTransform = baseNode.addComponent(UITransform);
        baseTransform.setContentSize(PROTOTYPE_ONLY.baseHpBarWidth, PROTOTYPE_ONLY.baseHpBarHeight);
        const baseBack = baseNode.addComponent(Graphics);
        baseBack.fillColor = COLOR_BAR_BACK;
        baseBack.rect(-PROTOTYPE_ONLY.baseHpBarWidth / 2, -PROTOTYPE_ONLY.baseHpBarHeight / 2,
            PROTOTYPE_ONLY.baseHpBarWidth, PROTOTYPE_ONLY.baseHpBarHeight);
        baseBack.fill();
        const baseFillNode = new Node('Fill');
        const baseFillTransform = baseFillNode.addComponent(UITransform);
        baseFillTransform.setContentSize(PROTOTYPE_ONLY.baseHpBarWidth, PROTOTYPE_ONLY.baseHpBarHeight);
        this.baseBarFill = baseFillNode.addComponent(Graphics);
        baseNode.addChild(baseFillNode);
        this.node.addChild(baseNode);

        const baseLabelNode = new Node('BaseStallLabel');
        baseLabelNode.layer = UI_2D_LAYER;
        baseLabelNode.setPosition(0, -h / 2 + 56 + PROTOTYPE_ONLY.baseHpBarHeight / 2 + 12, 0);
        const baseLabelTransform = baseLabelNode.addComponent(UITransform);
        baseLabelTransform.setContentSize(220, 20);
        const baseLabel = baseLabelNode.addComponent(Label);
        baseLabel.useSystemFont = true;
        baseLabel.fontFamily = 'Arial';
        baseLabel.fontSize = 14;
        baseLabel.color = COLOR_TEXT;
        baseLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
        baseLabel.verticalAlign = VerticalTextAlignment.CENTER;
        baseLabel.cacheMode = Label.CacheMode.CHAR;
        this.node.addChild(baseLabelNode);
        this.baseLabel = baseLabel;

        // 精英血条（默认隐藏，精英在场才显示）
        const eliteNode = new Node('EliteBar');
        eliteNode.layer = UI_2D_LAYER;
        eliteNode.setPosition(0, h / 2 - 190, 0);
        const eliteTransform = eliteNode.addComponent(UITransform);
        eliteTransform.setContentSize(PROTOTYPE_ONLY.eliteHpBarWidth, PROTOTYPE_ONLY.eliteHpBarHeight);
        const eliteBack = eliteNode.addComponent(Graphics);
        eliteBack.fillColor = COLOR_BAR_BACK;
        eliteBack.rect(-PROTOTYPE_ONLY.eliteHpBarWidth / 2, -PROTOTYPE_ONLY.eliteHpBarHeight / 2,
            PROTOTYPE_ONLY.eliteHpBarWidth, PROTOTYPE_ONLY.eliteHpBarHeight);
        eliteBack.fill();
        const eliteFillNode = new Node('Fill');
        const eliteFillTransform = eliteFillNode.addComponent(UITransform);
        eliteFillTransform.setContentSize(PROTOTYPE_ONLY.eliteHpBarWidth, PROTOTYPE_ONLY.eliteHpBarHeight);
        this.eliteBarFill = eliteFillNode.addComponent(Graphics);
        eliteNode.addChild(eliteFillNode);
        this.node.addChild(eliteNode);
        this.eliteBarNode = eliteNode;

        const eliteLabelNode = new Node('EliteLabel');
        eliteLabelNode.layer = UI_2D_LAYER;
        eliteLabelNode.setPosition(0, h / 2 - 190 + PROTOTYPE_ONLY.eliteHpBarHeight / 2 + 14, 0);
        const eliteLabelTransform = eliteLabelNode.addComponent(UITransform);
        eliteLabelTransform.setContentSize(260, 22);
        const eliteLabel = eliteLabelNode.addComponent(Label);
        eliteLabel.useSystemFont = true;
        eliteLabel.fontFamily = 'Arial';
        eliteLabel.fontSize = 16;
        eliteLabel.color = COLOR_ELITE;
        eliteLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
        eliteLabel.verticalAlign = VerticalTextAlignment.CENTER;
        eliteLabel.cacheMode = Label.CacheMode.CHAR;
        this.node.addChild(eliteLabelNode);
        this.eliteLabel = eliteLabel;

        eliteNode.active = false;
        eliteLabelNode.active = false;
    }

    /**
     * 刷新基地血条与精英血条。
     * StallManager / EnemySpawner 可能晚于 HUD 装配 → 延迟取一次。
     */
    private refreshStatusBars(): void {
        if (!this.stallManager) {
            const node = this.node.scene?.getChildByPath('Canvas/StallManager');
            this.stallManager = node ? (node.getComponent('StallManager') as StallManager | null) : null;
            if (!this.stallManager) {
                return;
            }
        }
        if (!this.spawner) {
            const node = this.node.scene?.getChildByPath('Canvas/Actors/Enemies');
            this.spawner = node ? (node.getComponent('EnemySpawner') as EnemySpawner | null) : null;
            if (!this.spawner) {
                return;
            }
        }
        // 基地血量
        const hp = this.stallManager.baseStallHp;
        const maxHp = this.stallManager.baseStallMaxHp;
        if (hp !== this.lastBaseHp) {
            this.lastBaseHp = hp;
            const g = this.baseBarFill;
            if (g) {
                const w = PROTOTYPE_ONLY.baseHpBarWidth;
                const h = PROTOTYPE_ONLY.baseHpBarHeight;
                const ratio = maxHp > 0 ? Math.max(0, hp / maxHp) : 0;
                g.clear();
                g.fillColor = COLOR_BASE;
                g.rect(-w / 2, -h / 2, w * ratio, h);
                g.fill();
            }
            if (this.baseLabel) {
                this.baseLabel.string = `基地摊位 ${hp}/${maxHp}`;
            }
        }
        // 精英血量（单独显示）
        const elites = this.spawner.aliveElites;
        if (elites.length === 0) {
            if (this.eliteBarNode && this.eliteBarNode.active) {
                this.eliteBarNode.active = false;
                if (this.eliteLabel && this.eliteLabel.node.active) {
                    this.eliteLabel.node.active = false;
                }
                this.lastEliteHp = -1;
            }
            return;
        }
        const elite = elites[0];
        if (this.eliteBarNode && !this.eliteBarNode.active) {
            this.eliteBarNode.active = true;
            if (this.eliteLabel) {
                this.eliteLabel.node.active = true;
            }
            this.lastEliteHp = -1;
        }
        if (elite.hp !== this.lastEliteHp) {
            this.lastEliteHp = elite.hp;
            const g = this.eliteBarFill;
            if (g) {
                const w = PROTOTYPE_ONLY.eliteHpBarWidth;
                const h = PROTOTYPE_ONLY.eliteHpBarHeight;
                const ratio = elite.maxHp > 0 ? Math.max(0, elite.hp / elite.maxHp) : 0;
                g.clear();
                g.fillColor = COLOR_ELITE;
                g.rect(-w / 2, -h / 2, w * ratio, h);
                g.fill();
            }
            if (this.eliteLabel) {
                const name = elite.enemyConfig ? elite.enemyConfig.name : '精英';
                this.eliteLabel.string = `${name} ${Math.ceil(elite.hp)}/${elite.maxHp}`;
            }
        }
    }

    /**
     * 刷新波次文字（Step 5：波次由 GameManager 推进）。
     * GameManager 可能比 HUD 晚一步创建（SceneSetup 的装配顺序），所以这里按需再取一次。
     */
    private refreshWave(): void {
        if (!this.manager) {
            const node = this.node.scene?.getChildByPath('Canvas/GameManager');
            this.manager = node ? (node.getComponent('GameManager') as GameManager | null) : null;
            if (!this.manager) {
                return;
            }
        }
        if (this.waveLabel && this.lastWave !== this.manager.waveNumber) {
            this.lastWave = this.manager.waveNumber;
            this.waveLabel.string = `第 ${this.lastWave} / ${GLOBAL.runWaves} 波`;
        }
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
