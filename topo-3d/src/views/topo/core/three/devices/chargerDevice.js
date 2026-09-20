/**
 * 充电桩设备模型（charger）
 *
 * 造型要点：
 *  - 深色底座 + 立式白色桩体 + 顶部遮雨帽
 *  - 正面液晶计费屏、状态灯带、刷卡区
 *  - 侧挂充电枪（枪体 + 握把 + 枪嘴）与自然垂坠的立体线缆（TubeGeometry）
 */
import * as THREE from 'three';
import { MAT } from '../materialLibrary.js';

/**
 * 构建充电桩模型。
 * @param {import('../ModelBuilder.js').default} b 模型构建器
 * @param {Object} opts 参数
 * @param {number} opts.w 占地宽（X）
 * @param {number} opts.d 占地深（Z）
 * @returns {number} 模型总高
 */
export function buildCharger(b, opts) {
    const { w, d } = opts;
    const baseH = Math.max(5, Math.min(w, d) * 0.14);
    const height = Math.max(w, d) * 2.1;
    const bodyH = height - baseH - 4;
    const bodyW = w * 0.78;
    const bodyD = Math.max(12, d * 0.62);
    const frontZ = bodyD / 2;

    // 底座 + 桩体
    b.box(MAT.plinth, { w: w * 0.92, h: baseH, d: bodyD + 5 });
    b.box(MAT.cabinetWhite, { w: bodyW, h: bodyH, d: bodyD, y: baseH });
    // 顶部遮雨帽
    b.box(MAT.cabinetGray, { w: bodyW * 1.08, h: 4, d: bodyD * 1.08, y: baseH + bodyH });

    // === 正面计费屏 ===
    b.screen({
        w: bodyW * 0.62,
        h: bodyH * 0.22,
        cy: baseH + bodyH * 0.76,
        z: frontZ + 1.4,
        screen: { title: 'CHARGE', unit: 'kWh' }
    });

    // === 状态灯带（竖向发光条） ===
    const stripMaterial = b.own(MAT.indicatorGreen);
    const strip = b.box(stripMaterial, { w: bodyW * 0.06, h: bodyH * 0.4, d: 1.2, x: -bodyW * 0.38, y: baseH + bodyH * 0.34, z: frontZ + 1.2 });
    b.parts.indicator = { mesh: strip, material: stripMaterial };

    // 刷卡区与急停按钮
    b.box(MAT.darkPlastic, { w: bodyW * 0.3, h: bodyH * 0.1, d: 1.4, x: bodyW * 0.22, y: baseH + bodyH * 0.62, z: frontZ + 1.2 });
    b.cylinder(b.own(MAT.indicatorRed), { r: Math.max(2, w * 0.05), h: 2.4, x: bodyW * 0.22, y: baseH + bodyH * 0.5, z: frontZ + 2, rx: Math.PI / 2 });

    // 底部散热百叶
    b.grille({ w: bodyW * 0.7, h: bodyH * 0.12, y: baseH + bodyH * 0.06, z: frontZ + 1, count: 4, horizontal: true });

    // === 侧挂充电枪 ===
    const gunX = bodyW / 2 + w * 0.14;
    const gunZ = frontZ - 2;
    const holsterH = bodyH * 0.16;
    // 枪座
    b.box(MAT.cabinetGray, { w: w * 0.14, h: holsterH, d: 4, x: bodyW / 2 + w * 0.05, y: baseH + bodyH * 0.52, z: gunZ });
    // 枪体（枪身 + 握把 + 枪嘴）
    b.box(MAT.cabinetGray, { w: w * 0.11, h: bodyH * 0.2, d: 5, x: gunX, y: baseH + bodyH * 0.5, z: gunZ });
    b.box(MAT.darkPlastic, { w: w * 0.08, h: bodyH * 0.1, d: 4, x: gunX, y: baseH + bodyH * 0.42, z: gunZ });
    b.cylinder(MAT.metalLight, { r: 2.2, h: 6, x: gunX, y: baseH + bodyH * 0.7, z: gunZ, rx: Math.PI / 2, segments: 10 });

    // === 线缆（自然垂坠的立体管道） ===
    const cableCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(gunX, baseH + bodyH * 0.46, gunZ + 3),
        new THREE.Vector3(gunX + w * 0.16, baseH + bodyH * 0.3, gunZ + 6),
        new THREE.Vector3(bodyW * 0.5 + 1, baseH + bodyH * 0.16, gunZ + 5),
        new THREE.Vector3(bodyW * 0.42, baseH + bodyH * 0.1, 2)
    ]);
    const cableGeo = new THREE.TubeGeometry(cableCurve, 28, Math.max(1.6, w * 0.035), 8, false);
    const cable = new THREE.Mesh(cableGeo, MAT.rubber);
    b.add(cable);

    b.parts.anchor = new THREE.Vector3(0, height * 1.02, 0);
    return height;
}
