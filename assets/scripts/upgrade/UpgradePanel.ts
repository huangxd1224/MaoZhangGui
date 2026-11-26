/**
 * 升级三选一面板 —— Step 5
 *
 * 职责：
 *   1. 玩家升级时弹出，提供「新菜 / 升级 / 被动」三类选项，权重 40 / 40 / 20（读 Config）；
 *   2. 面板弹出期间**游戏暂停**（由外部注入的 onPauseChange 回调控制）；
 *   3. 选中后把效果应用到武器栏 / 被动加成，并恢复游戏。
 *
 * 说明：
 *   - 武器栏通过 DishUpgradeTarget 接口访问（不直接 import WeaponManager，避免循环依赖）；
 *   - UI 全部运行时创建（工程里没有按钮预制体），新建节点必须显式设 UI_2D 层。
 */
import { _decorator, Component, Node, Graphics, Color, Label, UITransform, HorizontalTextAlignment, VerticalTextAlignment } from 'cc';
import { DISHES, DishConfig, PassiveConfig, PASSIVES, LEVEL_UP_CHOICE_WEIGHTS, PROTOTYPE_ONLY, RecipeConfig } from '../Config';
import { UI_2D_LAYER } from '../core/Layers';
import { UpgradeState } from '../core/UpgradeState';

const { ccclass } = _decorator;

/** 武器栏接口（由 WeaponManager 实现；此处用结构化类型避免循环 import） */
export interface DishUpgradeTarget {
    /** 是否已拥有该菜 */
    hasDish(dishId: string): boolean;
    /** 已拥有的菜 id 列表 */
    ownedDishIds(): string[];
    /** 该菜的当前等级（未拥有返回 0） */
    dishLevel(dishId: string): number;
    /** 新增一道菜 */
    addDish(dishId: string, level?: number): boolean;
    /** 已有菜升一级 */
    levelUp(dishId: string): boolean;
    /** 当前是否有可进化的配方（Step 6：两道基础菜都满级） */
    canEvolve(): RecipeConfig | null;
    /** 执行进化（Step 6：两道基础菜退出武器栏，换成进化菜） */
    evolve(recipeId: string): boolean;
}

/** 面板的一个选项 */
export interface UpgradeOption {
    /** 选项类别 */
    kind: 'newDish' | 'upgrade' | 'passive' | 'evolution';
    /** 标题（面板显示） */
    title: string;
    /** 描述（面板显示） */
    desc: string;
    /** 新菜 / 升级 / 进化对应的菜品 id */
    dishId?: string;
    /** 被动配置 */
    passive?: PassiveConfig;
    /** 进化配方（kind = evolution） */
    recipe?: RecipeConfig;
}

/** 选项类别配色（视觉常量） */
const COLOR_OPTION_NEW = new Color(214, 138, 62, 255);
const COLOR_OPTION_UPGRADE = new Color(72, 132, 214, 255);
const COLOR_OPTION_PASSIVE = new Color(96, 186, 120, 255);
const COLOR_OPTION_EVOLUTION = new Color(198, 108, 226, 255);
const COLOR_PANEL_BG = new Color(30, 34, 44, 245);
const COLOR_MASK = new Color(0, 0, 0, 170);
const COLOR_TITLE = new Color(246, 214, 120, 255);
const COLOR_TEXT = new Color(236, 236, 236, 255);

/** 被动 id → 面板文案（数值仍读 PASSIVES.perStack） */
const PASSIVE_LABEL: { [id: string]: string } = {
    speed: '移速',
    pickup: '拾取范围',
    maxhp: '最大生命',
    attack: '伤害',
    haste: '冷却',
    area: '范围',
    coins: '金币',
    exp: '经验',
};

@ccclass('UpgradePanel')
export class UpgradePanel extends Component {
    /** 武器栏 */
    private target: DishUpgradeTarget | null = null;
    /** 暂停回调（由外部注入，指向 GameManager.setPaused） */
    private onPauseChange: ((paused: boolean) => void) | null = null;
    /** 当前选项 */
    private options: UpgradeOption[] = [];
    /** 面板是否显示 */
    private shown = false;
    /** 选项卡节点（用于重建与销毁） */
    private optionNodes: Node[] = [];
    /** 标题节点 */
    private titleLabel: Label | null = null;

    /**
     * 装配。
     * @param target 武器栏
     * @param onPauseChange 暂停回调（传 true = 暂停）
     */
    public setup(target: DishUpgradeTarget, onPauseChange: (paused: boolean) => void): void {
        this.target = target;
        this.onPauseChange = onPauseChange;
        this.buildFrame();
        this.node.active = false;
    }

    /** 面板是否显示 */
    public get visible(): boolean {
        return this.shown;
    }

    /** 当前选项（自检用） */
    public get currentOptions(): UpgradeOption[] {
        return this.options;
    }

