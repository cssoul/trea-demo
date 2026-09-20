/**
 * 电网设备模型（grid）：输电铁塔微缩模型
 *
 * 造型参考"鼓型/猫头型"双回路输电铁塔：
 *  - 四条塔腿向下外张，逐层收分至塔身正身（方形井筒）
 *  - 塔身每层设置水平横隔材 + 四面交叉斜材，呈现真实桁架结构
 *  - 上部三层横担（每侧各一，共六相），横担端部悬挂绝缘子串与导线
 *  - 塔顶两支地线支架与避雷针，底部四角混凝土基础
 */
import * as THREE from 'three';
import { MAT } from '../materialLibrary.js';

/**
 * 计算塔身某高度处的半宽（分段线性收分）。
 * @param {number} y 目标高度
 * @param {Array<Array<number>>} profile 收分曲线 [[y, halfWidth], ...]（y 升序）
 * @returns {number} 该高度处的半宽
 */
function halfWidthAt(y, profile) {
    for (let i = 0; i < profile.length - 1; i += 1) {
        const [y1, w1] = profile[i];
        const [y2, w2] = profile[i + 1];
        if (y <= y2) {
            const t = y2 === y1 ? 0 : (y - y1) / (y2 - y1);
            return w1 + (w2 - w1) * t;
        }
    }
    return profile[profile.length - 1][1];
}

/**
 * 构建输电铁塔模型。
 * @param {import('../ModelBuilder.js').default} b 模型构建器
 * @param {Object} opts 参数
 * @param {number} opts.w 占地宽（X）
 * @param {number} opts.d 占地深（Z）
 * @returns {number} 模型总高
 */
