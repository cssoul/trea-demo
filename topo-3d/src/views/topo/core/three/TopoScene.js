/**
 * TopoScene - 立体拓扑画布（Three.js 渲染层门面）
 *
 * 职责：
 *  - 数据层：沿用第一版的节点 / 连线数据结构（node.x / node.y / width / height / rotate、
 *    link.source / link.target / style / data），保证旧 JSON 可直接加载
 *  - 渲染层：把节点同步为三维设备模型，把连线同步为立体电缆管道
 *  - 交互层：转发 PointerController 的拾取、拖拽、缩放、旋转、连线操作
 *  - 事件层：对外暴露与第一版一致的 on/off/emit 事件总线，Vue 侧几乎无需改动
 *  - 状态层：提供实时数据渲染接口（指示灯、SOC、液晶读数、断路器手柄、告警、离线）
 *
 * 坐标映射：拓扑平面 (x, y) -> 世界地面 (x, 0, z)，即世界 Y 轴恒为高度方向。
 * 设备对象组原点位于节点占地中心，因此 group.position = (x + w/2, 0, y + h/2)。
 */
import * as THREE from 'three';
import SceneManager, { disposeObject } from './SceneManager.js';
import FlowAnimator from './FlowAnimator.js';
import SelectionHelper from './SelectionHelper.js';
import { MAT } from './materialLibrary.js';
import { createBadgeSprite } from './textureFactory.js';
import {
    createDeviceModel,
    updateDeviceLabel,
    updateDeviceText,
    applyDeviceRuntimeState,
    destroyDeviceModel,
    resolveExitWorld
} from './DeviceFactory.js';
import { createCable, getCableRadius } from './CableFactory.js';
import { attachInteractions } from './interactions.js';
import {
    DEFAULT_LINK_STYLE,
    loadLinkStyleConfig,
    saveLinkStyleConfig,
    hexToInt
} from '../../config/linkStyleConfig.js';

/** 需要重建模型的节点类型（尺寸/样式变化时） */
const MODEL_KEY_FIELDS = ['type', 'width', 'height'];

/** 拖拽过程中的几何体精度（降低重建开销） */
const DRAG_QUALITY = 'low';
const IDLE_QUALITY = 'high';

export default class TopoScene {
    /**
     * @param {HTMLElement} container 画布容器
     * @param {Object} [options] 可选项
     * @param {'editor'|'viewer'} [options.mode='editor'] 模式
     * @param {number} [options.viewSize] 初始可视范围
     */
    constructor(container, options = {}) {
        this.container = container;
        this.mode = options.mode || 'editor';
        this.readonly = this.mode === 'viewer';

        // === 数据 ===
        this.nodes = [];
        this.links = [];
        /** 连线全局样式配置（粗细/默认色/充电色/放电色），编辑与预览共用 */
        this.linkStyleConfig = { ...DEFAULT_LINK_STYLE, ...loadLinkStyleConfig() };
        /** 数据中是否携带视角（决定加载后是否自适应取景） */
        this._hasSavedView = false;
        this.selectedNodeId = null;
        this.selectedLinkId = null;

        // === 连线模式 ===
        this.linkMode = false;
        this.linkSourceId = null;
        this.linkSourceAnchor = null;
        this.tempCable = null;

        // === 事件 ===
        this._listeners = {};

        // === 三维场景 ===
        this.scene3d = new SceneManager(container, { viewSize: options.viewSize });
        this.flowAnimator = new FlowAnimator();
        this.flowAnimator.attach(this.scene3d);

        // 设备/电缆映射
        this.deviceMap = new Map();
        this.cableMap = new Map();
        /** 射线拾取目标（每个设备一个包围盒，避免逐网格检测） */
        this.pickTargets = [];
        /** 处于告警状态的设备（用于呼吸动画，避免每帧遍历全部设备） */
        this._alarmedDevices = new Set();

        // 选择辅助器
        this.selectionHelper = new SelectionHelper({ editable: !this.readonly });
        this.scene3d.layers.overlay.add(this.selectionHelper.group);

        // 连线模式下的临时引导电缆
        this.tempCable = createCable({ noBase: true, radius: 3 });
        this.tempCable.group.visible = false;
        this.scene3d.layers.overlay.add(this.tempCable.group);

        // 交互控制
        this._disposed = false;
        this._disposeInteractions = attachInteractions(this);

        // 告警呼吸动画
        this.scene3d.addFrameCallback(({ elapsed }) => this._animateAlarms(elapsed));
        // 名称标签/数据徽章保持恒定屏幕尺寸（缩放变化时重算一次世界尺寸）
        this.scene3d.addFrameCallback(() => this._updateLabelScales());

        // 开发环境暴露实例，便于在控制台/自动化测试中检查三维场景状态
        if (import.meta.env && import.meta.env.DEV) {
            window.__topoScene = this;
        }
    }