    /**
     * 打开面板：抽签 → 建 UI → 暂停游戏。
     * @returns 是否成功打开（无可选选项时返回 false）
     */
    public open(): boolean {
        if (this.shown || !this.target) {
            return false;
        }
        const options = this.rollOptions();
        if (options.length === 0) {
            return false;
        }
        this.options = options;
        this.buildOptions(options);
        this.node.active = true;
        this.shown = true;
        if (this.onPauseChange) {
            this.onPauseChange(true);
        }
        return true;
    }

    /**
     * 选择一个选项（点击或脚本调用）。
     * @param index 选项序号
     */
    public choose(index: number): void {
        if (!this.shown || index < 0 || index >= this.options.length) {
            return;
        }
        const option = this.options[index];
        this.applyOption(option);
        if (this.onChosen) {
            this.onChosen(option);
        }
        this.close();
    }

    /** 关闭面板并恢复游戏 */
    private close(): void {
        this.shown = false;
        this.node.active = false;
        this.clearOptionNodes();
        if (this.onPauseChange) {
            this.onPauseChange(false);
        }
    }

    /** 应用选项效果 */
    private applyOption(option: UpgradeOption): void {
        if (!this.target) {
            return;
        }
        if (option.kind === 'newDish' && option.dishId) {
            this.target.addDish(option.dishId, 1);
        } else if (option.kind === 'upgrade' && option.dishId) {
            this.target.levelUp(option.dishId);
        } else if (option.kind === 'passive' && option.passive) {
            // 被动加成由 UpgradeState 汇总（此处只登记）
            this.onPassiveChosen(option.passive);
        } else if (option.kind === 'evolution' && option.recipe) {
            // Step 6：进化（两道基础菜满级 → 换成进化菜）
            this.target.evolve(option.recipe.id);
        }
    }

    /** 被动登记回调（外部注入 → UpgradeState.addPassive） */
    public onPassiveChosen: ((passive: PassiveConfig) => void) | null = null;

    /** 选项选定回调（外部注入 → 消耗一次待处理升级） */
    public onChosen: ((option: UpgradeOption) => void) | null = null;

    // ==================== 抽签 ====================

    /**
     * 抽三个选项。
     *
     * Step 6 规则：**进化选项必出**，不参与 40/40/20 的随机权重 ——
     * 只要配方条件满足（两道基础菜满级），第一个格子固定是进化，
     * 剩下两格才按权重抽。
     */
    private rollOptions(): UpgradeOption[] {
        const kinds: Array<'newDish' | 'upgrade' | 'passive'> = ['newDish', 'upgrade', 'passive'];
        const result: UpgradeOption[] = [];
        // 去重按「类别 + 目标」而不是标题 —— 标题里带等级（"升级：烤串 Lv.1"），
        // 同一道菜的两次升级标题不同，按标题去重会漏掉，面板会出现两个同样的选项。
        const usedKeys = new Set<string>();

        // 进化选项：必出，不占随机权重
        const recipe = this.target ? this.target.canEvolve() : null;
        if (recipe) {
            const option: UpgradeOption = {
                kind: 'evolution',
                dishId: recipe.id,
                recipe,
                title: `进化：${recipe.name}`,
                desc: `${recipe.desc}，伤害×${recipe.damageMul}`,
            };
            result.push(option);
            usedKeys.add(`evolution:${recipe.id}`);
        }

        for (let i = result.length; i < 3; i++) {
            let picked: UpgradeOption | null = null;
            // 最多尝试 12 次：每次按权重抽类别，抽到空类别就换
            for (let attempt = 0; attempt < 12 && !picked; attempt++) {
                const kind = this.rollKind(kinds);
                const option = this.pickOptionOfKind(kind, usedKeys);
                if (option) {
                    picked = option;
                }
            }
            if (!picked) {
                break;
            }
            usedKeys.add(this.keyOf(picked));
            result.push(picked);
        }
        return result;
    }

    /** 选项的去重键 */
    private keyOf(option: UpgradeOption): string {
        if (option.kind === 'passive' && option.passive) {
            return `passive:${option.passive.id}`;
        }
        return `${option.kind}:${option.dishId ?? ''}`;
    }

    /** 按权重抽一个类别（权重读 Config.LEVEL_UP_CHOICE_WEIGHTS：40 / 40 / 20） */
    private rollKind(kinds: Array<'newDish' | 'upgrade' | 'passive'>): 'newDish' | 'upgrade' | 'passive' {
        const weights = LEVEL_UP_CHOICE_WEIGHTS;
        const total = weights.newDish + weights.upgradeDish + weights.passive;
        let roll = Math.random() * total;
        for (const kind of kinds) {
            roll -= kind === 'upgrade' ? weights.upgradeDish : weights[kind];
            if (roll <= 0) {
                return kind;
            }
        }
        return kinds[kinds.length - 1];
    }

