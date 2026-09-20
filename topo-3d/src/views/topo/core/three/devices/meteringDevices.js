/**
 * 计量与开关类设备模型：双向电表（meter）与断路器（breaker）
 *
 * 造型要点：
 *  - 电表：白色立体表计，正面液晶屏（CanvasTexture 实时读数）+ 透明防护罩 + 底部接线端子
 *  - 断路器：小型开关本体，两端铜端子，正面可动操作手柄（合闸绿色上扬 / 分闸红色下压），
 *    并配状态指示灯，供实时数据驱动
 */
import * as THREE from 'three';
import { MAT, boxGeo } from '../materialLibrary.js';

/**
 * 构建双向电表模型。
 * @param {import('../ModelBuilder.js').default} b 模型构建器
 * @param {Object} opts 参数
 * @param {number} opts.w 占地宽（X）
 * @param {number} opts.d 占地深（Z）
 * @returns {number} 模型总高
 */
export function buildMeter(b, opts) {
    const { w, d } = opts;
    const height = Math.max(w, d) * 1.15;
    const bodyD = Math.max(10, d * 0.55);
    const baseH = Math.max(3, height * 0.06);
    const bodyH = height - baseH - 2;
    const frontZ = bodyD / 2;

    // 底座 + 表体
    b.box(MAT.plinth, { w: w * 0.86, h: baseH, d: bodyD + 4 });
    b.box(MAT.cabinetWhite, { w, h: bodyH, d: bodyD, y: baseH });
    // 顶部圆弧盖（半圆柱，营造家用表计的圆润轮廓）
    b.cylinder(MAT.cabinetWhite, {
        r: w / 2,
        h: bodyD,
        y: baseH + bodyH,
        rx: Math.PI / 2,
        rz: Math.PI / 2,
        x: 0,
        z: 0,
        segments: 12
    });
    // 正面凸起面板
    b.box(MAT.cabinetGray, { w: w * 0.84, h: bodyH * 0.72, d: 2, y: baseH + bodyH * 0.16, z: frontZ + 1 });

    // === 液晶屏（实时读数） ===
    b.screen({
        w: w * 0.62,
        h: bodyH * 0.36,
        cy: baseH + bodyH * 0.62,
        z: frontZ + 2.2,
        screen: { title: 'kWh', unit: 'kWh' }
    });

    // 透明防护罩
    b.box(MAT.glassCover, { w: w * 0.9, h: bodyH * 0.62, d: 1.6, y: baseH + bodyH * 0.2, z: frontZ + 3.2 });

    // 操作按钮（两枚）
    b.cylinder(MAT.darkPlastic, { r: w * 0.05, h: 2.4, y: baseH + bodyH * 0.12, x: -w * 0.2, z: frontZ + 3, rx: Math.PI / 2 });
    b.cylinder(MAT.darkPlastic, { r: w * 0.05, h: 2.4, y: baseH + bodyH * 0.12, x: w * 0.2, z: frontZ + 3, rx: Math.PI / 2 });

    // 脉冲指示灯
    const indicatorMaterial = b.own(MAT.indicatorGreen);
    const indicator = b.sphere(indicatorMaterial, { r: Math.max(1.3, w * 0.022), cy: baseH + bodyH * 0.86, x: w * 0.3, z: frontZ + 2.4 });
    b.parts.indicator = { mesh: indicator, material: indicatorMaterial };

    // 铭牌
    b.box(MAT.darkPlastic, { w: w * 0.5, h: bodyH * 0.07, d: 1, y: baseH + bodyH * 0.06, z: frontZ + 2.2 });

    // 底部接线端子（四路铜端子 + 绝缘座）
    b.box(MAT.darkPlastic, { w: w * 0.8, h: baseH * 0.9, d: bodyD * 0.8, z: -1 });
    const terminalCount = 4;
    const terminalGeo = boxGeo(w * 0.12, 4, 3);
    b.instanced(terminalGeo, MAT.copper, terminalCount, (dummy, i) => {
        dummy.position.set(-w * 0.3 + (i / (terminalCount - 1)) * w * 0.6, baseH + 2, frontZ + 1);
    });

    b.parts.anchor = new THREE.Vector3(0, height * 1.02, 0);
    return height;
}

/**
 * 构建断路器模型（含可动操作手柄，分/合闸状态可见）。
 * @param {import('../ModelBuilder.js').default} b 模型构建器
 * @param {Object} opts 参数
 * @param {number} opts.w 占地宽（X）
 * @param {number} opts.d 占地深（Z）
 * @returns {number} 模型总高
 */
export function buildBreaker(b, opts) {
    const { w, d } = opts;
    const baseH = Math.max(5, Math.min(w, d) * 0.14);
    const bodyH = Math.max(12, Math.min(w, d) * 0.3);
    const bodyD = Math.max(12, d * 0.6);
    const frontZ = bodyD / 2;
    const height = baseH + bodyH;

    // 绝缘底座 + 开关本体
    b.box(MAT.plinth, { w: w * 1.02, h: baseH, d: bodyD + 4 });
    b.box(MAT.cabinetGray, { w: w, h: bodyH, d: bodyD, y: baseH });
    b.box(MAT.cabinetWhite, { w: w * 0.92, h: bodyH * 0.5, d: bodyD * 0.92, y: baseH + bodyH * 0.5 });

    // 两端接线端子（铜排）
    [-1, 1].forEach((side) => {
        b.box(MAT.copper, { w: w * 0.16, h: baseH * 0.5, d: bodyD * 0.5, x: side * w * 0.44, y: baseH * 0.4, z: 0 });
    });

    // === 可动操作手柄（绕底部枢轴旋转） ===
    const leverMaterial = b.own(MAT.indicatorGreen);
    const pivot = new THREE.Group();
    pivot.position.set(0, baseH + bodyH * 0.35, frontZ - 1.5);
    b.group.add(pivot);
    const leverH = Math.max(8, bodyH * 0.75);
    const lever = new THREE.Mesh(boxGeo(w * 0.2, leverH, 4), leverMaterial);
    lever.position.set(0, leverH / 2, 0);
    lever.castShadow = true;
    lever.receiveShadow = true;
    pivot.add(lever);
    // 手柄顶端握把
    const grip = new THREE.Mesh(boxGeo(w * 0.26, 3, 5.5), leverMaterial);
    grip.position.set(0, leverH, 0.6);
    grip.castShadow = true;
    pivot.add(grip);

    // 合闸：向后上方抬起；分闸：向前下方压下
    const closedAngle = -0.62;
    const openAngle = 0.58;
    pivot.rotation.x = closedAngle;
    b.parts.handle = { pivot, material: leverMaterial, closedAngle, openAngle };

    // 状态指示灯
    const indicatorMaterial = b.own(MAT.indicatorGreen);
    const indicator = b.sphere(indicatorMaterial, { r: Math.max(1.3, w * 0.026), cy: baseH + bodyH * 0.92, x: -w * 0.3, z: frontZ - 0.5 });
    b.parts.indicator = { mesh: indicator, material: indicatorMaterial };

    // 铭牌
    b.box(MAT.darkPlastic, { w: w * 0.4, h: bodyH * 0.2, d: 1, x: w * 0.24, y: baseH + bodyH * 0.5, z: frontZ + 0.6 });

    b.parts.anchor = new THREE.Vector3(0, height * 1.05, 0);
    return height;
}
