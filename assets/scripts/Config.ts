/**
 * 数值配置 —— 全项目唯一的数值来源
 *
 * 数据来源：maozhanggui/config/game-config.json（version: maozhanggui-config-v2）
 * 纪律：所有数值（伤害、血量、价格、时间、概率）只允许写在本文件，
 *       禁止在 GameManager / Enemy / Weapon 等逻辑脚本里散写数值。
 *       调数只改本文件；原型期只允许调「敌人血量倍率 / 刷新间隔 / 三选一权重」三类。
 *
 * 范围纪律（重要）：
 *   本文件是 config JSON 的**全量镜像**，包含 12 道菜 / 12 条进化配方。
 *   但每条数据都带 inPrototype 标记：
 *     - inPrototype = true  → 原型期实现（4 道菜 + 麻辣烫 + 奶茶摊 + 老鼠/蟑螂/大胃王）；
 *     - inPrototype = false → MVP/V1.1 内容，原型期**只读不实现**，
 *       不写对应逻辑、不放进新菜池、不放进刷怪池。
 *   抽池/刷怪时必须用 inPrototype 过滤，别直接遍历全表。
 */

/** 配置版本，与源 JSON 对齐 */
export const CONFIG_VERSION = 'maozhanggui-config-v2';

/** 引擎版本 */
export const ENGINE = 'cocos-creator-3.8';

// ==================== 全局 ====================

export interface GlobalConfig {
    /** 单局总波数 */
    runWaves: number;
    /** 每波持续秒数 */
    waveDurationSec: number;
    /** 间歇摆摊持续秒数 */
    breakDurationSec: number;
    /** 第几波后进入间歇 */
    breakAfterWaves: number[];
    /** 同屏敌人上限（性能红线） */
    maxEnemiesOnScreen: number;
    /** 玩家血量 */
    playerHp: number;
    /** 玩家移动速度 */
    playerSpeed: number;
    /** 玩家拾取半径 */
    playerPickupRadius: number;
    /** 摊位（主基地）血量 */
    stallHp: number;
    /** 敌人碰到摊位每只扣血 */
    stallTouchDamage: number;
    /** 精英碰到摊位扣血 */
    stallTouchDamageElite: number;
    /** 普通食材经验值 */
    expNormal: number;
    /** 大食材（精英掉落）经验值 */
    expBig: number;
    /** 升级所需经验 = base + 当前等级 × perLevel */
    expToLevelBase: number;
    expToLevelPerLevel: number;
    /** 武器栏格数 */
    weaponSlots: number;
    /** 被动栏格数 */
    passiveSlots: number;
}

export const GLOBAL: GlobalConfig = {
    runWaves: 10,
    waveDurationSec: 20,
    breakDurationSec: 25,
    breakAfterWaves: [3, 6, 9],
    maxEnemiesOnScreen: 80,
    playerHp: 100,
    playerSpeed: 260,
    playerPickupRadius: 90,
    stallHp: 100,
    stallTouchDamage: 1,
    stallTouchDamageElite: 5,
    expNormal: 1,
    expBig: 10,
    expToLevelBase: 5,
    expToLevelPerLevel: 3,
    weaponSlots: 4,
    passiveSlots: 4,
};

// ==================== 菜（武器） ====================

/**
 * 菜的攻击类型。
 * 原型只实现 projectile / aura_dot / orbit / freeze_aoe 四种，
 * 其余类型对应 inPrototype = false 的菜，原型期不写实现。
 */
export type DishType =
    | 'projectile'    // 烤串：向最近敌人连发穿透签子
    | 'aura_dot'      // 辣椒粉：以自身为中心周期性撒粉，范围灼烧
    | 'orbit'         // 大蒜瓣：数瓣大蒜环绕自身旋转，近身伤害+击退
    | 'freeze_aoe'    // 冰啤酒：周期性冻结一片最密怪群
    | 'ground_dot'    // 铁板鱿鱼：地面留油滩，踩中持续掉血（MVP）
    | 'lobbed_aoe'    // 爆米花机：定时向最密怪群抛爆炸桶（MVP）
    | 'claw_strike'   // 小龙虾：召唤双钳夹击最近敌人（MVP）
    | 'boomerang'     // 烤冷面：甩出冷面饼飞去再飞回（MVP）
    | 'mine_cloud'    // 臭豆腐：沿途放豆腐块，爆成毒云（MVP）
    | 'chain'         // 糖葫芦：糖葫芦串在敌人之间连锁跳跃（MVP）
    | 'nova'          // 生蚝：环形爆发射出蚝壳（MVP）
    | 'bouncer';      // 章鱼小丸子：丸子在场地上乱弹（MVP）

