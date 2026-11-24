/**
 * 食材掉落物 —— Step 4
 *
 * 职责：灰盒食材块（色块 + 文字），携带「经验值 + 金币」，
 *      玩家走近后由 DropManager 结算并回收。
 */
import { _decorator, Component, Node, Graphics, Color, Label, UITransform, HorizontalTextAlignment, VerticalTextAlignment } from 'cc';
import { PoolUtil } from '../core/PoolUtil';
import { DEFAULT_LAYER } from '../core/Layers';
import { PROTOTYPE_ONLY } from '../Config';

const { ccclass } = _decorator;

/** 普通食材配色 */
const COLOR_DROP = new Color(126, 200, 122, 255);
/** 大食材（精英掉落）配色 */
const COLOR_DROP_BIG = new Color(214, 148, 74, 255);
/** 文字配色 */
const COLOR_TEXT = new Color(28, 28, 32, 255);

@ccclass('FoodDrop')
export class FoodDrop extends Component {
    /** 拾取获得的经验 */
    public exp = 0;
    /** 拾取获得的金币 */
    public coins = 0;
    /** 是否大食材 */
    public big = false;

    /** 所属对象池 */
    private pool: PoolUtil<Node> | null = null;
    /** 灰盒绘制组件 */
    private graphics: Graphics | null = null;
    /** 灰盒文字 */
    private label: Label | null = null;

    /**
     * 初始化（从池中取出时调用）。
     * @param exp 经验值
     * @param coins 金币
     * @param big 是否大食材
     * @param pool 所属对象池
     */
    public setup(exp: number, coins: number, big: boolean, pool: PoolUtil<Node>): void {
        this.exp = exp;
        this.coins = coins;
        this.big = big;
        this.pool = pool;
        this.cacheComponents();
        this.draw();
    }

    /** 归还对象池 */
    public recycle(): void {
        const pool = this.pool;
        this.pool = null;
        if (pool) {
            pool.release(this.node);
        }
    }

    private cacheComponents(): void {
        if (!this.graphics) {
            this.graphics = this.node.getComponent(Graphics);
        }
        if (!this.label) {
            const labelNode = this.node.getChildByName('Text');
            this.label = labelNode ? labelNode.getComponent(Label) : null;
        }
    }

    /** 灰盒绘制：色块 + 「菜」/「肉」 */
    private draw(): void {
        const size = this.big ? PROTOTYPE_ONLY.bigDropSize : PROTOTYPE_ONLY.dropSize;
        const g = this.graphics;
        if (g) {
            g.clear();
            g.fillColor = this.big ? COLOR_DROP_BIG : COLOR_DROP;
            g.rect(-size / 2, -size / 2, size, size);
            g.fill();
        }
        if (this.label) {
            this.label.string = this.big ? '肉' : '菜';
            this.label.color = COLOR_TEXT;
        }
    }

    /** 对象池工厂：创建一枚食材节点 */
    public static createNode(container: Node, size: number): Node {
        const node = new Node('FoodDrop');
        node.layer = DEFAULT_LAYER;
        const transform = node.addComponent(UITransform);
        transform.setContentSize(size, size);
        node.addComponent(Graphics);

        const labelNode = new Node('Text');
        labelNode.layer = DEFAULT_LAYER;
        const labelTransform = labelNode.addComponent(UITransform);
        labelTransform.setContentSize(size, size);
        const label = labelNode.addComponent(Label);
        label.useSystemFont = true;
        label.fontFamily = 'Arial';
        label.fontSize = Math.round(size * 0.6);
        label.horizontalAlign = HorizontalTextAlignment.CENTER;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        label.color = COLOR_TEXT;
        label.cacheMode = Label.CacheMode.CHAR;
        node.addChild(labelNode);

        container.addChild(node);
        node.active = false;
        return node;
    }
}
