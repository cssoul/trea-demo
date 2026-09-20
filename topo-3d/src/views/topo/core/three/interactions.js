/**
 * interactions - 三维画布交互控制器
 *
 * 职责（与第一版 D3 交互能力对齐，改用 Raycaster 实现）：
 *  - 设备拾取：优先命中缩放手柄 / 旋转手柄，其次设备本体，最后连线管道
 *  - 设备拖拽：在地面平面内平移，实时同步相连电缆
 *  - 设备缩放：四角球形手柄拖动改变 node.width / node.height（尊重 nodeConfig 的可缩放方向）
 *  - 设备旋转：拖动设备上方手柄改变 node.rotate（围绕设备中心）
 *  - 画布操作：左键空白平移、右键/中键环绕、滚轮以指针为锚点缩放
 *  - 连线模式：点击源设备 -> 拖动临时引导管道 -> 点击目标设备建立连线
 *  - 右键菜单、查看模式点击弹窗事件广播
 *
 * 说明：所有几何换算都在"拓扑平面坐标"下完成（x 向右、y 向下），
 * 由 SceneManager 负责与三维世界坐标的互相映射。
 */
import * as THREE from 'three';
import { NODE_TYPES } from '../../config/nodeConfig.js';

/** 判定为"点击"而非"拖动"的位移阈值（像素） */
const CLICK_THRESHOLD = 5;
/** 拖拽过程中重建模型的最小间隔（毫秒），避免过高频重建造成卡顿 */
const REBUILD_INTERVAL = 70;

class PointerController {
    /**
     * @param {import('./TopoScene.js').default} scene 立体拓扑画布
     */
    constructor(scene) {
        this.scene = scene;
        this.domElement = scene.scene3d.renderer.domElement;
        this.state = {
            mode: null,
            nodeId: null,
            cableId: null,
            handle: null,
            pointerId: null,
            startClientX: 0,
            startClientY: 0,
            lastClientX: 0,
            lastClientY: 0,
            startGround: null,
            startNode: null,
            startRotate: 0,
            startAngle: 0,
            moved: false,
            lastRebuild: 0,
            contextNodeId: null
        };
        this._hoverNodeId = null;
        this._lastHoverCheck = 0;
        this._bind();
    }

    /** 绑定 DOM 事件 */
    _bind() {
        this._onPointerDown = this.handlePointerDown.bind(this);
        this._onPointerMove = this.handlePointerMove.bind(this);
        this._onPointerUp = this.handlePointerUp.bind(this);
        this._onWheel = this.handleWheel.bind(this);
        this._onContextMenu = (event) => event.preventDefault();
        this._onPointerLeave = () => this._updateCursor();

        this.domElement.addEventListener('pointerdown', this._onPointerDown);
        this.domElement.addEventListener('pointermove', this._onPointerMove);
        this.domElement.addEventListener('pointerup', this._onPointerUp);
        this.domElement.addEventListener('pointercancel', this._onPointerUp);
        this.domElement.addEventListener('wheel', this._onWheel, { passive: false });
        this.domElement.addEventListener('contextmenu', this._onContextMenu);
        this.domElement.addEventListener('pointerleave', this._onPointerLeave);
        this._updateCursor();
    }

    /** 解绑 DOM 事件 */
    dispose() {
        this.domElement.removeEventListener('pointerdown', this._onPointerDown);
        this.domElement.removeEventListener('pointermove', this._onPointerMove);
        this.domElement.removeEventListener('pointerup', this._onPointerUp);
        this.domElement.removeEventListener('pointercancel', this._onPointerUp);
        this.domElement.removeEventListener('wheel', this._onWheel);
        this.domElement.removeEventListener('contextmenu', this._onContextMenu);
        this.domElement.removeEventListener('pointerleave', this._onPointerLeave);
    }

    // ==================== 拾取 ====================

    /**
     * 射线拾取手柄（缩放手柄 / 旋转手柄）。
     * @param {number} clientX 屏幕 X
     * @param {number} clientY 屏幕 Y
     * @returns {{object: THREE.Object3D, handle: string}|null}
     */
    _pickHandle(clientX, clientY) {
        const pickables = this.scene.selectionHelper.pickables;
        if (!pickables.length) return null;
        const raycaster = this.scene.scene3d.getRaycaster(clientX, clientY);
        const hits = raycaster.intersectObjects(pickables, false);
        if (!hits.length) return null;
        return { object: hits[0].object, handle: hits[0].object.userData.handle };
    }