export interface DishConfig {
    id: string;
    name: string;
    type: DishType;
    /** 基础伤害 */
    damage: number;
    /** 每级伤害倍率 */
    damageGrowthPerLevel: number;
    /** 基础冷却秒数 */
    cooldownSec: number;
    /** 每级冷却倍率 */
    cooldownGrowthPerLevel: number;
    /** 满级等级 */
    maxLevel: number;
    /** 是否纳入原型（false = MVP/V1.1，原型期不实现） */
    inPrototype: boolean;
    /** 穿透数（projectile） */
    pierce?: number;
    /** 投射物速度（projectile / boomerang / nova） */
    projectileSpeed?: number;
    /** 灼烧 DPS（aura_dot） */
    burnDps?: number;
    /** 灼烧持续秒数（aura_dot） */
    burnDurationSec?: number;
    /** 光环/作用半径（aura_dot / freeze_aoe / ground_dot / lobbed_aoe / mine_cloud） */
    radius?: number;
    /** 环绕瓣数（orbit） */
    orbitCount?: number;
    /** 环绕半径（orbit） */
    orbitRadius?: number;
    /** 环绕速度 每秒度数（orbit） */
    orbitSpeedDegPerSec?: number;
    /** 击退距离（orbit） */
    knockback?: number;
    /** 冻结持续秒数（freeze_aoe） */
    freezeDurationSec?: number;
    /** 地面持续掉血秒数（ground_dot） */
    dotDurationSec?: number;
    /** 钳击数量（claw_strike） */
    clawCount?: number;
    /** 索敌/作用距离（claw_strike） */
    range?: number;
    /** 解锁方式（claw_strike，如 elite_drop） */
    unlock?: string;
    /** 毒云持续秒数（mine_cloud） */
    cloudDurationSec?: number;
    /** 减速比例（mine_cloud） */
    slowFactor?: number;
    /** 连锁跳次数（chain） */
    chainCount?: number;
    /** 连锁跳距离（chain） */
    chainRange?: number;
    /** 环形弹射数量（nova） */
    projectileCount?: number;
    /** 弹跳球数量（bouncer） */
    ballCount?: number;
    /** 弹跳球存在秒数（bouncer） */
    ballDurationSec?: number;
    /** 弹跳球速度（bouncer） */
    ballSpeed?: number;
}

