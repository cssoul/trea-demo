/**
 * materialLibrary - 材质与几何体共享库
 *
 * 职责：
 *  - 统一维护第二版"体素微缩"风格所需的调色板与共享材质（金属、机柜白、铜排、屏幕等）
 *  - 提供带缓存的几何体工厂，重复部件（电池模组、光伏板、散热片）复用同一份 geometry，
 *    降低显存占用与绘制开销
 *  - 提供材质克隆接口，供需要独立状态（指示灯、SOC 电量条）的部件使用
 *
 * 说明：所有材质均按"共享实例"创建，禁止在渲染循环中新建材质，避免触发着色器重编译。
 */
import * as THREE from 'three';

/** 全局调色板（浅色微缩沙盘 + 储能设备配色） */
export const PALETTE = {
    // 结构件
    cabinetWhite: 0xf3f5f8,
    cabinetGray: 0xd9dee6,
    cabinetDark: 0x939ba7,
    plinth: 0x5b6470,
    metalLight: 0xcdd4dd,
    aluminum: 0xc2c9d3,
    // 深色件
    darkPlastic: 0x2b3038,
    grille: 0x353c47,
    rubber: 0x23272e,
    screenBg: 0x0d131c,
    // 功能件
    pvCell: 0x1d3f6d,
    pvCellDeep: 0x152f4d,
    copper: 0xc8813c,
    copperDark: 0x96562a,
    towerSteel: 0x5c7b74,
    porcelain: 0xe2e6eb,
    // 状态色
    ok: 0x22c26e,
    warn: 0xf0a020,
    danger: 0xe0464c,
    idle: 0x99a2ad,
    flowCharge: 0x00e0a4,
    flowDischarge: 0xffb020,
    // 场景（底盘取浅蓝灰，让白色设备在沙盘上形成清晰轮廓）
    groundPlate: 0xe8edf5,
    groundBase: 0xdfe5ee,
    gridLine: 0xd9e2ee,
    gridLineMajor: 0xc4d1e2
};

/** 指示灯状态 -> 颜色 */
export const STATUS_COLOR = {
    running: PALETTE.ok,
    charging: PALETTE.ok,
    discharging: PALETTE.warn,
    alarm: PALETTE.danger,
    idle: PALETTE.idle,
    offline: 0x5d6570
};

/**
 * 创建共享材质集合。
 * 使用函数而非直接常量，便于在需要时整体重建（例如上下文丢失后恢复）。
 * @returns {Object<string, THREE.Material>}
 */