    /**
     * 射线拾取设备。
     * @param {number} clientX 屏幕 X
     * @param {number} clientY 屏幕 Y
     * @returns {THREE.Group|null}
     */
    _pickDevice(clientX, clientY) {
        const targets = this.scene.pickTargets;
        if (!targets || !targets.length) return null;
        const raycaster = this.scene.scene3d.getRaycaster(clientX, clientY);
        const hits = raycaster.intersectObjects(targets, false);
        if (!hits.length) return null;
        let object = hits[0].object;
        while (object && !object.userData.nodeId) {
            object = object.parent;
        }
        return object && object.userData.nodeId ? object : null;
    }

    /**
     * 射线拾取连线（仅在未命中设备时调用）。
     * @param {number} clientX 屏幕 X
     * @param {number} clientY 屏幕 Y
     * @returns {string|null} 连线 id
     */
    _pickCable(clientX, clientY) {
        const layer = this.scene.scene3d.layers.cables;
        if (!layer.children.length) return null;
        const raycaster = this.scene.scene3d.getRaycaster(clientX, clientY);
        const hits = raycaster.intersectObjects(layer.children, true);
        if (!hits.length) return null;
        // 命中管道后回溯到电缆组，再从 cableMap 反查连线 id
        let object = hits[0].object;
        while (object && !object.userData.cableId) {
            object = object.parent;
        }
        if (!object) return null;
        return object.userData.cableId || null;
    }

    // ==================== 指针事件 ====================

    /**
     * 指针按下：决定交互模式并初始化拖拽上下文。
     * @param {PointerEvent} event 事件
     */
    handlePointerDown(event) {
        const scene = this.scene;
        // 整体视角旋转：右键 / 中键 / Alt+左键 / Shift+左键（优先于设备拾取）
        if (event.button === 1 || (event.button === 0 && (event.altKey || event.shiftKey))) {
            this._begin('orbit', event);
            return;
        }
        if (event.button === 2) {
            // 右键：按下即进入环绕（支持从设备上直接拖拽旋转），点按（未拖动）弹出右键菜单
            const group = this._pickDevice(event.clientX, event.clientY);
            this._begin('orbit', event);
            this.state.contextNodeId = group ? group.userData.nodeId : null;
            return;
        }
        if (event.button !== 0) return;

        // 1) 手柄优先
        const handleHit = scene.readonly ? null : this._pickHandle(event.clientX, event.clientY);
        if (handleHit) {
            const node = scene.getNode(scene.selectedNodeId);
            if (node) {
                if (handleHit.handle === 'rotate') {
                    this._begin('rotate', event, node.id);
                } else {
                    this._begin('resize', event, node.id, handleHit.handle);
                }
                return;
            }
        }

        // 2) 设备本体
        const group = this._pickDevice(event.clientX, event.clientY);
        if (group) {
            this._begin(scene.linkMode ? 'link' : 'node', event, group.userData.nodeId);
            return;
        }

        // 3) 连线（仅编辑模式需要选中，查看模式也可选中查看）
        const cableId = this._pickCable(event.clientX, event.clientY);
        if (cableId && !scene.linkMode) {
            this._begin('cable', event, cableId);
            return;
        }

        // 4) 空白：平移画布
        this._begin('pan', event);
    }

