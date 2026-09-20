/**
 * ModelBuilder - 设备模型拼装构建器
 *
 * 职责：
 *  - 封装"底面贴合地面（y=0）"的常用几何体摆放操作，简化各设备模型的拼装代码
 *  - 统一开启阴影开关，避免逐处重复设置
 *  - 提供 InstancedMesh 快捷构建，用于复用重复部件（光伏板、电池模组、散热片、格栅）
 *  - 收集可动画部件引用（屏幕、SOC 电量条、指示灯、断路器手柄）与私有材质，
 *    交由上层在实时数据刷新与设备销毁时使用
 *
 * 坐标约定：所有摆放以"组件底面 y 值 + 水平中心 (x, z)"描述，符合设备层层堆叠的直觉。
 */
import * as THREE from 'three';
import { MAT, boxGeo, cylinderGeo, coneGeo, sphereGeo, torusGeo, planeGeo, cloneMaterial } from './materialLibrary.js';
import { createScreenTexture } from './textureFactory.js';

/** 单位向上向量（用于 beam 对齐） */
const UP = new THREE.Vector3(0, 1, 0);

export default class ModelBuilder {
    /**
     * @param {Object} node 拓扑节点数据
     */
    constructor(node) {
        this.node = node;
        this.group = new THREE.Group();
        this.group.name = `device_${node.id}`;
        /** 可动画部件引用表 */
        this.parts = {};
        /** 私有材质（随设备销毁） */
        this.ownedMaterials = [];
        /** 复用同一实例矩阵的临时对象 */
        this._dummy = new THREE.Object3D();
    }

    /**
     * 添加盒体（y 为底面高度）。
     * @param {THREE.Material} material 材质
     * @param {Object} opt 参数
     * @param {number} opt.w 宽（X）
     * @param {number} opt.h 高（Y）
     * @param {number} opt.d 深（Z）
     * @param {number} [opt.x=0] 水平中心 X
     * @param {number} [opt.y=0] 底面高度 Y
     * @param {number} [opt.z=0] 水平中心 Z
     * @param {number} [opt.rx=0] 绕 X 旋转（弧度）
     * @param {number} [opt.ry=0] 绕 Y 旋转（弧度）
     * @param {number} [opt.rz=0] 绕 Z 旋转（弧度）
     * @returns {THREE.Mesh}
     */
    box(material, opt) {
        const mesh = new THREE.Mesh(boxGeo(opt.w, opt.h, opt.d), material);
        mesh.position.set(opt.x || 0, (opt.y || 0) + opt.h / 2, opt.z || 0);
        if (opt.rx) mesh.rotation.x = opt.rx;
        if (opt.ry) mesh.rotation.y = opt.ry;
        if (opt.rz) mesh.rotation.z = opt.rz;
        return this.add(mesh);
    }

    /**
     * 添加以几何中心定位的盒体（适用于需要按中心摆放的部件）。
     * @param {THREE.Material} material 材质
     * @param {Object} opt 参数，w/h/d 同 box，cy 为几何中心高度
     * @returns {THREE.Mesh}
     */
    boxCentered(material, opt) {
        return this.box(material, { ...opt, y: (opt.cy || 0) - opt.h / 2 });
    }

    /**
     * 添加圆柱（y 为底面高度）。
     * @param {THREE.Material} material 材质
     * @param {Object} opt 参数
     * @param {number} opt.r 半径（或 rt/rb 分别指定上下半径）
     * @param {number} opt.h 高
     * @param {number} [opt.segments=12] 分段
     * @returns {THREE.Mesh}
     */
    cylinder(material, opt) {
        const rTop = opt.rt != null ? opt.rt : opt.r;
        const rBottom = opt.rb != null ? opt.rb : opt.r;
        const mesh = new THREE.Mesh(cylinderGeo(rTop, rBottom, opt.h, opt.segments || 12), material);
        mesh.position.set(opt.x || 0, (opt.y || 0) + opt.h / 2, opt.z || 0);
        if (opt.rx) mesh.rotation.x = opt.rx;
        if (opt.ry) mesh.rotation.y = opt.ry;
        if (opt.rz) mesh.rotation.z = opt.rz;
        return this.add(mesh);
    }

