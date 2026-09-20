/**
 * 基础元素模型：母线（busbar）、直线（line）、文字（text）、矩形框（rect）
 *
 * 造型要点：
 *  - 母线：立体铜排/汇流排，架设于绝缘子之上，两端带金属端帽与顶部高光
 *  - 直线：细长的金属电缆槽（比母线更薄、更轻）
 *  - 文字：贴地文字贴图（CanvasTexture）
 *  - 矩形框：贴地描边轮廓（对应第一版的区域框）
 */
import * as THREE from 'three';
import { MAT, cylinderGeo, roundedRectPoints } from '../materialLibrary.js';
import { createTextPlaneTexture } from '../textureFactory.js';

/** 需要"默认配色"的填充值（第一版中基础元素默认为白色，三维版改为材质本色） */
const DEFAULT_COLORS = ['#ffffff', '#fff', 'white', ''];

/**
 * 判断是否为默认配色（默认配色时使用材质本色，而非白色）。
 * @param {string} color 颜色值
 * @returns {boolean}
 */
function isDefaultColor(color) {
    return !color || DEFAULT_COLORS.includes(String(color).toLowerCase());
}

/**
 * 构建母线（立体铜排/汇流排）模型。
 * @param {import('../ModelBuilder.js').default} b 模型构建器
 * @param {Object} opts 参数
 * @param {number} opts.w 长度（X）
 * @param {number} opts.d 厚度（Z）
 * @param {Object} opts.node 节点数据
 * @returns {number} 模型总高
 */
export function buildBusbar(b, opts) {
    const { w, d, node } = opts;
    // 母线在三维中需要有足够厚度才可辨识，因此对第一版的 2~5px 高度做适度放大
    const barH = Math.min(22, Math.max(7, Math.max(d * 2.2, w * 0.045)));
    const barD = Math.min(30, Math.max(10, Math.max(d, w * 0.04)));
    const insH = Math.max(4, barH * 0.4);

    // 绝缘支柱（3 只，实例化）
    const insCount = w > 300 ? 4 : 3;
    const insGeo = cylinderGeo(barD * 0.22, barD * 0.3, insH, 8);
    const insPositions = [];
    for (let i = 0; i < insCount; i += 1) {
        insPositions.push(-w / 2 + (w / (insCount - 1)) * i);
    }
    b.instanced(insGeo, MAT.porcelain, insCount, (dummy, i) => {
        dummy.position.set(insPositions[i], insH / 2, 0);
    });

    // 铜排主体（支持自定义颜色，默认铜色）
    const style = node.style || {};
    const color = style.stroke || style.fill;
    const mainMaterial = isDefaultColor(color) ? MAT.copper : b.own(new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.85 }));
    b.box(mainMaterial, { w, h: barH, d: barD, y: insH });
    // 顶部高光条
    b.box(MAT.metalLight, { w: w * 0.995, h: barH * 0.12, d: barD * 0.7, y: insH + barH });
    // 两端金属端帽
    [-1, 1].forEach((side) => {
        b.box(MAT.metalLight, { w: barD * 0.6, h: barH * 1.1, d: barD * 1.05, x: side * (w / 2 - barD * 0.3), y: insH + (barH - barH * 1.1) / 2 });
    });

    b.parts.anchor = new THREE.Vector3(0, insH + barH, 0);
    return insH + barH;
}

/**
 * 构建立体电缆槽（直线元素）模型。
 * @param {import('../ModelBuilder.js').default} b 模型构建器
 * @param {Object} opts 参数
 * @returns {number} 模型总高
 */
export function buildLine(b, opts) {
    const { w, d, node } = opts;
    const barH = Math.min(12, Math.max(4, d * 1.6));
    const barD = Math.min(22, Math.max(8, d * 2.4));
    const style = node.style || {};
    const color = style.stroke || style.fill;
    const material = isDefaultColor(color) ? MAT.cableDuct : b.own(new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.45 }));

    // 电缆槽主体
    b.box(material, { w, h: barH, d: barD });
    // 槽盖凹槽线
    b.box(MAT.cabinetDark, { w: w * 0.98, h: barH * 0.16, d: barD * 0.28, y: barH * 0.86 });
    // 两端固定支架
    [-1, 1].forEach((side) => {
        b.box(MAT.plinth, { w: Math.max(2, w * 0.03), h: barH * 1.6, d: barD * 1.2, x: side * (w / 2 - w * 0.02) });
    });

    b.parts.anchor = new THREE.Vector3(0, barH, 0);
    return barH * 1.6;
}

/**
 * 构建贴地文字模型。
 * @param {import('../ModelBuilder.js').default} b 模型构建器
 * @param {Object} opts 参数
 * @returns {number} 模型总高
 */
export function buildText(b, opts) {
    const { w, d, node } = opts;
    const style = node.style || {};
    const text = createTextPlaneTexture(node.text || '', {
        color: isDefaultColor(style.fill) ? '#2b3440' : style.fill
    });
    b.ownedMaterials.push(text.material);
    b.plane(text.material, { w, h: d, y: 1, rx: -Math.PI / 2 });
    b.parts.text = { setText: text.setText, texture: text.texture };
    return 2;
}

/**
 * 构建贴地矩形框（区域描边）模型。
 * @param {import('../ModelBuilder.js').default} b 模型构建器
 * @param {Object} opts 参数
 * @returns {number} 模型总高
 */
export function buildRect(b, opts) {
    const { w, d, node } = opts;
    const style = node.style || {};
    const color = isDefaultColor(style.stroke) ? '#7d8899' : style.stroke;
    const points = roundedRectPoints(w, d, Math.min(8, Math.min(w, d) / 6));
    const vertices = points.map((p) => new THREE.Vector3(p.x, 1.2, -p.y));
    const geometry = new THREE.BufferGeometry().setFromPoints(vertices);
    const material = new THREE.LineBasicMaterial({ color });
    material.userData.owned = true;
    const line = new THREE.LineLoop(geometry, material);
    line.userData.drawnLine = true;
    line.userData.pickable = false;
    b.group.add(line);
    // 与第一版一致：矩形框无填充，仅作区域描边
    b.parts.anchor = new THREE.Vector3(0, 2, 0);
    return 2;
}