export const DISHES: DishConfig[] = [
    {
        id: 'skewer',
        name: '烤串',
        type: 'projectile',
        damage: 12,
        damageGrowthPerLevel: 1.25,
        cooldownSec: 0.55,
        cooldownGrowthPerLevel: 0.94,
        maxLevel: 5,
        inPrototype: true,
        pierce: 1,
        projectileSpeed: 700,
    },
    {
        id: 'chili',
        name: '辣椒粉',
        type: 'aura_dot',
        damage: 6,
        damageGrowthPerLevel: 1.25,
        cooldownSec: 1.0,
        cooldownGrowthPerLevel: 0.94,
        maxLevel: 5,
        inPrototype: true,
        radius: 130,
        burnDps: 4,
        burnDurationSec: 3,
    },
    {
        id: 'garlic',
        name: '大蒜瓣',
        type: 'orbit',
        damage: 10,
        damageGrowthPerLevel: 1.25,
        cooldownSec: 0,
        cooldownGrowthPerLevel: 1.0,
        maxLevel: 5,
        inPrototype: true,
        orbitCount: 2,
        orbitRadius: 95,
        orbitSpeedDegPerSec: 180,
        knockback: 120,
    },
    {
        id: 'iced_beer',
        name: '冰啤酒',
        type: 'freeze_aoe',
        damage: 8,
        damageGrowthPerLevel: 1.25,
        cooldownSec: 4.0,
        cooldownGrowthPerLevel: 0.94,
        maxLevel: 5,
        inPrototype: true,
        radius: 150,
        freezeDurationSec: 1.2,
    },
    {
        id: 'squid',
        name: '铁板鱿鱼',
        type: 'ground_dot',
        damage: 5,
        damageGrowthPerLevel: 1.25,
        cooldownSec: 2.5,
        cooldownGrowthPerLevel: 0.94,
        maxLevel: 5,
        inPrototype: false,
        radius: 100,
        dotDurationSec: 4,
    },
    {
        id: 'popcorn',
        name: '爆米花机',
        type: 'lobbed_aoe',
        damage: 25,
        damageGrowthPerLevel: 1.25,
        cooldownSec: 3.5,
        cooldownGrowthPerLevel: 0.94,
        maxLevel: 5,
        inPrototype: false,
        radius: 130,
    },
    {
        id: 'lobster_dish',
        name: '小龙虾',
        type: 'claw_strike',
        damage: 30,
        damageGrowthPerLevel: 1.25,
        cooldownSec: 2.6,
        cooldownGrowthPerLevel: 0.94,
        maxLevel: 5,
        inPrototype: false,
        clawCount: 2,
        range: 260,
        unlock: 'elite_drop',
    },
    {
        id: 'cold_noodle',
        name: '烤冷面',
        type: 'boomerang',
        damage: 14,
        damageGrowthPerLevel: 1.25,
        cooldownSec: 1.6,
        cooldownGrowthPerLevel: 0.94,
        maxLevel: 5,
        inPrototype: false,
        projectileSpeed: 620,
    },
    {
        id: 'stinky_tofu',
        name: '臭豆腐',
        type: 'mine_cloud',
        damage: 7,
        damageGrowthPerLevel: 1.25,
        cooldownSec: 2.2,
        cooldownGrowthPerLevel: 0.94,
        maxLevel: 5,
        inPrototype: false,
        radius: 90,
        cloudDurationSec: 4,
        slowFactor: 0.2,
    },
    {
        id: 'tanghulu',
        name: '糖葫芦',
        type: 'chain',
        damage: 16,
        damageGrowthPerLevel: 1.25,
        cooldownSec: 1.4,
        cooldownGrowthPerLevel: 0.94,
        maxLevel: 5,
        inPrototype: false,
        chainCount: 3,
        chainRange: 170,
    },
    {
        id: 'oyster',
        name: '生蚝',
        type: 'nova',
        damage: 11,
        damageGrowthPerLevel: 1.25,
        cooldownSec: 2.2,
        cooldownGrowthPerLevel: 0.94,
        maxLevel: 5,
        inPrototype: false,
        projectileCount: 8,
        projectileSpeed: 520,
    },
    {
        id: 'takoyaki',
        name: '章鱼小丸子',
        type: 'bouncer',
        damage: 9,
        damageGrowthPerLevel: 1.25,
        cooldownSec: 2.0,
        cooldownGrowthPerLevel: 0.94,
        maxLevel: 5,
        inPrototype: false,
        ballCount: 2,
        ballDurationSec: 5,
        ballSpeed: 380,
    },
];

/** 原型期允许出现的菜（inPrototype = true） */
export const PROTOTYPE_DISHES: DishConfig[] = DISHES.filter((d) => d.inPrototype);

/**
 * Step 5 三选一的新菜池：只从 PROTOTYPE_DISHES 里抽。
 *
 * 归一化纪律：过滤掉 8 道 MVP 菜后，`LEVEL_UP_CHOICE_WEIGHTS.newDish`（40%）
 * **保持不变**，不能因为池子变小就把 40% 缩水或转移给强化/被动；
 * 被过滤菜原本占的份额由剩余原型菜均分（config v2 没有给每道菜单独权重，
 * 研发引导「配方另一半权重 ×2」是在池内再加成，不改大类权重）。
 */