    /**
     * 添加圆锥（高压套管伞裙、塔尖）。
     * @param {THREE.Material} material 材质
     * @param {Object} opt 参数，r/h/y/x/z
     * @returns {THREE.Mesh}
     */
    cone(material, opt) {
        const mesh = new THREE.Mesh(coneGeo(opt.r, opt.h, opt.segments || 12), material);
        mesh.position.set(opt.x || 0, (opt.y || 0) + opt.h / 2, opt.z || 0);
        if (opt.rx) mesh.rotation.x = opt.rx;
        if (opt.rz) mesh.rotation.z = opt.rz;
        return this.add(mesh);
    }

    /**
     * 添加球体（指示灯、手柄、关节）。
     * @param {THREE.Material} material 材质
     * @param {Object} opt 参数，r/cy/x/z
     * @returns {THREE.Mesh}
     */
    sphere(material, opt) {
        const mesh = new THREE.Mesh(sphereGeo(opt.r, opt.segments || 10), material);
        mesh.position.set(opt.x || 0, opt.cy || 0, opt.z || 0);
        return this.add(mesh);
    }

    /**
     * 添加圆环（风机、装饰圈）。
     * @param {THREE.Material} material 材质
     * @param {Object} opt 参数，r/tube/cy/x/z/rx/ry
     * @returns {THREE.Mesh}
     */
    torus(material, opt) {
        const mesh = new THREE.Mesh(torusGeo(opt.r, opt.tube, opt.segments || 14), material);
        mesh.position.set(opt.x || 0, opt.cy || 0, opt.z || 0);
        if (opt.rx) mesh.rotation.x = opt.rx;
        if (opt.ry) mesh.rotation.y = opt.ry;
        return this.add(mesh);
    }

    /**
     * 添加平面（屏幕、地面文字）。
     * @param {THREE.Material} material 材质
     * @param {Object} opt 参数，w/h/x/y/z/rx/ry
     * @returns {THREE.Mesh}
     */
    plane(material, opt) {
        const mesh = new THREE.Mesh(planeGeo(opt.w, opt.h), material);
        mesh.position.set(opt.x || 0, opt.y || 0, opt.z || 0);
        if (opt.rx) mesh.rotation.x = opt.rx;
        if (opt.ry) mesh.rotation.y = opt.ry;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        return this.add(mesh);
    }

    /**
     * 在两点之间添加一根梁（铁塔斜撑、支架、充电枪线缆支架）。
     * @param {THREE.Material} material 材质
     * @param {number[]} from 起点 [x, y, z]
     * @param {number[]} to 终点 [x, y, z]
     * @param {number} thickness 截面尺寸
     * @param {number} [depth] 截面深度（默认等于 thickness）
     * @returns {THREE.Mesh|null}
     */
    beam(material, from, to, thickness, depth) {
        const start = new THREE.Vector3(from[0], from[1], from[2]);
        const end = new THREE.Vector3(to[0], to[1], to[2]);
        const dir = new THREE.Vector3().subVectors(end, start);
        const length = dir.length();
        if (length < 0.0001) return null;
        const mesh = new THREE.Mesh(boxGeo(thickness, length, depth == null ? thickness : depth), material);
        mesh.position.copy(start).addScaledVector(dir, 0.5);
        mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
        return this.add(mesh);
    }