    /**
     * 开始一次交互。
     * @param {string} mode 模式
     * @param {PointerEvent} event 事件
     * @param {string} [id] 目标 id
     * @param {string} [handle] 手柄标识
     */
    _begin(mode, event, id, handle) {
        const state = this.state;
        state.mode = mode;
        state.nodeId = mode === 'cable' ? null : id;
        state.cableId = mode === 'cable' ? id : null;
        state.handle = handle || null;
        state.pointerId = event.pointerId;
        state.startClientX = event.clientX;
        state.startClientY = event.clientY;
        state.lastClientX = event.clientX;
        state.lastClientY = event.clientY;
        state.moved = false;
        state.lastRebuild = 0;
        state.startGround = this.scene.scene3d.screenToGround(event.clientX, event.clientY);
        const node = state.nodeId ? this.scene.getNode(state.nodeId) : null;
        state.startNode = node ? { x: node.x, y: node.y, width: node.width, height: node.height, rotate: node.rotate || 0 } : null;
        if (mode === 'rotate' && node && state.startGround) {
            const group = this.scene.deviceMap.get(node.id);
            state.startAngle = this._angleToGroup(group, state.startGround);
            state.startRotate = Number(node.rotate) || 0;
        }
        if (mode === 'link') {
            this.scene._handleLinkNodeClick(node);
        }
        try {
            this.domElement.setPointerCapture(event.pointerId);
        } catch (error) {
            // 部分浏览器在指针已释放时会抛错，忽略即可
        }
        this._updateCursor();
        event.preventDefault();
    }

    /**
     * 计算地面点相对设备中心的方向角（度）。
     * @param {THREE.Group} group 设备对象组
     * @param {THREE.Vector3} groundPoint 地面点
     * @returns {number} 角度（度）
     */
    _angleToGroup(group, groundPoint) {
        const cx = group ? group.position.x : 0;
        const cz = group ? group.position.z : 0;
        return (Math.atan2(groundPoint.z - cz, groundPoint.x - cx) * 180) / Math.PI;
    }

    /**
     * 指针移动：按模式分发。
     * @param {PointerEvent} event 事件
     */
    handlePointerMove(event) {
        const state = this.state;
        // 连线模式下（无论是否处于拖拽流程），临时引导管道始终跟随指针
        if (this.scene.linkMode && this.scene.linkSourceId) {
            this._updateTempCable(event);
        }
        if (!state.mode) {
            this._updateHover(event);
            return;
        }
        const dx = event.clientX - state.lastClientX;
        const dy = event.clientY - state.lastClientY;
        state.lastClientX = event.clientX;
        state.lastClientY = event.clientY;
        if (Math.abs(event.clientX - state.startClientX) > CLICK_THRESHOLD || Math.abs(event.clientY - state.startClientY) > CLICK_THRESHOLD) {
            state.moved = true;
        }

        switch (state.mode) {
            case 'pan':
                this.scene.scene3d.panByScreen(dx, dy);
                this.scene._emitZoom();
                break;
            case 'orbit':
                this.scene.scene3d.orbitBy(dx, dy);
                break;
            case 'node':
                this._dragNode(event);
                break;
            case 'resize':
                this._resizeNode(event);
                break;
            case 'rotate':
                this._rotateNode(event);
                break;
            case 'link':
                this._updateTempCable(event);
                break;
            default:
                break;
        }
    }

    /**
     * 指针抬起：结束交互并触发点击语义。
     * @param {PointerEvent} event 事件
     */
    handlePointerUp(event) {
        const state = this.state;
        const mode = state.mode;
        if (!mode) return;
        const isClick = !state.moved;
        const node = state.nodeId ? this.scene.getNode(state.nodeId) : null;

        try {
            this.domElement.releasePointerCapture(event.pointerId);
        } catch (error) {
            // 忽略释放异常
        }

        switch (mode) {
            case 'node':
                if (isClick) {
                    this._handleNodeClick(node, event);
                } else if (node) {
                    this._rebuildDevice(node, true);
                    this.scene._refreshLinksOf(node.id);
                    this.scene._refreshBounds();
                    this.scene.emit('nodeDragEnd', { node, start: state.startNode });
                }
                break;
            case 'resize':
                if (node) {
                    this._rebuildDevice(node, true);
                    this.scene._refreshLinksOf(node.id);
                    this.scene._refreshBounds();
                    this.scene.emit('nodeResizeEnd', { node, start: state.startNode });
                }
                break;
            case 'rotate':
                if (node) {
                    this.scene.emit('nodeRotateEnd', { node });
                }
                break;
            case 'orbit':
                // 右键点按（未拖动）在设备上 -> 打开右键菜单
                if (isClick && state.contextNodeId) {
                    const ctxNode = this.scene.getNode(state.contextNodeId);
                    if (ctxNode) {
                        this.scene._selectNode(ctxNode.id);
                        this.scene.emit('contextmenu', {
                            event,
                            node: ctxNode,
                            x: event.clientX,
                            y: event.clientY
                        });
                    }
                }
                break;
            case 'cable':
                if (isClick && state.cableId) {
                    this.scene._selectLink(state.cableId);
                }
                break;
            case 'pan':
                if (isClick && !this.scene.readonly) {
                    if (this.scene.linkMode && this.scene.linkSourceId) {
                        // 空白处点击：取消待连接的源设备
                        this.scene.linkSourceId = null;
                        this.scene.linkSourceAnchor = null;
                        this.scene.tempCable.group.visible = false;
                        this.scene.emit('linkSourceChange', { nodeId: null });
                    } else {
                        this.scene.clearSelection();
                    }
                }
                break;
            default:
                break;
        }

        state.mode = null;
        state.nodeId = null;
        state.cableId = null;
        state.handle = null;
        state.contextNodeId = null;
        state.moved = false;
        this._updateCursor();
    }