export const PROTOTYPE_NEW_DISH_POOL: DishConfig[] = PROTOTYPE_DISHES;

// ==================== 敌人 ====================

export type ExpDrop = 'normal' | 'big';

export interface EnemyConfig {
    id: string;
    name: string;
    /** 基础血量 */
    hp: number;
    /** 移速（像素/秒） */
    speed: number;
    /** 碰到玩家扣血 */
    damageToPlayer: number;
    /** 击杀掉落金币 */
    coins: number;
    /** 掉落经验类型 */
    expDrop: ExpDrop;
    /** 是否纳入原型 */
    inPrototype: boolean;
    /** 是否精英 */
    elite?: boolean;
    /** 移动模式（sine = S 形） */
    movePattern?: 'sine';
    /** 行为（偷取食材逃跑） */
    behavior?: 'steal_drop_and_flee';
}

export const ENEMIES: EnemyConfig[] = [
    {
        id: 'rat',
        name: '老鼠',
        hp: 18,
        speed: 120,
        damageToPlayer: 6,
        coins: 1,
        expDrop: 'normal',
        inPrototype: true,
    },
    {
        id: 'roach',
        name: '蟑螂',
        hp: 6,
        speed: 95,
        damageToPlayer: 3,
        coins: 0,
        expDrop: 'normal',
        inPrototype: true,
    },
    {
        id: 'drunk',
        name: '醉汉',
        hp: 120,
        speed: 55,
        damageToPlayer: 14,
        coins: 3,
        expDrop: 'normal',
        inPrototype: false,
        movePattern: 'sine',
    },
    {
        id: 'thief',
        name: '偷吃贼',
        hp: 40,
        speed: 150,
        damageToPlayer: 4,
        coins: 5,
        expDrop: 'normal',
        inPrototype: false,
        behavior: 'steal_drop_and_flee',
    },
    {
        id: 'big_eater',
        name: '大胃王',
        hp: 1500,
        speed: 45,
        damageToPlayer: 25,
        coins: 50,
        expDrop: 'big',
        inPrototype: true,
        elite: true,
    },
];

// ==================== 波次 ====================

export interface WaveConfig {
    /** 波次序号，从 1 开始 */
    wave: number;
    /** 敌人血量倍率 = 1 + (n-1) × 0.35 */
    hpMul: number;
    /** 刷新间隔（秒） */
    spawnIntervalSec: number;
    /** 敌人类型占比（百分数） */
    mix: { [enemyId: string]: number };
    /** 精英类型（第 10 波） */
    elite?: string;
    /** 精英出场时刻（秒） */
    eliteAtSec?: number;
}

/**
 * 原型期允许刷出的敌人（inPrototype = true：老鼠、蟑螂、大胃王）。
 * 注意：config v2 的 waves 表第 5 波起混入了醉汉/偷吃贼（inPrototype = false），
 * 刷怪器必须按本表过滤 mix，否则原型期会提前刷出 MVP 怪。
 */
export const PROTOTYPE_ENEMIES: EnemyConfig[] = ENEMIES.filter((e) => e.inPrototype);

/**
 * 按原型敌人过滤波次 mix，并把剩余权重**归一化到过滤前的总权重**。
 *
 * 关键：不能直接丢弃被过滤项的权重！config 的每波 mix 合计为 100，若第 5 波
 * 去掉醉汉 10 后不重新分配，总概率只剩 90，原型期刷怪量会平白少 10%。
 * 归一化后合计仍是 100（或被过滤前 mix 的实际总和），刷新节奏不变。
 */
export function normalizedPrototypeMix(mix: { [enemyId: string]: number }): { [enemyId: string]: number } {
    const allowed = new Set(PROTOTYPE_ENEMIES.map((e) => e.id));
    const entries = Object.keys(mix).filter((id) => allowed.has(id) && mix[id] > 0);
    const originalTotal = Object.keys(mix).reduce((sum, id) => sum + Math.max(0, mix[id]), 0);
    const keptTotal = entries.reduce((sum, id) => sum + mix[id], 0);
    const result: { [enemyId: string]: number } = {};
    if (keptTotal <= 0) {
        return result;
    }
    for (const id of entries) {
        result[id] = (originalTotal * mix[id]) / keptTotal;
    }
    return result;
}

