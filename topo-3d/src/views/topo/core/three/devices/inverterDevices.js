/**
 * 变流类设备模型：PCS（储能变流器）与光伏逆变器（pinvt）
 *
 * 造型要点：
 *  - PCS：双开门立式机柜，侧面与柜门带散热格栅，顶部排风，正面液晶运行面板
 *  - 逆变器：壁挂式扁箱体，顶部铝制散热鳍片，正面大尺寸液晶屏，底部防水接线端子
 */
import * as THREE from 'three';
import { MAT, boxGeo, cylinderGeo } from '../materialLibrary.js';

/**
 * 构建 PCS 双开门立柜模型。
 * @param {import('../ModelBuilder.js').default} b 模型构建器
 * @param {Object} opts 参数
 * @param {number} opts.w 占地宽（X）
 * @param {number} opts.d 占地深（Z）
 * @returns {number} 模型总高
 */
export function buildPcs(b, opts) {
    const { w, d } = opts;
    const height = Math.max(w, d) * 1.72;
    const plinthH = Math.max(4, height * 0.05);
    const bodyH = height - plinthH - 3;
    const frontZ = d / 2;

    // 底座（略外扩）+ 柜体
    b.box(MAT.plinth, { w: w + 6, h: plinthH, d: d + 6 });
    b.box(MAT.cabinetWhite, { w, h: bodyH, d, y: plinthH });
    // 顶部压顶（外扩形成滴水檐）
    b.box(MAT.cabinetGray, { w: w + 6, h: 3, d: d + 6, y: height - 3 });

    // === 双开门 ===
    const doorGap = Math.max(1.6, w * 0.03);
    const doorW = (w - doorGap) / 2 - 2;
    const doorH = bodyH * 0.78;
    const doorY = plinthH + bodyH * 0.1;
    [-1, 1].forEach((side) => {
        const doorX = side * (doorW / 2 + doorGap / 2 + 0.4);
        b.box(MAT.cabinetGray, { w: doorW, h: doorH, d: 2, x: doorX, y: doorY, z: frontZ + 1 });
        // 门板下半部通风格栅（横向栅条）
        b.grille({ w: doorW * 0.72, h: doorH * 0.3, y: doorY + doorH * 0.08, z: frontZ + 2.2, count: 5, horizontal: true });
        // 门把手
        b.box(MAT.metalLight, { w: 3, h: doorH * 0.16, d: 2.6, x: doorX + side * doorW * 0.36, y: doorY + doorH * 0.5, z: frontZ + 2.6 });
    });

    // === 正面液晶运行面板 ===
    b.screen({
        w: w * 0.32,
        h: doorH * 0.34,
        cy: doorY + doorH * 0.66,
        z: frontZ + 2.4,
        screen: { title: 'PCS', unit: 'kW' }
    });

    // === 指示灯（面板下方） ===
    const indicatorMaterial = b.own(MAT.indicatorGreen);
    const indicator = b.sphere(indicatorMaterial, { r: Math.max(1.6, w * 0.028), cy: doorY + doorH * 0.34, x: -w * 0.12, z: frontZ + 2.4 });
    b.parts.indicator = { mesh: indicator, material: indicatorMaterial };

    // === 侧面散热鳍片（左右各一组，实例化） ===
    const finCount = 7;
    const finGeo = boxGeo(4, bodyH * 0.62, 2.4);
    b.instanced(finGeo, MAT.aluminum, finCount * 2, (dummy, i) => {
        const side = i < finCount ? -1 : 1;
        const index = i % finCount;
        dummy.position.set(
            side * (w / 2 + 2),
            plinthH + bodyH * 0.2 + index * (bodyH * 0.075),
            -d * 0.28 + (index / finCount) * d * 0.56
        );
    });

    // === 顶部排风格栅 ===
    b.grille({ w: w * 0.7, h: 8, y: height, z: -d * 0.1, count: 6, horizontal: true });

    // === 底部接线端子（三根铜排） ===
    b.box(MAT.darkPlastic, { w: w * 0.62, h: 4, d: 8, z: frontZ - 4 });
    for (let i = 0; i < 3; i += 1) {
        b.box(MAT.copper, { w: w * 0.15, h: 6, d: 5, x: -w * 0.2 + i * w * 0.2, y: 4, z: frontZ - 4 });
    }

    b.parts.anchor = new THREE.Vector3(0, height * 0.98, 0);
    return height;
}

