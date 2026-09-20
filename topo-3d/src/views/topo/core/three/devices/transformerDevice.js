/**
 * 变压器设备模型（transformer）
 *
 * 造型要点：
 *  - 深色基础台座 + 灰色油箱箱体
 *  - 两侧成组散热片（InstancedMesh 复用薄板，模拟片式散热器）
 *  - 顶部三只高压套管（瓷瓶 + 伞裙 + 均压帽）与储油柜
 *  - 正面铭牌与低压侧端子
 */
import * as THREE from 'three';
import { MAT, boxGeo } from '../materialLibrary.js';

/**
 * 构建变压器模型。
 * @param {import('../ModelBuilder.js').default} b 模型构建器
 * @param {Object} opts 参数
 * @param {number} opts.w 占地宽（X）
 * @param {number} opts.d 占地深（Z）
 * @returns {number} 模型总高
 */
export function buildTransformer(b, opts) {
    const { w, d } = opts;
    const baseH = Math.max(5, Math.min(w, d) * 0.12);
    const tankH = Math.max(w, d) * 0.72;
    const tankW = w * 0.66;
    const tankD = d * 0.66;
    const bushingH = Math.max(w, d) * 0.42;
    const height = baseH + tankH + bushingH;
    const frontZ = tankD / 2;

    // 基础台座（铁轨底） + 油箱
    b.box(MAT.plinth, { w: w * 1.0, h: baseH, d: d * 0.86 });
    b.box(MAT.cabinetGray, { w: tankW, h: tankH, d: tankD, y: baseH });
    // 顶部箱盖（外扩）
    b.box(MAT.cabinetDark, { w: tankW * 1.1, h: 3, d: tankD * 1.1, y: baseH + tankH });

    // === 两侧片式散热器（实例化薄板） ===
    const finCount = 9;
    const finGeo = boxGeo(3.2, tankH * 0.62, tankD * 0.42);
    b.instanced(finGeo, MAT.aluminum, finCount * 2, (dummy, i) => {
        const side = i < finCount ? -1 : 1;
        const index = i % finCount;
        dummy.position.set(
            side * (tankW / 2 + 2.4),
            baseH + tankH * 0.2,
            -tankD * 0.34 + (index / (finCount - 1)) * tankD * 0.68
        );
    });

    // === 正面铭牌与低压端子 ===
    b.box(MAT.darkPlastic, { w: tankW * 0.34, h: tankH * 0.24, d: 1.5, x: -tankW * 0.2, y: baseH + tankH * 0.52, z: frontZ + 0.8 });
    b.box(MAT.copper, { w: tankW * 0.22, h: tankH * 0.1, d: 4, x: tankW * 0.22, y: baseH + tankH * 0.3, z: frontZ + 1.6 });

    // === 顶部储油柜（横置圆柱） ===
    b.cylinder(MAT.cabinetGray, {
        r: Math.max(3.5, tankW * 0.13),
        h: tankW * 0.86,
        y: baseH + tankH + Math.max(w, d) * 0.1,
        z: -tankD * 0.34,
        rz: Math.PI / 2,
        segments: 12
    });

    // === 高压套管 ×3（瓷瓶 + 伞裙 + 均压帽） ===
    const bushingCount = 3;
    const porcelainH = bushingH * 0.55;
    const yStart = baseH + tankH + 3;
    for (let i = 0; i < bushingCount; i += 1) {
        const x = -tankW * 0.3 + (i / (bushingCount - 1)) * tankW * 0.6;
        const z = frontZ * 0.4;
        // 瓷瓶主体
        b.cylinder(MAT.porcelain, { r: tankW * 0.06, h: porcelainH, x, y: yStart, z, segments: 10 });
        // 伞裙（三段递增）
        for (let k = 0; k < 3; k += 1) {
            b.cone(MAT.porcelain, {
                r: tankW * (0.11 - k * 0.012),
                h: bushingH * 0.09,
                x,
                y: yStart + porcelainH * (0.16 + k * 0.28),
                z,
                segments: 10
            });
        }
        // 顶部均压帽
        b.cylinder(MAT.metalLight, { r: tankW * 0.05, h: bushingH * 0.14, x, y: yStart + porcelainH, z, segments: 10 });
        b.sphere(MAT.metalLight, { r: tankW * 0.05, cy: yStart + porcelainH + bushingH * 0.16, x, z });
    }

    // 储油柜与油箱连接管
    b.cylinder(MAT.metalLight, { r: Math.max(1.4, tankW * 0.04), h: tankH * 0.2, x: 0, y: baseH + tankH, z: -tankD * 0.34, segments: 8 });

    b.parts.anchor = new THREE.Vector3(0, height * 1.0, 0);
    return height;
}
