/**
 * SelectionHelper - 选择辅助器
 *
 * 职责：
 *  - 渲染"选中态可视化"：贴地高亮轮廓、半透明底衬
 *  - 提供缩放手柄（4 角球形手柄）与旋转手柄（设备上方球形手柄 + 竖直虚线杆）
 *  - 暴露可拾取手柄列表，供交互层优先命中（手柄优先于设备本体）
 *
 * 说明：手柄尺寸为世界尺寸（不随缩放变化），保证远近视距下均可稳定操作；
 * 手柄数组与轮廓几何体在每次 update 时重建（频次低，开销可忽略）。
 */
import * as THREE from 'three';
import { MAT, roundedPlaneGeo, roundedRectPoints, sphereGeo } from './materialLibrary.js';

/** 缩放手柄的四角标识 */
const RESIZE_HANDLES = [
    { key: 'resize-nw', sx: -1, sz: -1 },
    { key: 'resize-ne', sx: 1, sz: -1 },
    { key: 'resize-sw', sx: -1, sz: 1 },
    { key: 'resize-se', sx: 1, sz: 1 }
];

export default class SelectionHelper {
    /**
     * @param {Object} [options] 可选项
     * @param {boolean} [options.editable=true] 是否显示缩放/旋转手柄（查看模式为 false）
     */
    constructor(options = {}) {
        this.editable = options.editable !== false;
        this.group = new THREE.Group();
        this.group.name = 'selectionHelper';
        this.group.visible = false;
        /** 可拾取手柄对象列表 */
        this.pickables = [];

        // 贴地高亮底衬
        this.fill = new THREE.Mesh(roundedPlaneGeo(1, 1, 6), MAT.selectionFill);
        this.fill.rotation.x = -Math.PI / 2;
        this.fill.position.y = 0.6;
        this.fill.renderOrder = 1;
        this.group.add(this.fill);

        // 贴地轮廓线
        this._outlineGeometry = new THREE.BufferGeometry();
        this.outline = new THREE.LineLoop(this._outlineGeometry, MAT.selectionOutline);
        this.outline.position.y = 0.9;
        this.outline.renderOrder = 2;
        this.group.add(this.outline);

        // 旋转手柄（竖直虚线杆 + 顶部球）
        this.rotateStemGeometry = new THREE.BufferGeometry();
        this.rotateStem = new THREE.Line(this.rotateStemGeometry, MAT.selectionOutline);
        this.group.add(this.rotateStem);
        this.rotateHandle = new THREE.Mesh(sphereGeo(8.5, 12), MAT.handlePrimary);
        this.rotateHandle.userData.handle = 'rotate';
        this.group.add(this.rotateHandle);
        if (this.editable) this.pickables.push(this.rotateHandle);

        // 四角缩放手柄
        this.resizeHandles = RESIZE_HANDLES.map((config) => {
            const handle = new THREE.Mesh(sphereGeo(8.5, 12), MAT.handleSecondary);
            handle.userData.handle = config.key;
            this.group.add(handle);
            if (this.editable) this.pickables.push(handle);
            return handle;
        });
    }

    /**
     * 更新选中态尺寸与位置。
     * @param {Object|null} node 选中的节点数据
     * @param {number} [height=40] 设备模型高度（用于放置旋转手柄）
     */
    update(node, height = 40) {
        if (!node) {
            this.group.visible = false;
            return;
        }
        this.group.visible = true;
        const w = Math.max(8, node.width);
        const d = Math.max(8, node.height);

        // 底衬与轮廓随节点尺寸重建
        this.fill.scale.set(w, d, 1);
        const points = roundedRectPoints(w, d, Math.min(9, Math.min(w, d) / 5));
        this._outlineGeometry.dispose();
        this._outlineGeometry = new THREE.BufferGeometry().setFromPoints(
            points.map((p) => new THREE.Vector3(p.x, 0, p.y))
        );
        this.outline.geometry = this._outlineGeometry;

        // 四角手柄贴地
        if (this.editable) {
            this.resizeHandles.forEach((handle, index) => {
                const config = RESIZE_HANDLES[index];
                handle.position.set((config.sx * w) / 2, 1.5, (config.sz * d) / 2);
            });
            // 旋转手柄位于设备上方
            const stemTop = height + 26;
            this.rotateStemGeometry.dispose();
            this.rotateStemGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, height * 0.4, 0),
                new THREE.Vector3(0, stemTop, 0)
            ]);
            this.rotateStem.geometry = this.rotateStemGeometry;
            this.rotateHandle.position.set(0, stemTop, 0);
        }

        // 仅查看模式隐藏手柄
        this.resizeHandles.forEach((handle) => {
            handle.visible = this.editable;
        });
        this.rotateHandle.visible = this.editable;
        this.rotateStem.visible = this.editable;
    }

    /**
     * 更新选中器整体位置（世界坐标）。
     * @param {number} x 世界 X
     * @param {number} z 世界 Z
     */
    setPosition(x, z) {
        this.group.position.set(x, 0, z);
    }

    /**
     * 显示/隐藏（无选中对象时隐藏）。
     * @param {boolean} visible 是否可见
     */
    setVisible(visible) {
        this.group.visible = visible;
    }

    /** 释放资源 */
    dispose() {
        this._outlineGeometry.dispose();
        this.rotateStemGeometry.dispose();
        this.pickables.length = 0;
    }
}
