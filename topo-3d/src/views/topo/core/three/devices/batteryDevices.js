/**
 * 储能电池类设备模型：电池堆（stack）与电池簇（cluster）
 *
 * 造型要点（参考微缩实物模型）：
 *  - 立式白色机柜 + 深色底座 + 顶部散热格栅
 *  - 正面凹陷腔体内可见层叠电池模组（InstancedMesh 复用）
 *  - 正面右侧 SOC 电量条（颜色随荷电量分档，实时驱动高度）
 *  - 顶部状态指示灯、底部接线端子、侧面通风栅
 */
import * as THREE from 'three';
import { MAT, boxGeo } from '../materialLibrary.js';

/**
 * 构建电池柜模型。
 * @param {import('../ModelBuilder.js').default} b 模型构建器
 * @param {Object} opts 参数
 * @param {number} opts.w 占地宽（X）
 * @param {number} opts.d 占地深（Z）
 * @param {boolean} opts.isStack 是否为电池堆（更大更高）
 * @returns {number} 模型总高
 */
export function buildBatteryCabinet(b, opts) {
    const { w, d, isStack } = opts;
    const height = Math.max(w, d) * (isStack ? 1.9 : 1.5);
    const plinthH = Math.max(4, height * 0.045);
    const bodyH = height - plinthH - 3;
    const frontZ = d / 2;

    // === 底座与柜体 ===
    b.box(MAT.plinth, { w: w + 7, h: plinthH, d: d + 7 });
    b.box(MAT.cabinetWhite, { w, h: bodyH, d, y: plinthH });
    // 顶部压顶板（略外扩，形成体素层次）
    b.box(MAT.cabinetGray, { w: w + 5, h: 3, d: d + 5, y: height - 3 });

    // === 顶部散热格栅（横向栅条，实例化） ===
    b.grille({ w: w * 0.6, h: height * 0.055, y: height, z: frontZ - 1.2, count: 5, horizontal: true });

    // === 正面腔内电池模组 ===
    const openW = w * 0.64;
    const openH = bodyH * 0.6;
    const openY = plinthH + bodyH * 0.18;
    const openX = -w * 0.05;
    // 深色内腔（内缩 0.6，避免与柜体正面共面产生深度冲突）
    b.box(MAT.darkPlastic, { w: openW, h: openH, d: 4, x: openX, y: openY, z: frontZ - 2.6 });

    const rows = isStack ? 5 : 4;
    const gap = Math.max(1.4, openH * 0.035);
    const moduleH = (openH - gap * (rows + 1)) / rows;
    const moduleW = openW - 6;
    const moduleD = 5;
    // 层叠模组本体
    b.instanced(boxGeo(moduleW, moduleH, moduleD), MAT.batteryModule, rows, (dummy, i) => {
        dummy.position.set(openX, openY + gap + i * (moduleH + gap) + moduleH / 2, frontZ - 0.6);
    });
    // 模组正面蓝色电芯装饰条（与模组一一对应，构成"可见层叠电芯"观感）
    b.instanced(boxGeo(moduleW * 0.86, moduleH * 0.28, 1.2), MAT.batteryCellStrip, rows, (dummy, i) => {
        dummy.position.set(openX, openY + gap + i * (moduleH + gap) + moduleH * 0.62, frontZ + 1.9);
    });

    // === 正面右侧 SOC 电量条 ===
    const socW = Math.max(4, w * 0.075);
    const socX = openX + openW / 2 + socW * 1.6;
    const socTrackZ = frontZ - 0.4;
    b.box(MAT.darkPlastic, { w: socW, h: openH, d: 3, x: socX, y: openY, z: socTrackZ });
    const socMaterial = b.own(MAT.indicatorGreen);
    const socFillHeight = openH - 6;
    const socFill = b.box(socMaterial, { w: socW * 0.66, h: 1, d: 3.6, x: socX, y: openY + 3, z: socTrackZ + 0.6 });
    b.parts.soc = {
        mesh: socFill,
        baseY: openY + 3,
        maxHeight: socFillHeight,
        material: socMaterial
    };

    // === 正面左半侧柜门（营造"半开"层次）+ 把手 ===
    const doorW = w * 0.24;
    b.box(MAT.cabinetGray, { w: doorW, h: bodyH * 0.74, d: 2, x: -w / 2 + doorW / 2 + 1, y: plinthH + bodyH * 0.12, z: frontZ + 1 });
    b.box(MAT.metalLight, { w: 2, h: bodyH * 0.12, d: 2.6, x: -w / 2 + doorW, y: plinthH + bodyH * 0.42, z: frontZ + 2.6 });

    // === 指示灯（顶部左侧） ===
    const indicatorMaterial = b.own(MAT.indicatorGreen);
    const indicator = b.sphere(indicatorMaterial, { r: Math.max(1.8, w * 0.035), cy: height * 0.93, x: -w / 2 + w * 0.12, z: frontZ + 0.6 });
    b.parts.indicator = { mesh: indicator, material: indicatorMaterial };

    // === 底部接线端子（铜排 + 深色绝缘座） ===
    b.box(MAT.darkPlastic, { w: w * 0.46, h: 3, d: 6, x: 0, y: 0, z: frontZ - 3 });
    const terminalCount = 3;
    const terminalW = (w * 0.4) / terminalCount - 2;
    for (let i = 0; i < terminalCount; i += 1) {
        b.box(MAT.copper, {
            w: terminalW,
            h: 5,
            d: 4,
            x: -w * 0.2 + (i + 0.5) * ((w * 0.4) / terminalCount),
            y: 3,
            z: frontZ - 3
        });
    }

    // === 侧面通风栅（左右各一组，实例化横条） ===
    const sideVents = 4;
    const ventGeo = boxGeo(1.6, 3, d * 0.42);
    b.instanced(ventGeo, MAT.grille, sideVents * 2, (dummy, i) => {
        const side = i < sideVents ? -1 : 1;
        const index = i % sideVents;
        dummy.position.set(side * (w / 2 + 0.8), plinthH + bodyH * 0.3 + index * (bodyH * 0.11), 0);
    });

    // === 接线端子锚点（顶部中央） ===
    b.parts.anchor = new THREE.Vector3(0, height * 0.98, 0);
    return height;
}
