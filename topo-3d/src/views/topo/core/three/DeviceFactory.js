/**
 * DeviceFactory - 设备模型工厂（统一入口）
 *
 * 职责：
 *  - 按节点类型分发到具体模型构建函数，产出可直接挂到场景中的 THREE.Group
 *  - 统一附加：名称标签精灵、告警标记、射线拾取包围盒、接线端子锚点、模型高度
 *  - 提供设备运行时状态渲染接口：指示灯颜色、SOC 电量条、液晶读数、断路器手柄、
 *    告警呼吸标记、离线暗化
 *
 * 输出约定（挂在 group.userData 上）：
 *  - height      模型总高
 *  - anchor      默认接线端子（本地坐标）
 *  - parts       可动画部件引用表
 *  - node        归属的拓扑节点数据
 *  - isBusLike   是否为母线/直线等"沿轴可任意接线"的元素
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAT, PALETTE, coneGeo } from './materialLibrary.js';
import { createLabelSprite } from './textureFactory.js';
import ModelBuilder from './ModelBuilder.js';
import { buildBusbar, buildLine, buildText, buildRect } from './devices/basicDevices.js';
import { buildBatteryCabinet } from './devices/batteryDevices.js';
import { buildPcs, buildPinvt } from './devices/inverterDevices.js';
import { buildMeter, buildBreaker } from './devices/meteringDevices.js';
import { buildCharger } from './devices/chargerDevice.js';
import { buildTransformer } from './devices/transformerDevice.js';
import { buildGrid } from './devices/gridDevice.js';
import { buildPv } from './devices/pvDevice.js';

/** 不显示名称标签的节点类型（与第一版行为保持一致） */
const HIDE_LABEL_TYPES = ['line', 'busbar', 'text', 'rect'];

/** 母线/直线类元素：接线点可沿其轴向滑动 */
const BUS_LIKE_TYPES = ['busbar', 'line'];

/** 设备类型 -> 构建函数映射 */
const BUILDERS = {
    busbar: buildBusbar,
    line: buildLine,
    text: buildText,
    rect: buildRect,
    pv: buildPv,
    pinvt: buildPinvt,
    pcs: buildPcs,
    stack: (b, opts) => buildBatteryCabinet(b, { ...opts, isStack: true }),
    cluster: (b, opts) => buildBatteryCabinet(b, { ...opts, isStack: false }),
    meter: buildMeter,
    breaker: buildBreaker,
    transformer: buildTransformer,
    charger: buildCharger,
    grid: buildGrid
};

/**
 * 合并设备内"同材质的静态部件"，把大量小盒体/圆柱合并为单个几何体，显著降低绘制调用。
 *
 * 只处理 group 的直接子 Mesh，且仅限使用共享材质库的部件，因此：
 *  - 实例化部件（InstancedMesh）、精灵（标签/徽章）、线框（矩形框）、拾取包围盒不受影响
 *  - 嵌套结构（旋转手柄枢轴、告警标记组、光伏阵列组）不会被破坏
 *  - 使用私有材质的部件（屏幕、指示灯、SOC 电量条）保持独立，仍可单独控制颜色与可见性
 * @param {THREE.Group} group 设备对象组
 */