export const WAVES: WaveConfig[] = [
    { wave: 1, hpMul: 1.0, spawnIntervalSec: 1.6, mix: { rat: 100 } },
    { wave: 2, hpMul: 1.35, spawnIntervalSec: 1.4, mix: { rat: 80, roach: 20 } },
    { wave: 3, hpMul: 1.7, spawnIntervalSec: 1.2, mix: { rat: 60, roach: 40 } },
    { wave: 4, hpMul: 2.05, spawnIntervalSec: 1.1, mix: { rat: 50, roach: 50 } },
    { wave: 5, hpMul: 2.4, spawnIntervalSec: 1.0, mix: { drunk: 10, rat: 45, roach: 45 } },
    { wave: 6, hpMul: 2.75, spawnIntervalSec: 0.9, mix: { drunk: 15, rat: 40, roach: 45 } },
    { wave: 7, hpMul: 3.1, spawnIntervalSec: 0.85, mix: { drunk: 15, rat: 35, roach: 45, thief: 5 } },
    { wave: 8, hpMul: 3.45, spawnIntervalSec: 0.8, mix: { drunk: 20, rat: 30, roach: 45, thief: 5 } },
    { wave: 9, hpMul: 3.8, spawnIntervalSec: 0.7, mix: { drunk: 25, rat: 30, roach: 40, thief: 5 } },
    {
        wave: 10,
        hpMul: 4.15,
        spawnIntervalSec: 1.2,
        mix: { drunk: 20, rat: 40, roach: 40 },
        elite: 'big_eater',
        eliteAtSec: 5,
    },
];

/**
 * 原型期实际使用的波次表：mix 已按 PROTOTYPE_ENEMIES 过滤并归一化到原总和。
 * 刷怪器应读本表，而不是 WAVES。第 5–10 波的醉汉/偷吃贼权重已按比例分给
 * 老鼠/蟑螂，总刷新概率不缩水；精英大胃王（inPrototype=true）保留。
 */
export const PROTOTYPE_WAVES: WaveConfig[] = WAVES.map((w) => ({
    ...w,
    mix: normalizedPrototypeMix(w.mix),
}));

// ==================== 三选一 ====================

export interface LevelUpChoiceWeights {
    /** 新菜权重 */
    newDish: number;
    /** 强化已有菜权重 */
    upgradeDish: number;
    /** 被动权重 */
    passive: number;
}

export const LEVEL_UP_CHOICE_WEIGHTS: LevelUpChoiceWeights = {
    newDish: 40,
    upgradeDish: 40,
    passive: 20,
};

export interface PassiveConfig {
    id: string;
    name: string;
    /** 每层效果 */
    perStack: number;
    /** 最大叠加层数 */
    maxStacks: number;
}

export const PASSIVES: PassiveConfig[] = [
    { id: 'speed', name: '移速', perStack: 0.08, maxStacks: 3 },
    { id: 'pickup', name: '拾取范围', perStack: 0.25, maxStacks: 3 },
    { id: 'maxhp', name: '最大生命', perStack: 20, maxStacks: 3 },
    { id: 'attack', name: '攻击', perStack: 0.1, maxStacks: 3 },
    { id: 'haste', name: '急速（冷却缩减）', perStack: -0.05, maxStacks: 3 },
    { id: 'area', name: '扩张（范围扩大）', perStack: 0.1, maxStacks: 3 },
    { id: 'coins', name: '招财（金币加成）', perStack: 0.15, maxStacks: 3 },
    { id: 'exp', name: '慧眼（经验加成）', perStack: 0.12, maxStacks: 3 },
];

// ==================== 进化配方 ====================

export interface RecipeConfig {
    id: string;
    name: string;
    /** 合成自哪两道菜 */
    from: [string, string];
    /** 伤害倍率 */
    damageMul: number;
    /** 效果描述 */
    desc: string;
    /** 是否纳入原型 */
    inPrototype: boolean;
}