    /**
     * 构建实例化网格（复用同一几何体渲染大量重复部件）。
     * @param {THREE.BufferGeometry} geometry 共享几何体
     * @param {THREE.Material} material 材质
     * @param {number} count 实例数量
     * @param {Function} place 摆放回调 (dummy: THREE.Object3D, index: number) => void
     * @returns {THREE.InstancedMesh}
     */
    instanced(geometry, material, count, place) {
        const mesh = new THREE.InstancedMesh(geometry, material, count);
        for (let i = 0; i < count; i += 1) {
            this._dummy.position.set(0, 0, 0);
            this._dummy.rotation.set(0, 0, 0);
            this._dummy.scale.set(1, 1, 1);
            place(this._dummy, i);
            this._dummy.updateMatrix();
            mesh.setMatrixAt(i, this._dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.group.add(mesh);
        return mesh;
    }

    /**
     * 添加散热/通风格栅（竖直栅条，实例化渲染）。
     * @param {Object} opt 参数
     * @param {number} opt.w 格栅总宽
     * @param {number} opt.h 格栅总高
     * @param {number} opt.y 底面高度
     * @param {number} opt.z 所在平面 Z
     * @param {number} [opt.count=6] 栅条数量
     * @param {boolean} [opt.horizontal=false] 是否为横向栅条
     * @returns {THREE.InstancedMesh}
     */
    grille(opt) {
        const count = opt.count || 6;
        const thickness = 1.6;
        const gap = opt.horizontal ? opt.h / count : opt.w / count;
        const barGeo = opt.horizontal ? boxGeo(opt.w, thickness, 1.6) : boxGeo(thickness, opt.h, 1.6);
        return this.instanced(barGeo, MAT.grille, count, (dummy, i) => {
            if (opt.horizontal) {
                dummy.position.set(opt.x || 0, opt.y + gap * (i + 0.5), opt.z);
            } else {
                dummy.position.set((opt.x || 0) - opt.w / 2 + gap * (i + 0.5), opt.y + opt.h / 2, opt.z);
            }
        });
    }

    /**
     * 添加带 CanvasTexture 的液晶屏，并注册到 parts.screen 供实时刷新。
     * @param {Object} opt 参数
     * @param {number} opt.w 屏宽
     * @param {number} opt.h 屏高
     * @param {number} opt.cy 屏中心高度
     * @param {number} opt.z 屏所在 Z（正面法线朝 +Z）
     * @param {number} [opt.x=0] 屏中心 X
     * @param {Object} [opt.screen] createScreenTexture 的初始参数
     * @param {boolean} [opt.tilted=false] 是否倾斜安装（壁挂机型）
     * @returns {THREE.Mesh}
     */
    screen(opt) {
        const screen = createScreenTexture(opt.screen || {});
        this.ownedMaterials.push(screen.material);
        const mesh = this.plane(screen.material, {
            w: opt.w,
            h: opt.h,
            x: opt.x || 0,
            y: opt.cy,
            z: opt.z,
            rx: opt.tilted ? -0.12 : 0
        });
        this.parts.screen = { mesh, draw: screen.draw, texture: screen.texture };
        return mesh;
    }

    /**
     * 注册一个私有材质（销毁设备时一并释放）。
     * @param {THREE.Material} base 基础材质
     * @returns {THREE.Material} 材质副本
     */
    own(base) {
        const mat = cloneMaterial(base);
        this.ownedMaterials.push(mat);
        return mat;
    }

    /**
     * 加入对象树并统一开启阴影。
     * @param {THREE.Object3D} object 对象
     * @returns {THREE.Object3D}
     */
    add(object) {
        object.castShadow = true;
        object.receiveShadow = true;
        this.group.add(object);
        return object;
    }

    /**
     * 添加一个不可见但可被射线拾取的包围盒（提升拾取容错率与性能）。
     * @param {number} w 宽
     * @param {number} h 高
     * @param {number} d 深
     * @returns {THREE.Mesh}
     */
    addPickBox(w, h, d) {
        const material = new THREE.MeshBasicMaterial({ visible: false, depthWrite: false });
        material.userData.owned = true;
        const mesh = new THREE.Mesh(boxGeo(Math.max(w, 12), Math.max(h, 12), Math.max(d, 12)), material);
        mesh.position.set(0, Math.max(h, 12) / 2, 0);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.userData.isPickTarget = true;
        mesh.userData.pickMaterial = material;
        this.group.add(mesh);
        return mesh;
    }
}