function mergeStaticParts(group) {
    const buckets = new Map();
    group.children.forEach((child) => {
        if (!child.isMesh || child.isInstancedMesh) return;
        if (child.userData.isPickTarget || child.userData.drawnLine) return;
        if (!child.geometry || !child.material) return;
        if (!(child.material.userData && child.material.userData.shared)) return;
        const key = child.material.uuid;
        if (!buckets.has(key)) buckets.set(key, { material: child.material, meshes: [] });
        buckets.get(key).meshes.push(child);
    });

    buckets.forEach(({ material, meshes }) => {
        if (meshes.length < 2) return;
        const geometries = [];
        meshes.forEach((mesh) => {
            mesh.updateMatrix();
            const geometry = mesh.geometry.clone();
            geometry.applyMatrix4(mesh.matrix);
            geometries.push(geometry);
        });
        let merged = null;
        try {
            merged = mergeGeometries(geometries, false);
        } catch (error) {
            console.error('[DeviceFactory] 部件合并失败，保留原始部件', error);
        }
        geometries.forEach((geometry) => geometry.dispose());
        if (!merged) return;
        meshes.forEach((mesh) => group.remove(mesh));
        const mesh = new THREE.Mesh(merged, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
    });
}

/**
 * 创建节点对应的三维模型。
 * @param {Object} node 拓扑节点数据
 * @returns {THREE.Group} 设备对象组
 */
export function createDeviceModel(node) {
    const width = Math.max(8, Number(node.width) || 60);
    const depth = Math.max(6, Number(node.height) || 60);
    const builder = new ModelBuilder(node);
    const build = BUILDERS[node.type] || buildRect;

    let height = 20;
    try {
        height = build(builder, { w: width, d: depth, node }) || 20;
    } catch (error) {
        // 单设备模型构建失败不应影响整体渲染，降级为占位盒体
        console.error(`[DeviceFactory] 节点 ${node.id}(${node.type}) 模型构建失败，已降级为占位体`, error);
        builder.box(MAT.cabinetGray, { w: width, h: 24, d: depth });
        height = 24;
    }

    // 合并同材质静态部件，降低绘制调用
    mergeStaticParts(builder.group);

    // 拾取包围盒（提高拾取容错率，避免细长部件难以点中）
    builder.addPickBox(width, Math.max(height, 24), depth);

    // 名称标签（悬浮于设备上方）
    if (!HIDE_LABEL_TYPES.includes(node.type)) {
        const labelHeight = Math.max(17, Math.min(width, depth) * 0.44);
        const label = createLabelSprite(node.text || '', { worldHeight: labelHeight });
        label.sprite.position.set(0, height + labelHeight * 0.9, 0);
        builder.group.add(label.sprite);
        builder.ownedMaterials.push(label.material);
        builder.parts.label = { sprite: label.sprite, setText: label.setText, worldHeight: labelHeight };
    }

    // 告警标记（默认隐藏，红色倒锥 + 高亮，随数据呼吸）
    const alarmMaterial = builder.own(MAT.alarmMarker);
    const alarmGroup = new THREE.Group();
    const alarmCone = new THREE.Mesh(coneGeo(Math.max(4, Math.min(width, depth) * 0.14), Math.max(9, Math.min(width, depth) * 0.3), 4), alarmMaterial);
    alarmCone.rotation.x = Math.PI;
    alarmCone.position.y = 0;
    alarmGroup.add(alarmCone);
    alarmGroup.position.set(0, height + Math.max(20, height * 0.22), 0);
    alarmGroup.visible = false;
    alarmGroup.name = 'alarmMarker';
    builder.group.add(alarmGroup);

    // 汇总 userData
    const group = builder.group;
    group.userData.nodeId = node.id;
    group.userData.height = height;
    group.userData.anchor = builder.parts.anchor || new THREE.Vector3(0, height, 0);
    group.userData.parts = builder.parts;
    group.userData.ownedMaterials = builder.ownedMaterials;
    group.userData.node = node;
    group.userData.isBusLike = BUS_LIKE_TYPES.includes(node.type);
    group.userData.footprint = { width, depth };
    group.userData.alarm = { group: alarmGroup, material: alarmMaterial, baseY: alarmGroup.position.y };

    // 静态设备关闭矩阵自动更新，降低每帧开销
    group.matrixAutoUpdate = true;
    return group;
}

/**
 * 更新设备名称标签。
 * @param {THREE.Object3D} group 设备对象组
 * @param {string} text 名称
 */
export function updateDeviceLabel(group, text) {
    const label = group.userData.parts && group.userData.parts.label;
    if (label) label.setText(text || '');
}

/**
 * 更新贴地文字内容。
 * @param {THREE.Object3D} group 设备对象组
 * @param {string} text 文本
 */
export function updateDeviceText(group, text) {
    const part = group.userData.parts && group.userData.parts.text;
    if (part) part.setText(text || '');
}

/**
 * 根据状态取指示灯颜色。
 * @param {string} status 设备状态
 * @param {boolean} alarm 是否告警
 * @returns {number} 十六进制颜色
 */
function indicatorColorOf(status, alarm) {
    if (alarm) return PALETTE.danger;
    switch (status) {
        case 'charging':
        case 'running':
            return PALETTE.ok;
        case 'discharging':
            return PALETTE.warn;
        case 'offline':
            return 0x5d6570;
        default:
            return PALETTE.idle;
    }
}

/**
 * SOC 分档颜色（<0.2 红 / 0.2~0.6 橙 / >0.6 绿）。
 * @param {number} soc 0~1
 * @returns {number} 十六进制颜色
 */
function socColor(soc) {
    if (soc < 0.2) return PALETTE.danger;
    if (soc <= 0.6) return PALETTE.warn;
    return PALETTE.ok;
}

/**
 * 应用设备运行时状态（指示灯 / SOC / 屏幕 / 手柄 / 告警 / 离线暗化）。
 * @param {THREE.Object3D} group 设备对象组
 * @param {Object} data 实时数据
 * @param {number} [data.soc] 荷电量 0~100
 * @param {number} [data.power] 功率 kW
 * @param {string} [data.status] 状态
 * @param {boolean} [data.alarm] 是否告警
 * @param {boolean} [data.closed] 断路器是否合闸
 */
export function applyDeviceRuntimeState(group, data) {
    if (!group || !data) return;
    const parts = group.userData.parts || {};
    const status = data.status || 'idle';
    const alarm = !!data.alarm;

    // === 指示灯 ===
    if (parts.indicator) {
        const color = indicatorColorOf(status, alarm);
        parts.indicator.material.color.setHex(color);
        if (parts.indicator.material.emissive) {
            parts.indicator.material.emissive.setHex(color);
        }
        // 告警时提升自发光强度形成"呼吸"基底
        parts.indicator.material.emissiveIntensity = alarm ? 2.4 : 1.4;
    }

    // === SOC 电量条 ===
    if (parts.soc) {
        const soc = Math.max(0, Math.min(1, (data.soc == null ? 0 : data.soc) / 100));
        const ratio = Math.max(0.02, soc);
        parts.soc.mesh.scale.y = Math.max(0.001, parts.soc.maxHeight * ratio);
        parts.soc.mesh.position.y = parts.soc.baseY + (parts.soc.maxHeight * ratio) / 2;
        const color = socColor(soc);
        parts.soc.material.color.setHex(color);
        parts.soc.material.emissive.setHex(color);
        parts.soc.material.emissiveIntensity = status === 'offline' ? 0.2 : 1.1;
        parts.soc.mesh.visible = status !== 'offline';
    }

    // === 液晶屏读数 ===
    if (parts.screen) {
        const power = data.power == null ? null : data.power;
        const value = power == null ? '--' : `${power > 0 ? '+' : ''}${power.toFixed(1)}`;
        parts.screen.draw({
            value,
            unit: 'kW',
            status: statusTextOf(status),
            color: status === 'charging' ? '#8ff0c8' : status === 'discharging' ? '#ffd88a' : '#a9c9dd'
        });
        if (parts.screen.mesh) parts.screen.mesh.visible = status !== 'offline';
    }

    // === 断路器手柄（合闸绿色上扬 / 分闸红色下压） ===
    if (parts.handle) {
        const closed = data.closed !== false;
        parts.handle.pivot.rotation.x = closed ? parts.handle.closedAngle : parts.handle.openAngle;
        const color = closed ? PALETTE.ok : PALETTE.danger;
        parts.handle.material.color.setHex(color);
        if (parts.handle.material.emissive) parts.handle.material.emissive.setHex(color);
    }

    // === 告警标记 ===
    if (group.userData.alarm) {
        group.userData.alarm.group.visible = alarm;
    }

    // === 离线暗化 ===
    setDeviceGhost(group, status === 'offline');
}

/**
 * 状态文本（用于屏幕副标题）。
 * @param {string} status 设备状态
 * @returns {string}
 */
function statusTextOf(status) {
    const map = {
        charging: 'CHARGING',
        discharging: 'DISCHARGING',
        idle: 'STANDBY',
        offline: 'OFFLINE',
        running: 'RUNNING'
    };
    return map[status] || 'STANDBY';
}

/**
 * 设置设备"离线暗化"效果（材质替换为半透明灰色，恢复时还原）。
 * @param {THREE.Object3D} group 设备对象组
 * @param {boolean} offline 是否离线
 */
export function setDeviceGhost(group, offline) {
    group.traverse((obj) => {
        if (!obj.isMesh || obj.isInstancedMesh) return;
        if (obj.userData.isPickTarget || obj.userData.drawnLine) return;
        if (offline) {
            if (!obj.userData.baseMaterial) {
                obj.userData.baseMaterial = obj.material;
                obj.material = MAT.offlineGhost;
            }
        } else if (obj.userData.baseMaterial) {
            obj.material = obj.userData.baseMaterial;
            delete obj.userData.baseMaterial;
        }
    });
    // 离线时隐藏名称标签之外的功能性贴图
    const parts = group.userData.parts || {};
    if (parts.screen && parts.screen.mesh) parts.screen.mesh.visible = !offline;
}

/**
 * 设备底部出线高度（世界单位）：电缆从设备基座侧面此高度引出。
 */
export const CABLE_EXIT_HEIGHT = 4;

/**
 * 计算设备底部出线点与引出方向（走线规范：连线统一从设备底部侧面出线、贴地敷设）。
 *  - 常规设备：从朝向对端的侧面中部出线（自动适配节点旋转）
 *  - 母线/直线类：沿轴线就近投影后，从面向对端的侧面出线
 * @param {THREE.Object3D} group 设备对象组
 * @param {THREE.Vector3} targetWorld 对端的世界坐标（决定从哪一侧出线）
 * @returns {{point: THREE.Vector3, dir: THREE.Vector3}} 出线点与水平引出方向（单位向量）
 */
export function resolveExitWorld(group, targetWorld) {
    const fp = group.userData.footprint || { width: 60, depth: 60 };
    const halfW = Math.max(4, fp.width / 2);
    const halfD = Math.max(4, fp.depth / 2);
    const margin = 6;
    group.updateMatrixWorld();
    const local = group.worldToLocal(targetWorld.clone());
    local.y = 0;

    let ex = 0;
    let ez = 0;
    let normal = null; // 本地坐标下的引出法线

    if (group.userData.isBusLike) {
        // 沿母线轴向就近取点，从面向对端的侧面出线
        ex = THREE.MathUtils.clamp(local.x, -halfW + 4, halfW - 4);
        ez = (local.z >= 0 ? 1 : -1) * (halfD + margin);
        normal = new THREE.Vector3(0, 0, local.z >= 0 ? 1 : -1);
    } else {
        // 比较对端方向到 X 侧面 / Z 侧面的距离，取更近的一侧出线
        const distX = halfW / Math.max(Math.abs(local.x), 1e-4);
        const distZ = halfD / Math.max(Math.abs(local.z), 1e-4);
        if (distX <= distZ) {
            ex = (local.x >= 0 ? 1 : -1) * (halfW + margin);
            ez = THREE.MathUtils.clamp(local.z, -halfD, halfD);
            normal = new THREE.Vector3(local.x >= 0 ? 1 : -1, 0, 0);
        } else {
            ez = (local.z >= 0 ? 1 : -1) * (halfD + margin);
            ex = THREE.MathUtils.clamp(local.x, -halfW, halfW);
            normal = new THREE.Vector3(0, 0, local.z >= 0 ? 1 : -1);
        }
    }

    const point = group.localToWorld(new THREE.Vector3(ex, CABLE_EXIT_HEIGHT, ez));
    const quaternion = new THREE.Quaternion();
    group.getWorldQuaternion(quaternion);
    const dir = normal.applyQuaternion(quaternion);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
    dir.normalize();
    return { point, dir };
}

/**
 * 计算设备接线端子在世界坐标中的位置（顶部锚点，兼容旧接口）。
 *  - 母线/直线类元素：把目标点投影到其轴线上（限幅在元素长度内），实现"沿母线就近接线"
 *  - 其他设备：使用固定的顶部端子锚点
 * @param {THREE.Object3D} group 设备对象组
 * @param {THREE.Vector3|null} targetWorld 对端的世界坐标（用于就近接线），可为空
 * @returns {THREE.Vector3} 世界坐标下的接线点
 */
export function resolveAnchorWorld(group, targetWorld) {
    const anchor = group.userData.anchor || new THREE.Vector3(0, 20, 0);
    group.updateMatrixWorld();
    if (group.userData.isBusLike && targetWorld) {
        // 目标点转换到设备本地坐标后，沿 X 轴（母线轴向）就地取点
        const local = group.worldToLocal(targetWorld.clone());
        const halfLength = (group.userData.footprint ? group.userData.footprint.width : 100) / 2;
        local.x = THREE.MathUtils.clamp(local.x, -halfLength + 4, halfLength - 4);
        local.y = anchor.y;
        local.z = 0;
        return group.localToWorld(local);
    }
    return group.localToWorld(anchor.clone());
}

/**
 * 释放设备模型资源。
 * @param {THREE.Object3D} group 设备对象组
 */
export function destroyDeviceModel(group) {
    const materials = group.userData.ownedMaterials || [];
    materials.forEach((mat) => {
        ['map', 'alphaMap', 'emissiveMap'].forEach((key) => {
            if (mat[key] && mat[key].isTexture) mat[key].dispose();
        });
        mat.dispose();
    });
    group.traverse((obj) => {
        if (obj.geometry && !(obj.geometry.userData && obj.geometry.userData.shared)) obj.geometry.dispose();
    });
}
