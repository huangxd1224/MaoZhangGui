/**
 * 武器栏 / 被动栏 —— Step 6
 *
 * 职责：
 *   1. 底部左侧显示**武器栏**（4 格）：当前拥有的菜 + 等级（进化后显示进化菜）；
 *   2. 底部右侧显示**被动栏**（4 格）：已叠的被动 + 层数；
 *   3. 只在内容变化时刷新（Graphics/Label 重绘有开销）。
 *
 * 槽位数量读 Config.PROTOTYPE_ONLY（weaponSlots / passiveSlots）。
 * 运行时创建的节点必须显式设 UI_2D 层，否则 UI 相机不渲染。
 */
import { _decorator, Component, Node, Graphics, Color, Label, UITransform, HorizontalTextAlignment, VerticalTextAlignment } from 'cc';
import { DISHES, PASSIVES, PROTOTYPE_ONLY, RECIPES } from '../Config';
import { UI_2D_LAYER } from '../core/Layers';
import { UpgradeState } from '../core/UpgradeState';
import { WeaponManager } from '../weapon/WeaponManager';

const { ccclass } = _decorator;

/** 格子底色 */
const COLOR_SLOT_EMPTY = new Color(26, 30, 38, 190);
/** 格子有内容时的底色 */
const COLOR_SLOT_FILLED = new Color(58, 66, 84, 230);
/** 文字颜色 */
const COLOR_TEXT = new Color(236, 236, 236, 255);
/** 标题颜色 */
const COLOR_TITLE = new Color(246, 214, 120, 255);

@ccclass('LoadoutPanel')
export class LoadoutPanel extends Component {
    /** 武器栏来源 */
    private manager: WeaponManager | null = null;
    /** 武器格文字（每格一个） */
    private weaponLabels: Label[] = [];
    /** 被动格文字 */
    private passiveLabels: Label[] = [];
    /** 缓存键（只在变化时刷新） */
    private lastWeaponKey = '\u0000';
    private lastPassiveKey = '\u0000';
    /** 刷新计时（低频刷新用） */
    private refreshTimer = 0;

    /**
     * 装配。
     * @param manager 武器栏
     */
    public setup(manager: WeaponManager): void {
        this.manager = manager;
        const canvas = this.node.scene?.getChildByPath('Canvas');
        const size = canvas?.getComponent(UITransform)?.contentSize;
        const w = size ? size.width : 1280;
        const h = size ? size.height : 720;

        // 放在**右上角**：左下角会被 Creator 预览的调试浮层（FPS/Draw call）盖住。
        this.buildRow(
            '武器栏',
            PROTOTYPE_ONLY.weaponSlots,
            this.weaponLabels,
            w / 2 - PROTOTYPE_ONLY.slotBarMargin,
            h / 2 - 70,
            false,
        );
        this.buildRow(
            '被动栏',
            PROTOTYPE_ONLY.passiveSlots,
            this.passiveLabels,
            w / 2 - PROTOTYPE_ONLY.slotBarMargin,
            h / 2 - 150,
            false,
        );
        // 首次强制刷新一次（否则空栏会留着 Label 的默认文字 "label"）
        this.refreshWeapons();
        this.refreshPassives();
    }

    protected update(dt: number): void {
        if (!this.manager) {
            return;
        }
        // 低频刷新：weaponStats 每次调用都会新建数组，没必要每帧跑
        this.refreshTimer += dt;
        if (this.refreshTimer < 0.2) {
            return;
        }
        this.refreshTimer = 0;
        this.refreshWeapons();
        this.refreshPassives();
    }