    /**
     * 处理设备点击语义（选中 / 连线 / 查看弹窗）。
     * @param {Object|null} node 节点
     * @param {PointerEvent} event 事件
     */
    _handleNodeClick(node, event) {
        if (!node) return;
        const scene = this.scene;
        if (scene.linkMode) return; // 连线模式在按下时已处理
        if (scene.readonly) {
            scene.emit('nodeClick', { node, event });
            scene._selectNode(node.id);
            return;
        }
        scene._selectNode(node.id);
    }

    /**
     * 拖拽设备（地面平面内平移）。
     * @param {PointerEvent} event 事件
     */
    _dragNode(event) {
        const state = this.state;
        const node = this.scene.getNode(state.nodeId);
        if (!node || !state.startGround) return;
        const ground = this.scene.scene3d.screenToGround(event.clientX, event.clientY);
        if (!ground) return;
        const dx = ground.x - state.startGround.x;
        const dz = ground.z - state.startGround.z;
        node.x = state.startNode.x + dx;
        node.y = state.startNode.y + dz;

        const group = this.scene.deviceMap.get(node.id);
        if (group) {
            group.position.set(node.x + node.width / 2, 0, node.y + node.height / 2);
        }
        this.scene._updateSelectionHelper();
        // 拖拽过程中使用低精度几何体，降低重建开销
        this.scene._refreshLinksOf(node.id, 'low');
        this.scene.emit('nodeDrag', { node });
        this.scene.emit('nodeDragMove', { node });
    }

    /**
     * 缩放设备（四角手柄，尊重 nodeConfig 的可缩放方向）。
     * @param {PointerEvent} event 事件
     */
    _resizeNode(event) {
        const state = this.state;
        const node = this.scene.getNode(state.nodeId);
        if (!node || !state.startGround || !state.handle) return;
        const ground = this.scene.scene3d.screenToGround(event.clientX, event.clientY);
        if (!ground) return;
        const config = NODE_TYPES[node.type] || {};
        const resizable = config.resizable || 'both';
        const dx = ground.x - state.startGround.x;
        const dz = ground.z - state.startGround.z;
        const start = state.startNode;
        const signX = state.handle.endsWith('e') ? 1 : -1;
        const signZ = state.handle.endsWith('s') ? 1 : -1;
        const MIN = 20;

        let width = start.width;
        let height = start.height;
        let x = start.x;
        let y = start.y;
        if (resizable !== 'vertical') {
            width = Math.max(MIN, start.width + signX * dx);
            if (signX < 0) x = start.x + (start.width - width);
        }
        if (resizable !== 'horizontal') {
            height = Math.max(MIN, start.height + signZ * dz);
            if (signZ < 0) y = start.y + (start.height - height);
        }

        node.width = width;
        node.height = height;
        node.x = x;
        node.y = y;
        const group = this.scene.deviceMap.get(node.id);
        if (group) {
            group.position.set(node.x + node.width / 2, 0, node.y + node.height / 2);
        }
        this.scene._updateSelectionHelper();
        this.scene.emit('nodeResize', { node });

        // 限频重建模型，避免每个像素都重建几何体
        const now = performance.now();
        if (now - state.lastRebuild > REBUILD_INTERVAL) {
            state.lastRebuild = now;
            this._rebuildDevice(node, true);
            this.scene._refreshLinksOf(node.id, 'low');
        }
    }