/**
 * 构建光伏逆变器（壁挂扁箱 + 顶部散热鳍片）模型。
 * @param {import('../ModelBuilder.js').default} b 模型构建器
 * @param {Object} opts 参数
 * @param {number} opts.w 占地宽（X）
 * @param {number} opts.d 占地深（Z）
 * @returns {number} 模型总高
 */
export function buildPinvt(b, opts) {
    const { w, d } = opts;
    const mountH = Math.max(6, Math.min(w, d) * 0.12);
    const bodyH = Math.max(w, d) * 1.05;
    const bodyD = d * 0.72;
    const height = mountH + bodyH + Math.max(w, d) * 0.12;
    const frontZ = bodyD / 2;

    // 落地支架底座
    b.box(MAT.plinth, { w: w * 0.9, h: mountH, d: d * 0.95 });
    // 支架立管
    b.box(MAT.metalLight, { w: w * 0.5, h: mountH * 0.9, d: d * 0.3, y: mountH * 0.1, z: -d * 0.2 });

    // 主机箱体
    b.box(MAT.cabinetWhite, { w, h: bodyH, d: bodyD, y: mountH });
    // 箱盖（顶面略微外扩）
    b.box(MAT.cabinetGray, { w: w + 3, h: 2.5, d: bodyD + 3, y: mountH + bodyH });

    // === 顶部铝制散热鳍片（实例化） ===
    const finCount = 9;
    const finH = Math.max(w, d) * 0.12;
    const finGeo = boxGeo(w * 0.055, finH, bodyD * 0.86);
    b.instanced(finGeo, MAT.aluminum, finCount, (dummy, i) => {
        dummy.position.set(-w * 0.4 + (i / (finCount - 1)) * w * 0.8, mountH + bodyH + 2.5 + finH / 2, 0);
    });

    // === 正面液晶屏 ===
    b.screen({
        w: w * 0.62,
        h: bodyH * 0.4,
        cy: mountH + bodyH * 0.62,
        z: frontZ + 1.6,
        screen: { title: 'PV INV', unit: 'kW' }
    });

    // === 状态指示灯组（运行/告警/通信） ===
    const indicatorMaterial = b.own(MAT.indicatorGreen);
    const ledR = Math.max(1.4, w * 0.026);
    const indicator = b.sphere(indicatorMaterial, { r: ledR, cy: mountH + bodyH * 0.28, x: -w * 0.3, z: frontZ + 1.6 });
    b.sphere(b.own(MAT.indicatorAmber), { r: ledR, cy: mountH + bodyH * 0.28, x: 0, z: frontZ + 1.6 });
    b.sphere(b.own(MAT.indicatorIdle), { r: ledR, cy: mountH + bodyH * 0.28, x: w * 0.3, z: frontZ + 1.6 });
    b.parts.indicator = { mesh: indicator, material: indicatorMaterial };

    // 机箱分模线
    b.box(MAT.cabinetDark, { w: w * 0.94, h: 1.2, d: bodyD * 0.9, y: mountH + bodyH * 0.86 });

    // === 底部防水接头与直流端子 ===
    const glandGeo = cylinderGeo(2.2, 2.2, 5, 10);
    b.instanced(glandGeo, MAT.rubber, 3, (dummy, i) => {
        dummy.position.set(-w * 0.26 + i * w * 0.26, mountH - 2.5, -bodyD * 0.2);
    });
    b.box(MAT.darkPlastic, { w: w * 0.5, h: 3, d: 6, y: mountH * 0.35, z: frontZ - 2 });
    b.box(MAT.copper, { w: w * 0.3, h: 4, d: 4, y: mountH * 0.35 + 3, z: frontZ - 2 });

    b.parts.anchor = new THREE.Vector3(0, height * 1.02, 0);
    return height;
}