export const RECIPES: RecipeConfig[] = [
    { id: 'malatang', name: '麻辣烫', from: ['skewer', 'chili'], damageMul: 2.2, desc: '签子全屏穿透+命中灼烧3秒', inPrototype: true },
    { id: 'garlic_squid', name: '蒜蓉铁板烧', from: ['squid', 'garlic'], damageMul: 2.4, desc: '大范围旋转火盘', inPrototype: false },
    { id: 'garlic_skewer', name: '蒜香烤串', from: ['skewer', 'garlic'], damageMul: 2.0, desc: '穿透+击退', inPrototype: false },
    { id: 'iced_lobster', name: '冰镇麻辣小龙虾', from: ['iced_beer', 'lobster_dish'], damageMul: 2.8, desc: '冻结+召唤钳夹击', inPrototype: false },
    { id: 'fire_squid', name: '火爆鱿鱼须', from: ['chili', 'popcorn'], damageMul: 2.5, desc: '连环爆炸', inPrototype: false },
    { id: 'ice_fire', name: '冰火两重天', from: ['iced_beer', 'chili'], damageMul: 2.6, desc: '冻结后爆裂', inPrototype: false },
    { id: 'spicy_lobster', name: '麻辣小龙虾', from: ['lobster_dish', 'chili'], damageMul: 2.6, desc: '钳夹击目标+1且命中灼烧3秒', inPrototype: false },
    { id: 'ice_tanghulu', name: '冰糖葫芦', from: ['tanghulu', 'iced_beer'], damageMul: 2.3, desc: '连锁跳跃次数+2，被跳中的敌人冻结1秒', inPrototype: false },
    { id: 'garlic_oyster', name: '蒜蓉烤生蚝', from: ['oyster', 'garlic'], damageMul: 2.4, desc: '环形爆发数量翻倍且附带击退', inPrototype: false },
    { id: 'tofu_popcorn', name: '爆浆臭豆腐', from: ['stinky_tofu', 'popcorn'], damageMul: 2.3, desc: '地雷爆炸生成大范围毒云，云内掉血+减速加深', inPrototype: false },
    { id: 'tako_squid', name: '铁板章鱼烧', from: ['takoyaki', 'squid'], damageMul: 2.4, desc: '丸子弹跳沿途留下油滩，踩中持续掉血', inPrototype: false },
    { id: 'noodle_skewer', name: '冷面卷大串', from: ['cold_noodle', 'skewer'], damageMul: 2.5, desc: '冷面变大加厚，去程回程全穿透，回程伤害翻倍', inPrototype: false },
];

/** 原型期允许出现的进化配方（inPrototype = true，目前只有麻辣烫） */
export const PROTOTYPE_RECIPES: RecipeConfig[] = RECIPES.filter((r) => r.inPrototype);

// ==================== 防御摊 ====================

export type StallType = 'slow_aura' | 'aoe_damage' | 'knockback_taunt';

export interface StallConfig {
    id: string;
    name: string;
    type: StallType;
    /** 摆放价格（金币） */
    cost: number;
    /** 摊子血量 */
    hp: number;
    /** 作用半径 */
    radius: number;
    /** 维修价格（金币） */
    repairCost: number;
    /** 是否纳入原型 */
    inPrototype: boolean;
    /** 减速比例（slow_aura） */
    slowFactor?: number;
    /** 冷却秒数（aoe_damage） */
    cooldownSec?: number;
    /** 伤害（aoe_damage） */
    damage?: number;
}

export const STALLS: StallConfig[] = [
    { id: 'milk_tea', name: '奶茶摊', type: 'slow_aura', cost: 80, hp: 60, radius: 170, repairCost: 30, inPrototype: true, slowFactor: 0.35 },
    { id: 'popcorn_stall', name: '爆米花机摊', type: 'aoe_damage', cost: 120, hp: 60, radius: 140, repairCost: 45, inPrototype: false, cooldownSec: 3.0, damage: 30 },
    { id: 'speaker', name: '大音响摊', type: 'knockback_taunt', cost: 150, hp: 60, radius: 160, repairCost: 60, inPrototype: false },
];

/** 原型期允许摆放的摊位（目前只有奶茶摊） */
export const PROTOTYPE_STALLS: StallConfig[] = STALLS.filter((s) => s.inPrototype);