    /** 在某类别里抽一个具体选项（没有可用目标返回 null） */
    private pickOptionOfKind(kind: 'newDish' | 'upgrade' | 'passive', usedKeys: Set<string>): UpgradeOption | null {
        if (kind === 'newDish') {
            const candidates = this.newDishCandidates().filter((d) => !usedKeys.has(`newDish:${d.id}`));
            if (candidates.length === 0) {
                return null;
            }
            const dish = candidates[Math.floor(Math.random() * candidates.length)];
            return { kind: 'newDish', dishId: dish.id, title: `新菜：${dish.name}`, desc: this.describeDish(dish) };
        }
        if (kind === 'upgrade') {
            const candidates = this.upgradeCandidates().filter((d) => !usedKeys.has(`upgrade:${d.id}`));
            if (candidates.length === 0) {
                return null;
            }
            const dish = candidates[Math.floor(Math.random() * candidates.length)];
            return { kind: 'upgrade', dishId: dish.id, title: `升级：${dish.name} Lv.${this.levelOf(dish)}`, desc: '提升该菜伤害与效果' };
        }
        const candidates = this.passiveCandidates().filter((p) => !usedKeys.has(`passive:${p.id}`));
        if (candidates.length === 0) {
            return null;
        }
        const passive = candidates[Math.floor(Math.random() * candidates.length)];
        return { kind: 'passive', passive, title: `被动：${passive.name}`, desc: this.describePassive(passive) };
    }

    /** 可选的新菜：原型菜里还没拥有的（武器栏满 4 格则不再出新菜） */
    private newDishCandidates(): DishConfig[] {
        if (!this.target) {
            return [];
        }
        const owned = new Set(this.target.ownedDishIds());
        if (owned.size >= PROTOTYPE_ONLY.weaponSlots) {
            return [];
        }
        return DISHES.filter((d) => d.inPrototype && !owned.has(d.id));
    }

    /** 可升级的菜：已拥有且未满级 */
    private upgradeCandidates(): DishConfig[] {
        if (!this.target) {
            return [];
        }
        const owned = new Set(this.target.ownedDishIds());
        return DISHES.filter((d) => d.inPrototype && owned.has(d.id) && this.levelOf(d) < d.maxLevel);
    }

    /** 可选的被动（策划表 PASSIVES 里还没叠满的；被动栏 4 格占满则不再出新被动） */
    private passiveCandidates(): PassiveConfig[] {
        if (UpgradeState.passiveStacks.length >= PROTOTYPE_ONLY.passiveSlots) {
            return [];
        }
        return PASSIVES.filter((p) => UpgradeState.stackOf(p.id) < p.maxStacks);
    }

    /** 被动描述（文案；数值读 PASSIVES 的 perStack / maxStacks） */
    private describePassive(passive: PassiveConfig): string {
        const next = UpgradeState.stackOf(passive.id) + 1;
        if (passive.id === 'maxhp') {
            return `最大生命 +${passive.perStack}（${next}/${passive.maxStacks} 层）`;
        }
        const percent = Math.round(Math.abs(passive.perStack) * 100);
        const sign = passive.perStack < 0 ? '-' : '+';
        const label = PASSIVE_LABEL[passive.id] ?? passive.name;
        return `${label} ${sign}${percent}%（${next}/${passive.maxStacks} 层）`;
    }

    /** 某菜当前等级 */
    private levelOf(dish: DishConfig): number {
        return this.target ? this.target.dishLevel(dish.id) : 1;
    }

    /** 菜品效果描述（读 Config 的数值） */
    private describeDish(dish: DishConfig): string {
        switch (dish.type) {
            case 'projectile':
                return `签子伤害 ${dish.damage}，冷却 ${dish.cooldownSec}s`;
            case 'aura_dot':
                return `光环半径 ${dish.radius}，伤害 ${dish.damage}，灼烧 ${dish.burnDps}/秒`;
            case 'orbit':
                return `${dish.orbitCount} 瓣环绕，半径 ${dish.orbitRadius}，伤害 ${dish.damage}`;
            case 'freeze_aoe':
                return `冰冻范围 ${dish.radius}，伤害 ${dish.damage}，冰冻 ${dish.freezeDurationSec}s`;
            default:
                return '新菜品';
        }
    }

    // ==================== UI ====================

    /** 建面板外框（遮罩 + 标题） */
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
        panelTransform.setContentSize(PROTOTYPE_ONLY.upgradePanelWidth, PROTOTYPE_ONLY.upgradePanelHeight);
        const panelGraphics = panel.addComponent(Graphics);
        panelGraphics.fillColor = COLOR_PANEL_BG;
        panelGraphics.rect(
            -PROTOTYPE_ONLY.upgradePanelWidth / 2,
            -PROTOTYPE_ONLY.upgradePanelHeight / 2,
            PROTOTYPE_ONLY.upgradePanelWidth,
            PROTOTYPE_ONLY.upgradePanelHeight,
        );
        panelGraphics.fill();
        this.node.addChild(panel);

