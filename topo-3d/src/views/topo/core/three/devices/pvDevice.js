/**
 * 光伏设备模型（pv）：倾斜的光伏板阵列
 *
 * 造型要点：
 *  - 多排多列深蓝色电池板，铝制边框（InstancedMesh 复用板框与电池片）
 *  - 整体按固定倾角抬起（朝向观察者一侧），下方有前后支柱与横梁
 *  - 阵列旁布置汇流箱与线缆，贴近微缩光伏电站产品图观感
 */
import * as THREE from 'three';
import { MAT, boxGeo, cylinderGeo } from '../materialLibrary.js';

/** 光伏板阵列倾角（弧度，约 36°） */
const TILT = 0.63;

/**
 * 构建光伏阵列模型。
 * @param {import('../ModelBuilder.js').default} b 模型构建器
 * @param {Object} opts 参数
 * @param {number} opts.w 占地宽（X）
 * @param {number} opts.d 占地深（Z）
 * @returns {number} 模型总高
 */
export function buildPv(b, opts) {
    const { w, d } = opts;
    const cols = 3;
    const rows = 2;
    const gapX = w * 0.06;
    const gapZ = d * 0.1;
    const panelW = (w - gapX * (cols - 1)) / cols;
    const panelD = (d - gapZ * (rows - 1)) / rows;
    const frameH = Math.max(1.6, panelD * 0.06);
    const cellH = Math.max(0.5, frameH * 0.4);

    // 阵列组：整体倾斜后抬升，保证最低边不穿地
    const arrayGroup = new THREE.Group();
    arrayGroup.rotation.x = TILT;
    arrayGroup.position.y = (d / 2) * Math.sin(TILT);
    b.group.add(arrayGroup);

    // 板框与电池片（实例化）
    const frameMesh = new THREE.InstancedMesh(boxGeo(panelW, frameH, panelD), MAT.aluminum, cols * rows);
    const cellMesh = new THREE.InstancedMesh(boxGeo(panelW * 0.9, cellH, panelD * 0.86), MAT.pvCell, cols * rows);
    const cellStripGeo = boxGeo(panelW * 0.06, cellH * 1.2, panelD * 0.86);
    const stripMesh = new THREE.InstancedMesh(cellStripGeo, MAT.pvCellDeep, cols * rows);
    const dummy = new THREE.Object3D();
    let index = 0;
    for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
            const px = -w / 2 + panelW / 2 + c * (panelW + gapX);
            const pz = -d / 2 + panelD / 2 + r * (panelD + gapZ);
            dummy.position.set(px, 0, pz);
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            frameMesh.setMatrixAt(index, dummy.matrix);
            // 电池片贴在板框上表面
            dummy.position.set(px, frameH / 2 + cellH / 2 - 0.05, pz);
            dummy.updateMatrix();
            cellMesh.setMatrixAt(index, dummy.matrix);
            // 电池片栅线（细条，营造电池片分割感）
            dummy.position.set(px, frameH / 2 + cellH * 0.9, pz);
            dummy.updateMatrix();
            stripMesh.setMatrixAt(index, dummy.matrix);
            index += 1;
        }
    }
    [frameMesh, cellMesh, stripMesh].forEach((mesh) => {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        arrayGroup.add(mesh);
    });

    // === 前后支柱与横梁（阵列下方支撑） ===
    const deckY = (d / 2) * Math.sin(TILT);
    const legHeight = Math.max(6, d * 0.22);
    const legGeo = cylinderGeo(Math.max(1.1, w * 0.022), Math.max(1.1, w * 0.022), legHeight, 8);
    const legPositions = [-1, 1];
    const legGroup = new THREE.Group();
    legPositions.forEach((sx) => {
        [-1, 1].forEach((sz) => {
            const leg = new THREE.Mesh(legGeo, MAT.metalLight);
            leg.position.set(sx * (w / 2 - w * 0.08), legHeight / 2, sz * (d / 2 - d * 0.1));
            leg.castShadow = true;
            leg.receiveShadow = true;
            legGroup.add(leg);
        });
    });
    b.group.add(legGroup);
    // 立柱顶部的横向支撑梁（与阵列底面贴合）
    b.box(MAT.metalLight, { w: w * 0.94, h: 1.6, d: 1.6, y: legHeight - 1, z: -d * 0.33 });
    b.box(MAT.metalLight, { w: w * 0.94, h: 1.6, d: 1.6, y: legHeight * 0.55, z: d * 0.33 });

    // === 汇流箱与线缆 ===
    const boxW = w * 0.2;
    b.box(MAT.cabinetWhite, { w: boxW, h: w * 0.16, d: d * 0.12, x: -w / 2 + boxW * 0.7, z: -d / 2 + d * 0.06 });
    b.box(MAT.darkPlastic, { w: boxW * 0.7, h: w * 0.05, d: 1, x: -w / 2 + boxW * 0.7, y: w * 0.06, z: -d / 2 + d * 0.12 });

    // 阵列最高点作为接线锚点
    b.parts.anchor = new THREE.Vector3(0, deckY + (d / 2) * Math.sin(TILT) + legHeight + 4, 0);
    return deckY * 2 + legHeight + 6;
}