export function buildGrid(b, opts) {
    const { w, d } = opts;
    const size = Math.max(w, d);
    const height = size * 2.6;
    const material = MAT.towerSteel;
    const legT = Math.max(2, size * 0.055);
    const braceT = legT * 0.55;
    const armT = legT * 0.7;

    // === 收分曲线：塔腿外张 -> 塔颈 -> 塔身正身 -> 塔头 ===
    const baseHalf = size * 0.42;
    const profile = [
        [0, baseHalf],
        [height * 0.58, size * 0.13],
        [height * 0.86, size * 0.1],
        [height, size * 0.08]
    ];

    // === 四条塔腿 + 塔身立柱（贯穿整个高度） ===
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        // 分段直立柱，逐段收分（每段两端半宽由 profile 决定）
        const segments = 6;
        for (let i = 0; i < segments; i += 1) {
            const y1 = (height * i) / segments;
            const y2 = (height * (i + 1)) / segments;
            const w1 = halfWidthAt(y1, profile);
            const w2 = halfWidthAt(y2, profile);
            b.beam(material, [sx * w1, y1, sz * w1], [sx * w2, y2, sz * w2], legT * (1 - i * 0.08));
        }
    });

    // === 分层横隔材（水平方环）+ 四面交叉斜材 ===
    const levels = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.58, 0.68, 0.78, 0.86, 0.94];
    for (let i = 0; i < levels.length - 1; i += 1) {
        const y1 = height * levels[i];
        const y2 = height * levels[i + 1];
        const h1 = halfWidthAt(y1, profile);
        const h2 = halfWidthAt(y2, profile);
        // 水平横隔材
        b.beam(material, [-h2, y2, -h2], [h2, y2, -h2], braceT);
        b.beam(material, [-h2, y2, h2], [h2, y2, h2], braceT);
        b.beam(material, [-h2, y2, -h2], [-h2, y2, h2], braceT);
        b.beam(material, [h2, y2, -h2], [h2, y2, h2], braceT);
        // 四面 X 形斜材（塔身正面/侧面均有，形成真实桁架观感）
        const faces = [
            { axis: 'z', sign: -1 },
            { axis: 'z', sign: 1 },
            { axis: 'x', sign: -1 },
            { axis: 'x', sign: 1 }
        ];
        faces.forEach(({ axis, sign }) => {
            const p = (axisValue, y) => (axis === 'z' ? [axisValue, y, sign * h2] : [sign * h2, y, axisValue]);
            // 同层宽度的辅助值（斜材两端各用本层半宽）
            const p1 = p(-h1, y1);
            const p2 = p(h2, y2);
            const p3 = p(h1, y1);
            const p4 = p(-h2, y2);
            b.beam(material, p1, p2, braceT);
            b.beam(material, p3, p4, braceT);
        });
    }

    // === 塔脚混凝土基础 ===
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        b.box(MAT.plinth, { w: size * 0.2, h: Math.max(3, size * 0.09), d: size * 0.2, x: sx * baseHalf, z: sz * baseHalf });
        // 基础地脚（略高的斜坡台）
        b.box(MAT.cabinetDark, { w: size * 0.12, h: Math.max(2, size * 0.05), d: size * 0.12, x: sx * baseHalf, y: Math.max(3, size * 0.09), z: sz * baseHalf });
    });

    // === 三层横担（双回路：每层左右各一相） ===
    const armLevels = [
        { y: height * 0.64, len: size * 0.95 },
        { y: height * 0.74, len: size * 0.78 },
        { y: height * 0.84, len: size * 0.6 }
    ];
    const insulatorH = size * 0.2;
    armLevels.forEach(({ y, len }) => {
        const shaftHalf = halfWidthAt(y, profile);
        [-1, 1].forEach((side) => {
            const tip = side * (len / 2);
            const root = side * shaftHalf;
            // 横担主梁（微微上翘，模拟"羊角"横担）
            b.beam(material, [root, y, 0], [tip, y + size * 0.05, 0], armT);
            // 横担下撑杆（三角支撑）
            b.beam(material, [root, y - size * 0.09, 0], [tip * 0.96, y + size * 0.04, 0], braceT);
            // 横担端部竖杆
            b.beam(material, [tip, y + size * 0.05, 0], [tip, y - size * 0.02, 0], braceT);
            // 悬垂绝缘子串（3 片瓷瓶）
            for (let k = 0; k < 3; k += 1) {
                b.cylinder(MAT.porcelain, {
                    r: size * (0.04 - k * 0.005),
                    h: insulatorH / 3.4,
                    x: tip,
                    y: y - insulatorH * ((k + 1) / 3) - size * 0.02,
                    z: 0,
                    segments: 8
                });
            }
            // 绝缘子串末端挂点金具
            b.sphere(MAT.metalLight, { r: size * 0.028, cy: y - insulatorH - size * 0.02, x: tip, z: 0 });
            // 导线（悬垂短弧）
            const drop = y - insulatorH - size * 0.04;
            const curve = new THREE.CatmullRomCurve3([
                new THREE.Vector3(tip - side * size * 0.3, drop + size * 0.06, 0),
                new THREE.Vector3(tip, drop - size * 0.02, 0),
                new THREE.Vector3(tip + side * size * 0.3, drop + size * 0.06, 0)
            ]);
            const cableGeo = new THREE.TubeGeometry(curve, 12, Math.max(0.7, size * 0.014), 6, false);
            b.add(new THREE.Mesh(cableGeo, MAT.cable));
        });
        // 横担间的竖向连接材（塔身两侧）
        b.beam(material, [-shaftHalf, y, 0], [-shaftHalf, y + size * 0.1, 0], braceT);
        b.beam(material, [shaftHalf, y, 0], [shaftHalf, y + size * 0.1, 0], braceT);
    });

    // === 塔顶地线支架（两支外张的"羊角"）+ 避雷针 ===
    const topY = height * 0.94;
    const topHalf = halfWidthAt(topY, profile);
    [-1, 1].forEach((side) => {
        b.beam(material, [side * topHalf, topY, 0], [side * size * 0.34, height, 0], braceT);
        // 地线挂点
        b.cylinder(MAT.porcelain, { r: size * 0.026, h: size * 0.05, x: side * size * 0.34, y: height - size * 0.05, z: 0, segments: 8 });
        const wireCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(side * size * 0.34 - side * size * 0.18, height - size * 0.02, 0),
            new THREE.Vector3(side * size * 0.34, height - size * 0.06, 0),
            new THREE.Vector3(side * size * 0.34 + side * size * 0.18, height - size * 0.02, 0)
        ]);
        b.add(new THREE.Mesh(new THREE.TubeGeometry(wireCurve, 10, Math.max(0.6, size * 0.011), 6, false), MAT.cable));
    });
    // 中央避雷针
    b.beam(material, [0, height * 0.9, 0], [0, height * 1.02, 0], braceT);
    b.sphere(MAT.metalLight, { r: size * 0.035, cy: height * 1.02, x: 0, z: 0 });

    b.parts.anchor = new THREE.Vector3(0, height * 0.96, 0);
    return height * 1.02;
}