    /**
     * 旋转设备（围绕设备中心）。
     * @param {PointerEvent} event 事件
     */
    _rotateNode(event) {
        const state = this.state;
        const node = this.scene.getNode(state.nodeId);
        const group = this.scene.deviceMap.get(node ? node.id : null);
        if (!node || !group) return;
        const ground = this.scene.scene3d.screenToGround(event.clientX, event.clientY);
        if (!ground) return;
        const angle = this._angleToGroup(group, ground);
        let delta = angle - state.startAngle;
        // 归一化到 [-180, 180]，保证旋转方向连续
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        node.rotate = ((state.startRotate + delta) % 360 + 360) % 360;
        group.rotation.y = -THREE.MathUtils.degToRad(node.rotate);
        this.scene._updateSelectionHelper();
        this.scene.emit('nodeRotate', { node });
    }

    /**
     * 更新连线模式下的临时引导管道。
     * @param {PointerEvent} event 事件
     */
    _updateTempCable(event) {
        if (!this.scene.linkSourceId) return;
        const ground = this.scene.scene3d.screenToGround(event.clientX, event.clientY);
        if (ground) this.scene.updateTempCable(ground);
    }

    /**
     * 重建指定节点的设备模型（尺寸变化后调用）。
     * @param {Object} node 节点
     * @param {boolean} [syncLinks=true] 是否同步相连连线
     */
    _rebuildDevice(node, syncLinks = true) {
        const group = this.scene.deviceMap.get(node.id);
        if (group) {
            group.userData.modelKey = null; // 强制重建
        }
        const newGroup = this.scene._syncDevice(node, true);
        if (newGroup && node.rotate) {
            newGroup.rotation.y = -THREE.MathUtils.degToRad(node.rotate);
        }
        if (syncLinks) this.scene._refreshLinksOf(node.id);
    }

    /**
     * 悬停检测：更新鼠标指针样式（限频执行，避免频繁射线检测）。
     * @param {PointerEvent} event 事件
     */
    _updateHover(event) {
        const now = performance.now();
        if (now - this._lastHoverCheck < 60) return;
        this._lastHoverCheck = now;
        const scene = this.scene;
        let hoverId = null;
        const handleHit = scene.readonly ? null : this._pickHandle(event.clientX, event.clientY);
        if (handleHit) {
            hoverId = handleHit.handle === 'rotate' ? '__rotate' : '__resize';
        } else {
            const group = this._pickDevice(event.clientX, event.clientY);
            hoverId = group ? group.userData.nodeId : null;
        }
        if (hoverId !== this._hoverNodeId) {
            this._hoverNodeId = hoverId;
            this._updateCursor();
        }
    }

    /** 依据当前状态更新鼠标指针样式 */
    _updateCursor() {
        const state = this.state;
        const scene = this.scene;
        let cursor = scene.readonly ? 'grab' : 'default';
        if (scene.linkMode) cursor = 'crosshair';
        if (state.mode === 'pan') cursor = 'grabbing';
        else if (state.mode === 'orbit') cursor = 'grabbing';
        else if (state.mode === 'node') cursor = 'move';
        else if (this._hoverNodeId === '__resize') cursor = 'move';
        else if (this._hoverNodeId === '__rotate') cursor = 'grabbing';
        else if (this._hoverNodeId) cursor = scene.readonly ? 'pointer' : 'move';
        this.domElement.style.cursor = cursor;
    }

    /**
     * 滚轮缩放（以指针位置为锚点）。
     * @param {WheelEvent} event 事件
     */
    handleWheel(event) {
        event.preventDefault();
        const factor = Math.exp(-event.deltaY * 0.0014);
        this.scene.scene3d.zoomAtScreenPoint(factor, event.clientX, event.clientY);
        this.scene._emitZoom();
    }
}

/**
 * 为立体拓扑画布挂载交互控制器。
 * @param {import('./TopoScene.js').default} scene 立体拓扑画布
 * @returns {Function} 解绑函数
 */
export function attachInteractions(scene) {
    const controller = new PointerController(scene);
    return () => controller.dispose();
}