        // 标题
        const titleNode = new Node('Title');
        titleNode.layer = UI_2D_LAYER;
        titleNode.setPosition(0, PROTOTYPE_ONLY.upgradePanelHeight / 2 - 40, 0);
        const titleTransform = titleNode.addComponent(UITransform);
        titleTransform.setContentSize(PROTOTYPE_ONLY.upgradePanelWidth, 40);
        const title = titleNode.addComponent(Label);
        title.useSystemFont = true;
        title.fontFamily = 'Arial';
        title.fontSize = 28;
        title.color = COLOR_TITLE;
        title.horizontalAlign = HorizontalTextAlignment.CENTER;
        title.verticalAlign = VerticalTextAlignment.CENTER;
        title.cacheMode = Label.CacheMode.CHAR;
        this.node.addChild(titleNode);
        this.titleLabel = title;
    }

    /** 重建三个选项卡 */
    private buildOptions(options: UpgradeOption[]): void {
        this.clearOptionNodes();
        if (this.titleLabel) {
            this.titleLabel.string = '升级！三选一';
        }
        const step = PROTOTYPE_ONLY.upgradeOptionWidth + PROTOTYPE_ONLY.upgradeOptionSpacing;
        for (let i = 0; i < options.length; i++) {
            const option = options[i];
            const node = new Node(`Option${i}`);
            node.layer = UI_2D_LAYER;
            node.setPosition((i - (options.length - 1) / 2) * step, -10, 0);
            const transform = node.addComponent(UITransform);
            transform.setContentSize(PROTOTYPE_ONLY.upgradeOptionWidth, PROTOTYPE_ONLY.upgradeOptionHeight);

            const graphics = node.addComponent(Graphics);
            graphics.fillColor = this.colorOf(option.kind);
            graphics.rect(
                -PROTOTYPE_ONLY.upgradeOptionWidth / 2,
                -PROTOTYPE_ONLY.upgradeOptionHeight / 2,
                PROTOTYPE_ONLY.upgradeOptionWidth,
                PROTOTYPE_ONLY.upgradeOptionHeight,
            );
            graphics.fill();

            const titleNode = new Node('Text');
            titleNode.layer = UI_2D_LAYER;
            titleNode.setPosition(0, PROTOTYPE_ONLY.upgradeOptionHeight / 2 - 46, 0);
            const titleTransform = titleNode.addComponent(UITransform);
            titleTransform.setContentSize(PROTOTYPE_ONLY.upgradeOptionWidth, 44);
            const title = titleNode.addComponent(Label);
            title.useSystemFont = true;
            title.fontFamily = 'Arial';
            title.fontSize = 20;
            title.color = COLOR_TEXT;
            title.horizontalAlign = HorizontalTextAlignment.CENTER;
            title.verticalAlign = VerticalTextAlignment.CENTER;
            title.cacheMode = Label.CacheMode.CHAR;
            title.string = option.title;
            node.addChild(titleNode);

            const descNode = new Node('Desc');
            descNode.layer = UI_2D_LAYER;
            descNode.setPosition(0, -10, 0);
            const descTransform = descNode.addComponent(UITransform);
            descTransform.setContentSize(PROTOTYPE_ONLY.upgradeOptionWidth - 16, 90);
            const desc = descNode.addComponent(Label);
            desc.useSystemFont = true;
            desc.fontFamily = 'Arial';
            desc.fontSize = 14;
            desc.color = COLOR_TEXT;
            desc.horizontalAlign = HorizontalTextAlignment.CENTER;
            desc.verticalAlign = VerticalTextAlignment.CENTER;
            desc.cacheMode = Label.CacheMode.CHAR;
            desc.string = option.desc;
            node.addChild(descNode);

            // 点击选择（选项卡自身作为按钮）
            node.on(Node.EventType.TOUCH_END, () => this.choose(i), this);
            this.node.addChild(node);
            this.optionNodes.push(node);
        }
    }

    /** 清掉旧的选项卡 */
    private clearOptionNodes(): void {
        for (const node of this.optionNodes) {
            node.destroy();
        }
        this.optionNodes.length = 0;
    }

    /** 类别配色 */
    private colorOf(kind: UpgradeOption['kind']): Color {
        if (kind === 'newDish') {
            return COLOR_OPTION_NEW;
        }
        if (kind === 'upgrade') {
            return COLOR_OPTION_UPGRADE;
        }
        if (kind === 'evolution') {
            return COLOR_OPTION_EVOLUTION;
        }
        return COLOR_OPTION_PASSIVE;
    }
}