    /** 建一排格子（标题 + N 个格子） */
    private buildRow(
        title: string,
        count: number,
        labels: Label[],
        anchorX: number,
        anchorY: number,
        fromLeft: boolean,
    ): void {
        const size = PROTOTYPE_ONLY.slotSize;
        const spacing = PROTOTYPE_ONLY.slotSpacing;

        // 标题
        const titleNode = new Node(`${title}Title`);
        titleNode.layer = UI_2D_LAYER;
        const titleTransform = titleNode.addComponent(UITransform);
        titleTransform.setContentSize(48, 20);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.useSystemFont = true;
        titleLabel.fontFamily = 'Arial';
        titleLabel.fontSize = 14;
        titleLabel.color = COLOR_TITLE;
        titleLabel.horizontalAlign = HorizontalTextAlignment.RIGHT;
        titleLabel.verticalAlign = VerticalTextAlignment.CENTER;
        titleLabel.cacheMode = Label.CacheMode.CHAR;
        titleLabel.string = title;
        // 标题放在整排的**左侧外边**（与格子同行）：
        // 放在排上方居中会正好压到中间那格的文字上。
        const rowWidth = size * count + spacing * (count - 1);
        const rowLeft = fromLeft ? anchorX : anchorX - rowWidth;
        titleNode.setPosition(rowLeft - 26, anchorY, 0);
        this.node.addChild(titleNode);

        const dir = fromLeft ? 1 : -1;
        for (let i = 0; i < count; i++) {
            const slot = new Node(`${title}Slot${i}`);
            slot.layer = UI_2D_LAYER;
            const transform = slot.addComponent(UITransform);
            transform.setContentSize(size, size);
            const graphics = slot.addComponent(Graphics);
            graphics.fillColor = COLOR_SLOT_EMPTY;
            graphics.rect(-size / 2, -size / 2, size, size);
            graphics.fill();

            // 从左往右排（武器栏）或从右往左排（被动栏）
            const offset = (i * (size + spacing)) * dir;
            const x = fromLeft ? anchorX + size / 2 + offset : anchorX - size / 2 + offset;
            slot.setPosition(x, anchorY + 22, 0);

            const labelNode = new Node('Text');
            labelNode.layer = UI_2D_LAYER;
            const labelTransform = labelNode.addComponent(UITransform);
            labelTransform.setContentSize(size, size);
            const label = labelNode.addComponent(Label);
            label.useSystemFont = true;
            label.fontFamily = 'Arial';
            label.fontSize = 12;
            label.color = COLOR_TEXT;
            label.horizontalAlign = HorizontalTextAlignment.CENTER;
            label.verticalAlign = VerticalTextAlignment.CENTER;
            label.cacheMode = Label.CacheMode.CHAR;
            slot.addChild(labelNode);

            this.node.addChild(slot);
            labels.push(label);
        }
    }

    /** 刷新武器栏 */
    private refreshWeapons(): void {
        if (!this.manager) {
            return;
        }
        const stats = this.manager.weaponStats;
        const key = stats.map((s) => `${s.dishId}:${s.level}`).join(',');
        if (key === this.lastWeaponKey) {
            return;
        }
        this.lastWeaponKey = key;
        for (let i = 0; i < this.weaponLabels.length; i++) {
            const label = this.weaponLabels[i];
            const stat = stats[i];
            if (!stat) {
                label.string = '';
                continue;
            }
            label.string = `${this.shortName(stat.dishId)}\nLv.${stat.level}`;
        }
    }

    /** 刷新被动栏 */
    private refreshPassives(): void {
        const stacks = UpgradeState.passiveStacks;
        const key = stacks.map((s) => `${s.id}:${s.stacks}`).join(',');
        if (key === this.lastPassiveKey) {
            return;
        }
        this.lastPassiveKey = key;
        for (let i = 0; i < this.passiveLabels.length; i++) {
            const label = this.passiveLabels[i];
            const stack = stacks[i];
            if (!stack) {
                label.string = '';
                continue;
            }
            const passive = PASSIVES.find((p) => p.id === stack.id);
            // 被动名在策划表里带说明（如"扩张（范围扩大）"），格子放不下 → 只取括号前
            const name = passive ? passive.name.split('（')[0] : stack.id;
            label.string = `${name}\n${stack.stacks}`;
        }
    }

    /** 菜品 id → 显示名（DISHES 里没有的进化菜去 RECIPES 找） */
    private shortName(dishId: string): string {
        const dish = DISHES.find((d) => d.id === dishId);
        if (dish) {
            return dish.name;
        }
        const recipe = RECIPES.find((r) => r.id === dishId);
        return recipe ? recipe.name : dishId;
    }
}