    /**
     * 计算节点在屏幕上的坐标（用于自动化测试与调试定位）。
     * @param {string} nodeId 节点 id
     * @returns {{x: number, y: number}|null} 屏幕坐标（视口坐标系）
     */
    getNodeScreenPosition(nodeId) {
        const group = this.deviceMap.get(nodeId);
        if (!group) return null;
        const rect = this.container.getBoundingClientRect();
        const point = new THREE.Vector3(group.position.x, (group.userData.height || 40) * 0.5, group.position.z);
        point.project(this.scene3d.camera);
        return {
            x: rect.left + ((point.x + 1) / 2) * rect.width,
            y: rect.top + ((1 - point.y) / 2) * rect.height
        };
    }

    // ==================== 事件总线 ====================

    /**
     * 注册事件监听。
     * @param {string} event 事件名
     * @param {Function} callback 回调
     * @returns {TopoScene}
     */
    on(event, callback) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(callback);
        return this;
    }

    /**
     * 注销事件监听。
     * @param {string} event 事件名
     * @param {Function} callback 回调
     * @returns {TopoScene}
     */
    off(event, callback) {
        if (!this._listeners[event]) return this;
        this._listeners[event] = this._listeners[event].filter((fn) => fn !== callback);
        return this;
    }

    /**
     * 派发事件（单个监听器异常不影响其他监听器）。
     * @param {string} event 事件名
     * @param {*} payload 负载
     */
    emit(event, payload) {
        (this._listeners[event] || []).forEach((callback) => {
            try {
                callback(payload);
            } catch (error) {
                console.error(`[TopoScene] 事件 ${event} 监听器执行失败`, error);
            }
        });
    }

    // ==================== 数据加载与导出 ====================

    /**
     * 载入拓扑数据（兼容第一版 JSON）。
     * @param {{nodes: Array, links: Array}} data 拓扑数据
     */
    setData(data) {
        try {
            this.nodes = (data && data.nodes ? data.nodes : []).map((node) => ({ ...node }));
            this.links = (data && data.links ? data.links : []).map((link) => ({
                ...link,
                style: { ...(link.style || {}) },
                data: { ...(link.data || {}) }
            }));
            this.selectedNodeId = null;
            this.selectedLinkId = null;
            this._rebuildAll();
            this._refreshBounds();
            this._updateSelectionHelper();
            // 数据携带视角时优先恢复（编辑器保存的角度/缩放），否则由调用方自适应取景
            this._hasSavedView = !!(data && data.view);
            if (this._hasSavedView) {
                this.applyViewState(data.view);
            }
            this.emit('dataLoaded', { nodes: this.nodes.length, links: this.links.length, hasView: this._hasSavedView });
        } catch (error) {
            console.error('[TopoScene] 数据加载失败', error);
            this.emit('error', { message: '拓扑数据加载失败，请检查数据格式' });
        }
    }

    /**
     * 导出拓扑数据（深拷贝，结构同第一版，并额外携带当前视角）。
     * @returns {{nodes: Array, links: Array, view: Object}}
     */
    getData() {
        return {
            nodes: this.nodes.map((node) => this._cloneNode(node)),
            links: this.links.map((link) => ({
                ...link,
                style: { ...link.style },
                data: { ...link.data }
            })),
            // 视角随数据保存：编辑器调整的角度/缩放/中心点在预览与重新打开时保持一致
            view: this.getViewState()
        };
    }

    /**
     * 读取当前视角状态。
     * @returns {{azimuth: number, polar: number, viewSize: number, target: {x: number, z: number}}}
     */
    getViewState() {
        return {
            azimuth: Number(this.scene3d.azimuth.toFixed(2)),
            polar: Number(this.scene3d.polar.toFixed(2)),
            viewSize: Math.round(this.scene3d.viewSize),
            target: { x: Math.round(this.scene3d.target.x), z: Math.round(this.scene3d.target.z) }
        };
    }

    /**
     * 应用视角状态（数据中携带的角度/缩放/中心点）。
     * @param {Object} [view] 视角数据，缺省字段回退默认等轴测值
     */
    applyViewState(view) {
        if (!view) return;
        const cam = this.scene3d;
        cam.azimuth = Number(view.azimuth) || cam.view.azimuth;
        cam.polar = THREE.MathUtils.clamp(
            Number(view.polar) || cam.view.polar,
            cam.view.minPolar,
            cam.view.maxPolar
        );
        cam.viewSize = cam._clampViewSize(Number(view.viewSize) || cam.view.viewSize);
        if (view.target) {
            cam.target.x = Number(view.target.x) || 0;
            cam.target.z = Number(view.target.z) || 0;
        }
        cam._updateCameraPose();
        cam._applyProjection();
        cam._requestGroundUpdate();
        this._emitZoom();
    }

    /**
     * 深拷贝节点（避免外部修改污染画布数据）。
     * @param {Object} node 节点
     * @returns {Object}
     */
    _cloneNode(node) {
        return {
            ...node,
            style: { ...(node.style || {}) },
            data: { ...(node.data || {}), binding: node.data && node.data.binding ? { ...node.data.binding } : null }
        };
    }

    // ==================== 查询 ====================

    /**
     * 按 id 取节点。
     * @param {string} id 节点 id
     * @returns {Object|undefined}
     */
    getNode(id) {
        return this.nodes.find((node) => node.id === id);
    }

    /**
     * 按 id 取连线。
     * @param {string} id 连线 id
     * @returns {Object|undefined}
     */
    getLink(id) {
        return this.links.find((link) => link.id === id);
    }

    // ==================== 全量重建 ====================

    /** 依据当前数据重建全部设备与电缆 */
    _rebuildAll() {
        // 清理旧对象
        this.deviceMap.forEach((group) => this._destroyDevice(group));
        this.deviceMap.clear();
        this.cableMap.forEach((cable) => this._destroyCable(cable));
        this.cableMap.clear();
        this._alarmedDevices.clear();

        this.nodes.forEach((node) => this._syncDevice(node));
        this.links.forEach((link) => this._syncCable(link, IDLE_QUALITY));
    }

    /**
     * 计算节点对应的模型标识（尺寸/样式变化时用于判断是否需要重建模型）。
     * @param {Object} node 节点
     * @returns {string}
     */
    _modelKeyOf(node) {
        const style = node.style || {};
        const parts = MODEL_KEY_FIELDS.map((field) => Math.round(Number(node[field]) || 0));
        return [node.type, ...parts, style.stroke || '', style.fill || '', style.fontSize || ''].join('|');
    }

    /**
     * 同步单个节点到三维场景。
     * @param {Object} node 节点
     * @param {boolean} [force=false] 是否强制重建模型
     * @returns {THREE.Group} 设备对象组
     */
    _syncDevice(node, force = false) {
        const key = this._modelKeyOf(node);
        let group = this.deviceMap.get(node.id);
        if (group && (force || group.userData.modelKey !== key)) {
            this._destroyDevice(group);
            this.deviceMap.delete(node.id);
            group = null;
        }
        if (!group) {
            group = createDeviceModel(node);
            group.userData.modelKey = key;
            group.userData.labelText = node.text;
            group.userData.badgeText = null;
            this.scene3d.layers.devices.add(group);
            this.deviceMap.set(node.id, group);
            // 收集拾取包围盒（每个设备一个，射线检测开销恒定）
            group.children.forEach((child) => {
                if (child.userData.isPickTarget) this.pickTargets.push(child);
            });
            // 新设备需要重新计算标签世界尺寸
            this._labelViewSize = null;
        } else {
            group.userData.node = node;
            if (group.userData.labelText !== node.text) {
                group.userData.labelText = node.text;
                updateDeviceLabel(group, node.text);
            }
            if (node.type === 'text') updateDeviceText(group, node.text);
        }

        // 位置与朝向（拓扑坐标 -> 世界地面坐标）
        group.position.set(node.x + node.width / 2, 0, node.y + node.height / 2);
        group.rotation.y = -THREE.MathUtils.degToRad(Number(node.rotate) || 0);
        return group;
    }

    /**
     * 销毁设备模型并移出场景。
     * @param {THREE.Group} group 设备对象组
     */
    _destroyDevice(group) {
        this._alarmedDevices.delete(group);
        // 摘除拾取目标，避免射线检测命中已删除设备
        this.pickTargets = this.pickTargets.filter((mesh) => mesh.parent !== group);
        if (group.parent) group.parent.remove(group);
        destroyDeviceModel(group);
    }

    /**
     * 精准释放一条电缆的全部资源（几何体 + 私有基管材质 + 流光材质）。
     * @param {Object} cable 电缆对象
     */
    _destroyCable(cable) {
        this.flowAnimator.unregister(cable.flowMaterial);
        cable.flowMaterial.dispose();
        if (cable.baseMaterial) cable.baseMaterial.dispose();
        cable.group.traverse((obj) => {
            if (obj.geometry && !(obj.geometry.userData && obj.geometry.userData.shared)) obj.geometry.dispose();
        });
        if (cable.group.parent) cable.group.parent.remove(cable.group);
    }

    // ==================== 连线样式配置 ====================

    /**
     * 更新连线全局样式配置并立即应用到全部电缆。
     * @param {Object} patch 配置增量：{ strokeWidth, color, chargeColor, dischargeColor }
     * @param {Object} [options] 可选项
     * @param {boolean} [options.persist=true] 是否持久化到 localStorage
     */
    setLinkStyleConfig(patch, options = {}) {
        const persist = options.persist !== false;
        Object.assign(this.linkStyleConfig, patch);
        // 清理缓存并重建全部电缆（基管颜色/半径可能变化）
        this.links.forEach((link) => {
            const cable = this.cableMap.get(link.id);
            if (cable) {
                this._destroyCable(cable);
                this.cableMap.delete(link.id);
            }
        });
        this.links.forEach((link) => this._syncCable(link));
        // 刷新流光方向色（充电/放电色变化）
        this.emit('linkStyleChanged', { ...this.linkStyleConfig });
        if (persist) saveLinkStyleConfig(this.linkStyleConfig);
    }

    /**
     * 读取连线全局样式配置。
     * @returns {Object}
     */
    getLinkStyleConfig() {
        return { ...this.linkStyleConfig };
    }

    /**
     * 同步单条连线到三维场景。
     * @param {Object} link 连线数据
     * @param {'high'|'low'} [quality='high'] 几何体精度
     */
    _syncCable(link, quality = IDLE_QUALITY) {
        const sourceGroup = this.deviceMap.get(link.source);
        const targetGroup = this.deviceMap.get(link.target);
        if (!sourceGroup || !targetGroup) {
            // 端点设备缺失时先移除已有电缆，避免残留悬空管道
            const stale = this.cableMap.get(link.id);
            if (stale) {
                this._destroyCable(stale);
                this.cableMap.delete(link.id);
            }
            return;
        }

        const cfg = this.linkStyleConfig;
        let cable = this.cableMap.get(link.id);
        if (!cable) {
            cable = createCable({ radius: getCableRadius(link, cfg.strokeWidth) });
            cable.flowState = { active: false, direction: null, color: hexToInt(cfg.chargeColor, 0x00c853) };
            cable.group.userData.cableId = link.id;
            this.scene3d.layers.cables.add(cable.group);
            this.cableMap.set(link.id, cable);
            this.flowAnimator.register(cable.flowMaterial);
        } else if (Math.abs(cable.radius - getCableRadius(link, cfg.strokeWidth)) > 0.05) {
            // 线宽变化：重建电缆以应用新半径
            this._destroyCable(cable);
            this.cableMap.delete(link.id);
            this._syncCable(link, quality);
            return;
        }

        // 接线点：两端均取设备底部出线点（贴地直角走线，编辑/预览统一）
        // 先用近似方向求对端出线点，再基于对端精修本端（母线类元素就近接线）
        const startHint = resolveExitWorld(sourceGroup, targetGroup.position.clone());
        const endExit = resolveExitWorld(targetGroup, startHint.point);
        const startExit = resolveExitWorld(sourceGroup, endExit.point);
        cable.update(startExit.point, endExit.point, quality, link.type || 'auto', startExit.dir, endExit.dir);
        this._applyLinkBaseColor(link, cable);
        // 同步选中态高亮
        this._applyLinkVisual(link, cable);
    }

    /**
     * 应用连线基管颜色：连线显式设置 stroke 时优先，否则使用全局默认色。
     * 选中/通流/停运状态会替换材质，恢复时再切回私有基管材质。
     * @param {Object} link 连线数据
     * @param {Object} cable 电缆对象
     */
    _applyLinkBaseColor(link, cable) {
        const explicit = link.style && link.style.stroke;
        const hasExplicit = explicit && explicit !== '#666';
        const color = hasExplicit ? explicit : this.linkStyleConfig.color;
        // 基于共享材质克隆私有实例（随连线销毁），颜色变化时仅改 uniform 不重建
        if (!cable.baseMaterial) {
            cable.baseMaterial = MAT.cable.clone();
            cable.baseMaterial.userData.owned = true;
            cable._baseColorApplied = null;
        }
        if (cable._baseColorApplied !== color) {
            cable._baseColorApplied = color;
            cable.baseMaterial.color.set(color);
        }
    }

    /**
     * 应用连线的基础视觉（选中高亮 / 通流色调）。
     * @param {Object} link 连线数据
     * @param {Object} cable 电缆对象
     */
    _applyLinkVisual(link, cable) {
        const state = cable.flowState || {};
        if (link.id === this.selectedLinkId) {
            cable.baseMesh.material = MAT.cableCharging;
        } else if (state.off) {
            cable.baseMesh.material = MAT.cableOff;
        } else if (state.direction === 'forward') {
            cable.baseMesh.material = MAT.cableCharging;
        } else if (state.direction === 'backward') {
            cable.baseMesh.material = MAT.cableDischarging;
        } else {
            // 静默态：使用私有基管材质（承载全局默认色/显式 stroke 色）
            cable.baseMesh.material = cable.baseMaterial || MAT.cable;
        }
    }

    /**
     * 刷新所有与指定节点相连的连线。
     * @param {string} nodeId 节点 id
     * @param {'high'|'low'} quality 几何体精度
     */
    _refreshLinksOf(nodeId, quality = IDLE_QUALITY) {
        this.links.forEach((link) => {
            if (link.source === nodeId || link.target === nodeId) {
                this._syncCable(link, quality);
            }
        });
    }

    /**
     * 依据当前数据刷新沙盘底盘范围。
     * @param {boolean} [autoFit=false] 是否同时自适应取景
     */
    _refreshBounds(autoFit = false) {
        const bounds = this.getWorldBounds();
        // 记录内容范围：地面/网格会据此与当前视口求并集，保证底盘始终铺满画布
        this.scene3d.setContentBounds(bounds);
        if (autoFit) {
            this.fitView();
        }
    }

    /**
     * 计算当前数据的物理包围范围（世界坐标）。
     * @returns {{minX: number, minZ: number, maxX: number, maxZ: number}}
     */
    getWorldBounds() {
        if (!this.nodes.length) {
            return { minX: -600, minZ: -450, maxX: 600, maxZ: 450 };
        }
        let minX = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxZ = -Infinity;
        this.nodes.forEach((node) => {
            minX = Math.min(minX, node.x);
            minZ = Math.min(minZ, node.y);
            maxX = Math.max(maxX, node.x + node.width);
            maxZ = Math.max(maxZ, node.y + node.height);
        });
        return { minX, minZ, maxX, maxZ };
    }

    // ==================== 节点增删改 ====================

    /**
     * 新增节点。
     * @param {Object} node 节点数据
     * @returns {Object} 节点
     */
    addNode(node) {
        this.nodes.push(node);
        this._syncDevice(node);
        this._refreshBounds();
        this._selectNode(node.id);
        return node;
    }

    /**
     * 删除节点（同时删除其关联连线）。
     * @param {string} id 节点 id
     */
    removeNode(id) {
        this.nodes = this.nodes.filter((node) => node.id !== id);
        const related = this.links.filter((link) => link.source === id || link.target === id);
        related.forEach((link) => this._removeCable(link.id));
        this.links = this.links.filter((link) => link.source !== id && link.target !== id);
        const group = this.deviceMap.get(id);
        if (group) {
            this._destroyDevice(group);
            this.deviceMap.delete(id);
        }
        if (this.selectedNodeId === id) this.selectedNodeId = null;
        this._refreshBounds();
        this._updateSelectionHelper();
        this.emit('nodeRemoved', { id });
    }

    /**
     * 更新节点属性。
     * @param {string} id 节点 id
     * @param {Object} patch 变更字段
     */
    updateNode(id, patch) {
        const node = this.getNode(id);
        if (!node) return;
        Object.keys(patch).forEach((key) => {
            if (key === 'style' || key === 'data') {
                node[key] = { ...(node[key] || {}), ...patch[key] };
            } else {
                node[key] = patch[key];
            }
        });
        // 旋转角度归一化到 [0, 360)
        if (patch.rotate != null) {
            node.rotate = ((Number(patch.rotate) || 0) + 360) % 360;
        }
        this._syncDevice(node);
        this._refreshLinksOf(id);
        this._refreshBounds();
        this._updateSelectionHelper();
    }

    /** 移除一条连线（内部方法） */
    _removeCable(linkId) {
        const cable = this.cableMap.get(linkId);
        if (cable) {
            this._destroyCable(cable);
            this.cableMap.delete(linkId);
        }
        if (this.selectedLinkId === linkId) this.selectedLinkId = null;
    }

    // ==================== 连线增删改 ====================

    /**
     * 新增连线。
     * @param {Object} link 连线数据
     * @returns {Object} 连线
     */
    addLink(link) {
        this.links.push(link);
        this._syncCable(link);
        this.emit('linkAdded', { link });
        return link;
    }

    /**
     * 删除连线。
     * @param {string} id 连线 id
     */
    removeLink(id) {
        this._removeCable(id);
        this.links = this.links.filter((link) => link.id !== id);
        this._updateSelectionHelper();
        this.emit('linkRemoved', { id });
    }

    /**
     * 更新连线属性。
     * @param {string} linkId 连线 id
     * @param {Object} patch 变更字段
     */
    updateLink(linkId, patch) {
        const link = this.getLink(linkId);
        if (!link) return;
        Object.keys(patch).forEach((key) => {
            if (key === 'style' || key === 'data') {
                link[key] = { ...(link[key] || {}), ...patch[key] };
            } else {
                link[key] = patch[key];
            }
        });
        // 线宽变化需要重建管道半径
        if (patch.style && patch.style.strokeWidth != null) {
            const cable = this.cableMap.get(linkId);
            if (cable) {
                this._destroyCable(cable);
                this.cableMap.delete(linkId);
            }
        }
        this._syncCable(link);
        this._updateSelectionHelper();
    }

    // ==================== 选择 ====================

    /**
     * 选中节点。
     * @param {string} id 节点 id
     */
    _selectNode(id) {
        this.selectedNodeId = id;
        this.selectedLinkId = null;
        this._updateSelectionHelper();
        this.emit('select', { type: 'node', node: this.getNode(id) });
    }

    /**
     * 选中连线。
     * @param {string} id 连线 id
     */
    _selectLink(id) {
        this.selectedLinkId = id;
        this.selectedNodeId = null;
        this._updateSelectionHelper();
        this.emit('select', { type: 'link', link: this.getLink(id) });
    }

    /** 对外：选中节点 */
    selectNode(id) {
        this._selectNode(id);
    }

    /** 对外：选中连线 */
    selectLink(id) {
        this._selectLink(id);
    }

    /** 清除选中 */
    clearSelection() {
        this.selectedNodeId = null;
        this.selectedLinkId = null;
        this._updateSelectionHelper();
        this.emit('select', { type: 'none' });
    }

    /** 更新选择辅助器与连线高亮 */
    _updateSelectionHelper() {
        const node = this.selectedNodeId ? this.getNode(this.selectedNodeId) : null;
        const group = this.selectedNodeId ? this.deviceMap.get(this.selectedNodeId) : null;
        this.selectionHelper.update(node, group ? group.userData.height : 40);
        if (node && group) {
            this.selectionHelper.setPosition(group.position.x, group.position.z);
            // 选中框与设备同向旋转（手柄跟随节点朝向，符合第一版"整体旋转"的交互直觉）
            this.selectionHelper.group.rotation.y = group.rotation.y;
        }
        this.selectionHelper.setVisible(!!node);
        // 连线高亮刷新
        this.links.forEach((link) => {
            const cable = this.cableMap.get(link.id);
            if (cable) this._applyLinkVisual(link, cable);
        });
    }

    /**
     * 重绘（兼容第一版接口）。
     * 三维场景由深度缓冲自动处理遮挡关系，此处仅做一次幂等的设备/电缆同步，
     * 用于节点层级（zIndex）等属性变化后的刷新。
     */
    render() {
        this.nodes.forEach((node) => this._syncDevice(node));
        this.links.forEach((link) => this._syncCable(link));
        this._updateSelectionHelper();
    }

    // ==================== 相机 ====================

    /** 放大 */
    zoomIn() {
        this.scene3d.zoomBy(1.25);
        this._emitZoom();
    }

    /** 缩小 */
    zoomOut() {
        this.scene3d.zoomBy(0.8);
        this._emitZoom();
    }

    /** 重置视角与缩放 */
    resetZoom() {
        this.scene3d.resetView();
        this._emitZoom();
    }

    /**
     * 自适应取景。
     * @param {number} [padding=70] 边距（世界单位）
     */
    fitView(padding = 70) {
        const bounds = this.getWorldBounds();
        const size = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
        const paddingRatio = THREE.MathUtils.clamp(padding / Math.max(200, size), 0.04, 0.24);
        this.scene3d.fitBounds(bounds, { padding: paddingRatio, height: this._maxDeviceHeight() });
        this._emitZoom();
    }

    /**
     * 取当前场景内最大设备高度（用于取景时预留纵向空间）。
     * @returns {number}
     */
    _maxDeviceHeight() {
        let max = 80;
        this.deviceMap.forEach((group) => {
            max = Math.max(max, group.userData.height || 0);
        });
        return max;
    }

    /** 派发缩放事件（兼容第一版 transform.k 结构） */
    _emitZoom() {
        const ratio = this.scene3d.getZoomRatio();
        this.emit('zoom', { transform: { k: ratio }, ratio });
    }

    /**
     * 屏幕坐标 -> 拓扑平面坐标。
     * @param {number} clientX 屏幕 X
     * @param {number} clientY 屏幕 Y
     * @returns {{x: number, y: number}} 拓扑坐标（节点左上角语义下可直接使用）
     */
    clientToTopo(clientX, clientY) {
        const point = this.scene3d.screenToGround(clientX, clientY);
        if (!point) return { x: 0, y: 0 };
        return { x: point.x, y: point.z };
    }

    // ==================== 连线模式 ====================

    /**
     * 开启/关闭连线模式。
     * @param {boolean} enabled 是否开启
     */
    setLinkMode(enabled) {
        this.linkMode = enabled;
        this.linkSourceId = null;
        this.linkSourceAnchor = null;
        this.tempCable.group.visible = false;
        this.emit('linkModeChange', { enabled });
    }

    /**
     * 在连线模式下建立连线（点击源/目标设备）。
     * @param {Object} node 被点击的节点
     */
    _handleLinkNodeClick(node) {
        if (!this.linkSourceId) {
            this.linkSourceId = node.id;
            const group = this.deviceMap.get(node.id);
            // 引导线从设备底部出线（与正式连线走线规范一致）
            this.linkSourceAnchor = group
                ? resolveExitWorld(group, this.scene3d.target.clone()).point
                : new THREE.Vector3(0, 4, 0);
            this.emit('linkSourceChange', { nodeId: node.id });
            return;
        }
        if (node.id === this.linkSourceId) {
            // 重复点击同一节点视为取消
            this.linkSourceId = null;
            this.linkSourceAnchor = null;
            this.tempCable.group.visible = false;
            this.emit('linkSourceChange', { nodeId: null });
            return;
        }
        this._createLink(this.linkSourceId, node.id);
        this.linkSourceId = null;
        this.linkSourceAnchor = null;
        this.tempCable.group.visible = false;
        this.emit('linkSourceChange', { nodeId: null });
    }

    /**
     * 创建一条连线（去重）。
     * @param {string} sourceId 源节点
     * @param {string} targetId 目标节点
     */
    _createLink(sourceId, targetId) {
        const exists = this.links.find((link) => link.source === sourceId && link.target === targetId);
        if (exists) {
            this.emit('error', { message: '这两个节点之间已存在连线' });
            return;
        }
        // 默认 auto：由走线算法按两端相对位置自动选择最优样式
        const link = {
            id: `link_${Date.now()}${Math.floor(Math.random() * 1000)}`,
            source: sourceId,
            target: targetId,
            type: 'auto',
            style: { stroke: '#666', strokeWidth: this.linkStyleConfig.strokeWidth },
            data: {}
        };
        this.addLink(link);
    }

    /**
     * 更新连线模式下的临时引导管道。
     * @param {THREE.Vector3} groundPoint 鼠标在地面的投影点
     */
    updateTempCable(groundPoint) {
        if (!this.linkMode || !this.linkSourceAnchor) return;
        const end = groundPoint.clone();
        end.y = 4;
        this.tempCable.group.visible = true;
        // 引导线与正式连线统一：贴地走线（auto 自动选型）
        this.tempCable.update(this.linkSourceAnchor, end, DRAG_QUALITY, 'auto');
        this.flowAnimator.setFlow(this.tempCable.flowMaterial, {
            active: true,
            speed: 2.4,
            density: 2,
            opacity: 0.95,
            color: hexToInt(this.linkStyleConfig.chargeColor, 0x00c853)
        });
    }

    // ==================== 实时数据与状态渲染 ====================

    /**
     * 应用设备运行时数据（指示灯 / SOC / 屏幕 / 手柄 / 告警 / 离线暗化）。
     * @param {string} nodeId 节点 id
     * @param {Object} data 实时数据
     */
    applyDeviceData(nodeId, data) {
        const group = this.deviceMap.get(nodeId);
        if (!group || !data) return;
        applyDeviceRuntimeState(group, data);
        if (data.alarm) {
            this._alarmedDevices.add(group);
        } else {
            this._alarmedDevices.delete(group);
            if (group.userData.alarm) group.userData.alarm.group.visible = false;
        }
        if (data.power != null) {
            const status = data.status || 'idle';
            const color = status === 'charging' ? '#00b189' : status === 'discharging' ? '#e08a10' : '#8f99a6';
            this.setNodeBadge(nodeId, `${data.power > 0 ? '+' : ''}${Number(data.power).toFixed(1)}kW`, color);
        } else {
            this.setNodeBadge(nodeId, null);
        }
    }

    /**
     * 设置节点告警状态（兼容第一版接口）。
     * @param {string} nodeId 节点 id
     * @param {boolean} alarming 是否告警
     */
    setNodeAlarm(nodeId, alarming) {
        const group = this.deviceMap.get(nodeId);
        if (!group) return;
        if (group.userData.alarm) group.userData.alarm.group.visible = !!alarming;
        if (alarming) {
            this._alarmedDevices.add(group);
        } else {
            this._alarmedDevices.delete(group);
        }
    }

    /**
     * 设置电池节点 SOC 与充放电状态（兼容第一版接口）。
     * @param {string} nodeId 节点 id
     * @param {number} soc 0~1
     * @param {number} [charge=0] 1 充电 / -1 放电 / 0 静置
     */
    setNodeBattery(nodeId, soc, charge = 0) {
        const group = this.deviceMap.get(nodeId);
        if (!group) return;
        applyDeviceRuntimeState(group, {
            soc: (soc == null ? 0 : soc) * 100,
            status: charge === 1 ? 'charging' : charge === -1 ? 'discharging' : 'idle',
            alarm: this._alarmedDevices.has(group)
        });
    }

    /**
     * 设置节点数据徽章（如实时功率）。
     * @param {string} nodeId 节点 id
     * @param {string|null} text 文本，为空则隐藏
     * @param {string} [color] 颜色
     */
    setNodeBadge(nodeId, text, color) {
        const group = this.deviceMap.get(nodeId);
        if (!group) return;
        if (!text) {
            if (group.userData.badge) group.userData.badge.sprite.visible = false;
            group.userData.badgeText = null;
            return;
        }
        if (!group.userData.badge) {
            const height = group.userData.height || 40;
            const badge = createBadgeSprite({ worldHeight: Math.max(15, height * 0.17) });
            // 徽章悬浮在名称标签上方
            badge.sprite.position.set(0, height + Math.max(34, height * 0.42), 0);
            group.add(badge.sprite);
            group.userData.badge = badge;
        }
        if (group.userData.badgeText !== text || group.userData.badgeColor !== color) {
            group.userData.badgeText = text;
            group.userData.badgeColor = color;
            group.userData.badge.setText(text, color);
        }
    }

    /**
     * 设置设备运行状态（用于查看模式的整体状态渲染）。
     * @param {string} nodeId 节点 id
     * @param {string} status 状态：running / idle / offline / charging / discharging
     * @param {boolean} [alarm=false] 是否告警
     */
    setNodeStatus(nodeId, status, alarm = false) {
        const group = this.deviceMap.get(nodeId);
        if (!group) return;
        applyDeviceRuntimeState(group, { status, alarm });
        if (alarm) {
            this._alarmedDevices.add(group);
        } else {
            this._alarmedDevices.delete(group);
        }
    }

    /**
     * 设置节点屏幕读数（电表 / PCS 液晶屏）。
     * @param {string} nodeId 节点 id
     * @param {Object} payload 屏幕内容
     */
    setNodeScreen(nodeId, payload) {
        const group = this.deviceMap.get(nodeId);
        const part = group && group.userData.parts && group.userData.parts.screen;
        if (!part) return;
        part.draw(payload || {});
    }

    /**
     * 设置连线流光状态（兼容第一版接口）。
     * @param {string} linkId 连线 id
     * @param {'forward'|'backward'|null} direction 流动方向，null 表示停止
     * @param {string|number} [color] 流光颜色
     * @param {Object} [options] 附加项
     * @param {number} [options.speed=1] 流速倍率（映射实际功率大小）
     * @param {boolean} [options.off] 是否为"分闸/停运"状态（基管置灰）
     */
    setLinkFlow(linkId, direction, color, options = {}) {
        const cable = this.cableMap.get(linkId);
        const link = this.getLink(linkId);
        if (!cable || !link) return;
        // 流光颜色：外部显式指定优先，否则按方向读全局配置（充电绿/放电蓝）
        const cfg = this.linkStyleConfig;
        const fallbackFlow = direction === 'backward'
            ? hexToInt(cfg.dischargeColor, 0xffb020)
            : hexToInt(cfg.chargeColor, 0x00c853);
        cable.flowState = {
            active: !!direction && !options.off,
            direction,
            color: color != null ? color : fallbackFlow,
            off: !!options.off
        };
        this.flowAnimator.setFlow(cable.flowMaterial, {
            active: cable.flowState.active,
            speed: (direction === 'backward' ? -1 : 1) * (options.speed || 1),
            density: options.density || 3,
            opacity: options.opacity != null ? options.opacity : 0.9,
            color: cable.flowState.color
        });
        this._applyLinkVisual(link, cable);
    }

    /**
     * 设置连线停运状态（断路器分闸等）：流光停止、基管置灰。
     * @param {string} linkId 连线 id
     * @param {boolean} off 是否停运
     */
    setLinkOff(linkId, off) {
        const cable = this.cableMap.get(linkId);
        const link = this.getLink(linkId);
        if (!cable || !link) return;
        cable.flowState = {
            active: !off && cable.flowState ? cable.flowState.active : false,
            direction: cable.flowState ? cable.flowState.direction : null,
            color: cable.flowState ? cable.flowState.color : 0x00e0a4,
            off: !!off
        };
        this.flowAnimator.setFlow(cable.flowMaterial, { active: cable.flowState.active });
        this._applyLinkVisual(link, cable);
    }

    // ==================== 内部动画 ====================

    /**
     * 告警呼吸动画：告警标记上下浮动 + 高亮强度变化。
     * @param {number} elapsed 累计时间（秒）
     */
    _animateAlarms(elapsed) {
        if (!this._alarmedDevices.size) return;
        const pulse = (Math.sin(elapsed * 5) + 1) / 2;
        this._alarmedDevices.forEach((group) => {
            const alarm = group.userData.alarm;
            if (!alarm || !alarm.group.visible) return;
            alarm.group.position.y = alarm.baseY + pulse * 6;
            alarm.group.rotation.y = elapsed * 1.6;
            alarm.material.emissiveIntensity = 1 + pulse * 1.6;
        });
    }

    // ==================== 标签尺寸 ====================

    /**
     * 依据当前视距调整名称标签与数据徽章的世界尺寸，使其在屏幕上保持恒定大小，
     * 保证任何缩放级别下都可清晰阅读（仅在视距变化时重算一次）。
     * 尺寸基准：名称标签约 24px、数据徽章约 21px 屏幕高度。
     */
    _updateLabelScales() {
        const viewSize = this.scene3d.viewSize;
        if (this._labelViewSize === viewSize) return;
        this._labelViewSize = viewSize;
        const pixelHeight = Math.max(320, this.scene3d.container.clientHeight || 640);
        const worldPerPixel = viewSize / pixelHeight;
        const labelWorld = 24 * worldPerPixel;
        const badgeWorld = 21 * worldPerPixel;
        const gap = 28 * worldPerPixel;

        this.deviceMap.forEach((group) => {
            const height = group.userData.height || 40;
            const parts = group.userData.parts || {};
            if (parts.label) {
                const aspect = parts.label.sprite.userData.aspect || 4;
                parts.label.sprite.scale.set(labelWorld * aspect, labelWorld, 1);
                parts.label.sprite.position.y = height + gap + labelWorld * 0.5;
            }
            const badge = group.userData.badge;
            if (badge) {
                const aspect = badge.sprite.userData.aspect || 3.34;
                badge.sprite.scale.set(badgeWorld * aspect, badgeWorld, 1);
                badge.sprite.position.y = height + gap * 2 + labelWorld * 0.5;
            }
        });
    }

    // ==================== 销毁 ====================

    /** 销毁画布与全部三维资源 */
    destroy() {
        if (this._disposed) return;
        this._disposed = true;
        try {
            if (this._disposeInteractions) this._disposeInteractions();
        } catch (error) {
            console.error('[TopoScene] 解绑交互失败', error);
        }
        this.deviceMap.forEach((group) => destroyDeviceModel(group));
        this.deviceMap.clear();
        this.cableMap.forEach((cable) => cable.dispose());
        this.cableMap.clear();
        // 电缆子对象几何体
        disposeObject(this.scene3d.layers.overlay);
        this.tempCable.dispose();
        this.selectionHelper.dispose();
        this.flowAnimator.dispose();
        this.scene3d.dispose();
        this._listeners = {};
        this._alarmedDevices.clear();
    }
}