function createMaterials() {
    return {
        // === 机柜与结构 ===
        cabinetWhite: new THREE.MeshStandardMaterial({ color: PALETTE.cabinetWhite, roughness: 0.5, metalness: 0.06 }),
        cabinetGray: new THREE.MeshStandardMaterial({ color: PALETTE.cabinetGray, roughness: 0.62, metalness: 0.08 }),
        cabinetDark: new THREE.MeshStandardMaterial({ color: PALETTE.cabinetDark, roughness: 0.66, metalness: 0.12 }),
        plinth: new THREE.MeshStandardMaterial({ color: PALETTE.plinth, roughness: 0.78, metalness: 0.1 }),

        // === 金属与铜排 ===
        metalLight: new THREE.MeshStandardMaterial({ color: PALETTE.metalLight, roughness: 0.34, metalness: 0.78 }),
        aluminum: new THREE.MeshStandardMaterial({ color: PALETTE.aluminum, roughness: 0.3, metalness: 0.85 }),
        copper: new THREE.MeshStandardMaterial({ color: PALETTE.copper, roughness: 0.26, metalness: 0.92 }),
        copperDark: new THREE.MeshStandardMaterial({ color: PALETTE.copperDark, roughness: 0.36, metalness: 0.88 }),
        towerSteel: new THREE.MeshStandardMaterial({ color: PALETTE.towerSteel, roughness: 0.48, metalness: 0.55 }),

        // === 深色件 ===
        darkPlastic: new THREE.MeshStandardMaterial({ color: PALETTE.darkPlastic, roughness: 0.55, metalness: 0.16 }),
        grille: new THREE.MeshStandardMaterial({ color: PALETTE.grille, roughness: 0.6, metalness: 0.25 }),
        rubber: new THREE.MeshStandardMaterial({ color: PALETTE.rubber, roughness: 0.92, metalness: 0.02 }),

        // === 光伏 ===
        pvCell: new THREE.MeshStandardMaterial({ color: PALETTE.pvCell, roughness: 0.16, metalness: 0.42 }),
        pvCellDeep: new THREE.MeshStandardMaterial({ color: PALETTE.pvCellDeep, roughness: 0.2, metalness: 0.38 }),

        // === 屏幕与透明件 ===
        screenDark: new THREE.MeshStandardMaterial({
            color: PALETTE.screenBg,
            roughness: 0.22,
            metalness: 0.1,
            emissive: 0x0a1a2a,
            emissiveIntensity: 0.6
        }),
        glassCover: new THREE.MeshStandardMaterial({
            color: 0xdfe9f5,
            roughness: 0.08,
            metalness: 0.1,
            transparent: true,
            opacity: 0.32,
            side: THREE.DoubleSide,
            depthWrite: false
        }),

        // === 状态指示 ===
        indicatorGreen: new THREE.MeshStandardMaterial({
            color: PALETTE.ok,
            emissive: PALETTE.ok,
            emissiveIntensity: 1.6,
            roughness: 0.3
        }),
        indicatorAmber: new THREE.MeshStandardMaterial({
            color: PALETTE.warn,
            emissive: PALETTE.warn,
            emissiveIntensity: 1.6,
            roughness: 0.3
        }),
        indicatorRed: new THREE.MeshStandardMaterial({
            color: PALETTE.danger,
            emissive: PALETTE.danger,
            emissiveIntensity: 1.6,
            roughness: 0.3
        }),
        indicatorIdle: new THREE.MeshStandardMaterial({
            color: PALETTE.idle,
            emissive: 0x2a2f36,
            emissiveIntensity: 0.4,
            roughness: 0.4
        }),

        // === 电缆（按通流状态切换基管色调，均为共享材质，避免逐条克隆） ===
        cable: new THREE.MeshStandardMaterial({ color: 0x3b4250, roughness: 0.7, metalness: 0.2 }),
        cableCharging: new THREE.MeshStandardMaterial({
            color: 0x2c5a52,
            emissive: 0x00e0a4,
            emissiveIntensity: 0.12,
            roughness: 0.6,
            metalness: 0.3
        }),
        cableDischarging: new THREE.MeshStandardMaterial({
            color: 0x5a4a2c,
            emissive: 0xffb020,
            emissiveIntensity: 0.12,
            roughness: 0.6,
            metalness: 0.3
        }),
        cableOff: new THREE.MeshStandardMaterial({ color: 0x8f97a3, roughness: 0.8, metalness: 0.15 }),
        cableDuct: new THREE.MeshStandardMaterial({ color: 0xdde3ea, roughness: 0.5, metalness: 0.3 }),

        // === 电池模组 ===
        batteryModule: new THREE.MeshStandardMaterial({ color: 0x2a3240, roughness: 0.52, metalness: 0.3 }),
        batteryCellStrip: new THREE.MeshStandardMaterial({
            color: 0x2f8fd8,
            emissive: 0x1a5f9c,
            emissiveIntensity: 0.8,
            roughness: 0.35,
            metalness: 0.2
        }),

        // === 离线态"暗化/半透明"覆盖材质 ===
        offlineGhost: new THREE.MeshStandardMaterial({
            color: 0xa9b3c0,
            roughness: 0.95,
            metalness: 0,
            transparent: true,
            opacity: 0.38,
            depthWrite: false
        }),

        // === 选中/标记辅助 ===
        selectionOutline: new THREE.LineBasicMaterial({ color: 0x00d3a0, transparent: true, opacity: 0.95 }),
        selectionFill: new THREE.MeshBasicMaterial({
            color: 0x00d3a0,
            transparent: true,
            opacity: 0.1,
            depthWrite: false,
            side: THREE.DoubleSide
        }),
        handlePrimary: new THREE.MeshStandardMaterial({
            color: 0x00d3a0,
            emissive: 0x00d3a0,
            emissiveIntensity: 0.5,
            roughness: 0.35,
            metalness: 0.1
        }),
        handleSecondary: new THREE.MeshStandardMaterial({
            color: 0xf0a020,
            emissive: 0xf0a020,
            emissiveIntensity: 0.35,
            roughness: 0.4,
            metalness: 0.1
        }),
        alarmMarker: new THREE.MeshStandardMaterial({
            color: PALETTE.danger,
            emissive: PALETTE.danger,
            emissiveIntensity: 1.4,
            roughness: 0.4,
            transparent: true,
            opacity: 0.95
        })
    };
}

/** 共享材质集合（模块级单例，标记 shared 以避免被设备级销毁误释放） */
export const MAT = createMaterials();
Object.values(MAT).forEach((mat) => {
    mat.userData.shared = true;
});

/** 几何体缓存：key -> THREE.BufferGeometry */
const geometryCache = new Map();

/**
 * 构造缓存 key，避免浮点误差导致的缓存穿透。
 * @param {string} prefix 几何体类型前缀
 * @param {number[]} args 尺寸参数
 * @returns {string}
 */
function cacheKey(prefix, args) {
    return `${prefix}:${args.map((v) => Math.round(v * 1000) / 1000).join('|')}`;
}

/**
 * 从缓存获取几何体，未命中时创建。
 * @param {string} prefix 类型前缀
 * @param {number[]} args 尺寸参数（参与 key 计算）
 * @param {Function} factory 创建函数
 * @returns {THREE.BufferGeometry}
 */
function cached(prefix, args, factory) {
    const key = cacheKey(prefix, args);
    let geo = geometryCache.get(key);
    if (!geo) {
        geo = factory();
        geo.userData.shared = true;
        geometryCache.set(key, geo);
    }
    return geo;
}