// ==================== 广告点位（原型只留接口） ====================

export interface AdPointConfig {
    id: string;
    /** 每局上限 */
    limitPerRun?: number;
    /** 每日上限 */
    limitPerDay?: number;
}

export const AD_POINTS: AdPointConfig[] = [
    { id: 'revive', limitPerRun: 1 },
    { id: 'reroll', limitPerRun: 2 },
    { id: 'recipe_hint', limitPerDay: 3 },
    { id: 'free_stall', limitPerRun: 1 },
    { id: 'double_settle', limitPerRun: 1 },
    { id: 'research_skip', limitPerDay: 3 },
];

// ==================== 存档 ====================

export interface SaveConfig {
    /** 存档键前缀，升版改后缀并写迁移 */
    keyPrefix: string;
    /** 存档字段 */
    fields: string[];
}

export const SAVE: SaveConfig = {
    keyPrefix: 'maozhanggui_save_v1',
    fields: ['bestWave', 'totalCoins', 'unlockedDishes', 'recipeBookProgress'],
};

// ==================== 原型期专用参数 ====================

/**
 * 原型期专用参数（**尚未进入 config JSON**）。
 *
 * 为什么单独开一块：config/game-config.json 是策划表，只放玩法数值；
 * 刷怪边距、灰盒色块尺寸这类「几何/交互」参数还没有对应的策划字段，
 * 但纪律仍然是「数值只从 Config 读」，所以集中放在这里而不是散在脚本里。
 * 后续策划补了字段，就把对应项迁到 JSON 并从这里删除。
 */
export interface PrototypeOnlyConfig {
    /** 刷怪点距离地图边缘外的距离（像素） */
    spawnMargin: number;
    /** 敌人灰盒色块边长（像素） */
    enemySize: number;
    /**
     * 索敌模式：
     *   player  = 一律追玩家
     *   stall   = 一律冲摊位
     *   nearest = 默认追玩家，摊位明显更近时改冲摊位
     */
    aggroMode: 'player' | 'stall' | 'nearest';
    /** nearest 模式下：摊位距离 < 玩家距离 × 该比例时改冲摊位 */
    stallAggroRatio: number;
    /** 敌人灰盒上的辨识字（灰盒表现用：老鼠→「鼠」、蟑螂→「蟑」、大胃王→「胃」） */
    enemyGlyphs: { [enemyId: string]: string };
    /** 开局赠送的菜品 id（Step 4：站着不动就能自动清怪，所以开局就有烤串） */
    initialWeapons: string[];
    /** 签子（投射物）色块尺寸 */
    projectileSize: number;
    /** 签子最远飞行距离（超出即回收） */
    projectileMaxTravel: number;
    /** 投射物对象池预热数量 */
    projectilePoolSize: number;
    /** 食材掉落物色块尺寸（普通） */
    dropSize: number;
    /** 食材掉落物色块尺寸（大食材 / 精英掉落） */
    bigDropSize: number;
    /** 掉落物对象池预热数量 */
    dropPoolSize: number;
    /**
     * 掉落物磁吸半径（像素）。
     * 食材掉在击杀处，而玩家可能站得很远（站着不动时怪在路上就被远程打死），
     * 没有磁吸就永远捡不到 → 经验条不涨。半径要覆盖整张地图。
     */
    magnetRadius: number;
    /** 掉落物磁吸移动速度（像素/秒） */
    magnetSpeed: number;
}

export const PROTOTYPE_ONLY: PrototypeOnlyConfig = {
    spawnMargin: 80,
    enemySize: 36,
    aggroMode: 'player',
    stallAggroRatio: 0.8,
    enemyGlyphs: {
        rat: '鼠',
        roach: '蟑',
        big_eater: '胃',
    },
    initialWeapons: ['skewer'],
    projectileSize: 14,
    projectileMaxTravel: 1400,
    projectilePoolSize: 24,
    dropSize: 18,
    bigDropSize: 30,
    dropPoolSize: 80,
    magnetRadius: 1200,
    magnetSpeed: 300,
};
