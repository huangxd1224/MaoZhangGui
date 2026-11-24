/**
 * 对象池工具 —— Step 3
 *
 * 纪律（03 文档「敌人/投射物/掉落物用对象池」）：
 *   - 敌人节点只在预热时 instantiate，运行期只做 active 切换，不再 new 节点；
 *   - 回收时节点留在池容器下、active = false，避免反复 addChild/removeParent；
 *   - 池本身不含玩法数值，容量由调用方（刷怪器）按 Config 决定。
 */
import { Node } from 'cc';

export class PoolUtil<T extends Node> {
    /** 空闲节点（可复用） */
    private readonly freeList: T[] = [];
    /** 正在使用的节点 */
    private readonly usedSet: Set<T> = new Set<T>();
    /** 累计创建过的节点数（自检用：应等于预热 + 池空时新增） */
    private createdCount = 0;

    /**
     * @param factory 创建新节点的工厂（只应 instantiate 节点，不做业务初始化）
     * @param prewarm 预热数量
     */
    constructor(private readonly factory: () => T, prewarm = 0) {
        for (let i = 0; i < prewarm; i++) {
            const node = this.factory();
            this.createdCount++;
            node.active = false;
            this.freeList.push(node);
        }
    }

    /** 取一个可用节点（池空时才新建） */
    public acquire(): T {
        const node = this.freeList.pop() ?? this.createNode();
        this.usedSet.add(node);
        node.active = true;
        return node;
    }

    /** 归还节点（重复归还会被忽略） */
    public release(node: T): void {
        if (!this.usedSet.has(node)) {
            return;
        }
        this.usedSet.delete(node);
        node.active = false;
        this.freeList.push(node);
    }

    /** 当前在用节点数 */
    public get activeCount(): number {
        return this.usedSet.size;
    }

    /** 池中空闲节点数 */
    public get freeCount(): number {
        return this.freeList.length;
    }

    /** 累计创建过的节点总数（自检：稳定后不应继续增长） */
    public get created(): number {
        return this.createdCount;
    }

    private createNode(): T {
        const node = this.factory();
        this.createdCount++;
        return node;
    }
}