/**
 * 长方体几何体（低多边形体素风格的基础单元）。
 * @param {number} w 宽（X）
 * @param {number} h 高（Y）
 * @param {number} d 深（Z）
 * @returns {THREE.BoxGeometry}
 */
export function boxGeo(w, h, d) {
    return cached('box', [w, h, d], () => new THREE.BoxGeometry(w, h, d));
}

/**
 * 圆柱几何体（默认 12 边，兼顾体素感与轮廓圆润度）。
 * @param {number} rTop 顶部半径
 * @param {number} rBottom 底部半径
 * @param {number} h 高
 * @param {number} [segments=12] 侧边分段
 * @returns {THREE.CylinderGeometry}
 */
export function cylinderGeo(rTop, rBottom, h, segments = 12) {
    return cached('cyl', [rTop, rBottom, h, segments], () => new THREE.CylinderGeometry(rTop, rBottom, h, segments));
}

/**
 * 圆锥几何体（高压套管伞裙、铁塔塔尖）。
 * @param {number} r 半径
 * @param {number} h 高
 * @param {number} [segments=12] 分段
 * @returns {THREE.ConeGeometry}
 */
export function coneGeo(r, h, segments = 12) {
    return cached('cone', [r, h, segments], () => new THREE.ConeGeometry(r, h, segments));
}

/**
 * 球体几何体（关节、指示灯、手柄）。
 * @param {number} r 半径
 * @param {number} [segments=10] 分段
 * @returns {THREE.SphereGeometry}
 */
export function sphereGeo(r, segments = 10) {
    return cached('sphere', [r, segments], () => new THREE.SphereGeometry(r, segments, Math.max(6, segments - 4)));
}

/**
 * 圆环几何体（风扇、线圈装饰）。
 * @param {number} r 半径
 * @param {number} tube 管径
 * @param {number} [segments=12] 分段
 * @returns {THREE.TorusGeometry}
 */
export function torusGeo(r, tube, segments = 12) {
    return cached('torus', [r, tube, segments], () => new THREE.TorusGeometry(r, tube, 6, segments));
}

/**
 * 平面几何体（屏幕、标签、地面）。
 * @param {number} w 宽
 * @param {number} h 高
 * @returns {THREE.PlaneGeometry}
 */
export function planeGeo(w, h) {
    return cached('plane', [w, h], () => new THREE.PlaneGeometry(w, h));
}

/**
 * 圆角矩形平面几何体（云台底座、地面描边）。
 * @param {number} w 宽
 * @param {number} h 高
 * @param {number} r 圆角半径
 * @returns {THREE.ShapeGeometry}
 */
export function roundedPlaneGeo(w, h, r) {
    return cached('roundPlane', [w, h, r], () => {
        const radius = Math.min(r, Math.min(w, h) / 2);
        const x = -w / 2;
        const y = -h / 2;
        const shape = new THREE.Shape();
        shape.moveTo(x + radius, y);
        shape.lineTo(x + w - radius, y);
        shape.quadraticCurveTo(x + w, y, x + w, y + radius);
        shape.lineTo(x + w, y + h - radius);
        shape.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        shape.lineTo(x + radius, y + h);
        shape.quadraticCurveTo(x, y + h, x, y + h - radius);
        shape.lineTo(x, y + radius);
        shape.quadraticCurveTo(x, y, x + radius, y);
        return new THREE.ShapeGeometry(shape, 6);
    });
}

/**
 * 圆角矩形线条点集（供 LineLoop 描边使用）。
 * @param {number} w 宽
 * @param {number} h 高
 * @param {number} r 圆角半径
 * @param {number} [segPerCorner=3] 每个圆角的分段数
 * @returns {THREE.Vector2[]}
 */
export function roundedRectPoints(w, h, r, segPerCorner = 3) {
    const radius = Math.min(r, Math.min(w, h) / 2);
    const hw = w / 2;
    const hh = h / 2;
    const pts = [];
    const corners = [
        { cx: hw - radius, cy: hh - radius, start: 0 },
        { cx: -hw + radius, cy: hh - radius, start: Math.PI / 2 },
        { cx: -hw + radius, cy: -hh + radius, start: Math.PI },
        { cx: hw - radius, cy: -hh + radius, start: Math.PI * 1.5 }
    ];
    corners.forEach((c) => {
        for (let i = 0; i <= segPerCorner; i += 1) {
            const a = c.start + (i / segPerCorner) * (Math.PI / 2);
            pts.push(new THREE.Vector2(c.cx + Math.cos(a) * radius, c.cy + Math.sin(a) * radius));
        }
    });
    return pts;
}

/**
 * 克隆一份材质，用于需要独立状态（颜色/自发光）的部件。
 * 克隆材质与源材质共享着色器程序，仅 uniform 不同，开销可控。
 * @param {THREE.Material} source 源材质
 * @returns {THREE.Material}
 */
export function cloneMaterial(source) {
    const mat = source.clone();
    mat.userData.owned = true;
    return mat;
}

/**
 * 释放几何体缓存（组件销毁时调用）。
 */
export function disposeGeometryCache() {
    geometryCache.forEach((geo) => geo.dispose());
    geometryCache.clear();
}
