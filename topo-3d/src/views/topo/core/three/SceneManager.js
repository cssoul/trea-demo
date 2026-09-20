/**
 * SceneManager - Three.js 场景管理器
 *
 * 职责：
 *  - 创建 WebGL 渲染器、场景、等轴测（Isometric）正交相机与光照体系
 *  - 搭建"微缩沙盘"地面：浅色圆角底盘 + 柔和网格 + 地面接触阴影
 *  - 维护分层容器（设备层 / 电缆层 / 覆盖层），供拓扑内容挂载
 *  - 提供相机控制：缩放、平移、环绕（方位角/俯仰角受限）、自适应取景
 *  - 提供屏幕坐标 -> 地面/物体 的射线拾取能力
 *  - 统一管理渲染循环，帧回调按注册顺序执行
 *
 * 说明：所有坐标约定为「拓扑坐标 (x, y) 映射到世界地面 (x, 0, z)」，
 * 即世界 Y 轴恒为设备高度方向，方便与第一版 2D 数据直接兼容。
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PALETTE } from './materialLibrary.js';

/** 默认等轴测视角参数（true isometric：方位角 45°、俯仰角 35.264°） */
const DEFAULT_VIEW = {
    azimuth: 45,
    polar: 35.264,
    // 方位角不限制（支持 360° 整体旋转），俯仰角限制在可读范围内
    minPolar: 12,
    maxPolar: 80,
    distance: 6000,
    viewSize: 900,
    minViewSize: 140,
    maxViewSize: 5200,
    // 地面平面边长（世界单位）：远超最大可视范围，保证任何缩放/旋转下都不会露出边界
    groundPlaneSize: 80000
};

export default class SceneManager {
    /**
     * @param {HTMLElement} container 画布容器
     * @param {Object} [options] 可选项
     * @param {number} [options.viewSize] 初始垂直可视世界高度
     * @param {number} [options.background] 场景底色（用于禁用 alpha 时）
     */
    constructor(container, options = {}) {
        if (!container) {
            throw new Error('[SceneManager] 缺少画布容器');
        }
        this.container = container;
        this.options = options;

        // 相机球坐标参数
        this.view = { ...DEFAULT_VIEW, ...(options.view || {}) };
        this.target = new THREE.Vector3(0, 0, 0);
        this.azimuth = this.view.azimuth;
        this.polar = this.view.polar;
        this.viewSize = this.view.viewSize;

        // 帧回调与状态
        this._frameCallbacks = new Set();
        this._running = false;
        this._rafId = null;
        this._clock = new THREE.Clock();
        this._envRT = null;
        this._disposed = false;

        // 地面拾取平面（世界 Y = 0）
        this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this._raycaster = new THREE.Raycaster();
        this._pointer = new THREE.Vector2();
        this._ndc = new THREE.Vector2();
        // 地面覆盖状态
        this._groundPending = false;
        this._contentBounds = null;
        this._gridBounds = null;
        this._plateCenter = new THREE.Vector3();

        this._initRenderer();
        this._initScene();
        this._initCamera();
        this._initLights();
        this._initGround();
        this._bindResize();

        this.resize();
        this._lastFrameWidth = this.container.clientWidth;
        this._lastFrameHeight = this.container.clientHeight;
        this.start();
    }

    // ==================== 初始化 ====================

    /** 初始化渲染器 */
    _initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
            stencil: false
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        // 浅色微缩沙盘偏"产品渲染"质感，不做色调映射以保持底色纯净
        this.renderer.toneMapping = THREE.NoToneMapping;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.domElement.className = 'topo-three-canvas';
        this.renderer.domElement.style.display = 'block';
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.renderer.domElement.style.touchAction = 'none';
        this.container.appendChild(this.renderer.domElement);
    }

    /** 初始化场景与环境光照贴图 */
    _initScene() {
        this.scene = new THREE.Scene();
        // 背景与地面同色：即使地面几何体未覆盖到极端视角，也不会出现"画布边缘"
        this.scene.background = new THREE.Color(this.options.background != null ? this.options.background : PALETTE.groundPlate);
        // 使用程序化室内环境贴图，让白色机柜/金属铜排获得柔和反射
        try {
            const pmrem = new THREE.PMREMGenerator(this.renderer);
            const room = new RoomEnvironment();
            this._envRT = pmrem.fromScene(room, 0.04);
            this.scene.environment = this._envRT.texture;
            // 环境光强度压低，保证主光的明暗层次（避免整体过曝发白）
            this.scene.environmentIntensity = 0.32;
            pmrem.dispose();
            room.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) obj.material.dispose();
            });
        } catch (error) {
            console.error('[SceneManager] 环境贴图生成失败，已降级为纯光照渲染', error);
        }

        // 分层容器：设备 / 电缆 / 覆盖（选中框、临时连线等）
        this.layers = {
            devices: new THREE.Group(),
            cables: new THREE.Group(),
            overlay: new THREE.Group()
        };
        this.layers.devices.name = 'deviceLayer';
        this.layers.cables.name = 'cableLayer';
        this.layers.overlay.name = 'overlayLayer';
        this.scene.add(this.layers.devices, this.layers.cables, this.layers.overlay);
    }

    /** 初始化等轴测正交相机 */
    _initCamera() {
        const { width, height } = this._getContainerSize();
        const aspect = width / height;
        const halfH = this.viewSize / 2;
        const halfW = halfH * aspect;
        this.camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 1, 40000);
        this._updateCameraPose();
    }

    /** 初始化光照：左上主光（投射阴影）+ 半球环境光 + 右侧补光 */
    _initLights() {
        this.hemiLight = new THREE.HemisphereLight(0xffffff, 0xd6dee8, 0.5);
        this.scene.add(this.hemiLight);

        // 主方向光（屏幕左上方），负责投影与明暗层次
        this.keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
        this.keyLight.position.set(-900, 1500, -700);
        this.keyLight.castShadow = true;
        this.keyLight.shadow.mapSize.set(2048, 2048);
        this.keyLight.shadow.bias = -0.0008;
        this.keyLight.shadow.normalBias = 6;
        const shadowCam = this.keyLight.shadow.camera;
        shadowCam.left = -1400;
        shadowCam.right = 1400;
        shadowCam.top = 1400;
        shadowCam.bottom = -1400;
        shadowCam.near = 1;
        shadowCam.far = 8000;
        shadowCam.updateProjectionMatrix();
        this.shadowCameraSize = 1400;
        this.scene.add(this.keyLight);
        this.scene.add(this.keyLight.target);

        // 右侧冷色补光，避免背面死黑（不投影，开销低）
        this.fillLight = new THREE.DirectionalLight(0xdfe9ff, 0.35);
        this.fillLight.position.set(1200, 900, 1000);
        this.scene.add(this.fillLight);
    }

    /** 初始化微缩沙盘地面：圆角底盘 + 网格 */
    _initGround() {
        this.groundGroup = new THREE.Group();
        this.groundGroup.name = 'groundLayer';
        this.scene.add(this.groundGroup);

        // 地面：固定超大平面（跟随视角中心平移，永不露边），配合与背景同色，
        // 视觉上"地面无限延伸、铺满整个画布"，不存在立体底座边缘
        this.plateMaterial = new THREE.MeshStandardMaterial({
            color: PALETTE.groundPlate,
            roughness: 0.94,
            metalness: 0
        });
        this.plate = new THREE.Mesh(new THREE.PlaneGeometry(this.groundPlaneSize, this.groundPlaneSize), this.plateMaterial);
        this.plate.rotation.x = -Math.PI / 2;
        this.plate.receiveShadow = true;
        this.plate.matrixAutoUpdate = true;
        this.groundGroup.add(this.plate);

        // 网格（细网格 + 主网格）
        this.gridMinor = new THREE.LineSegments(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({ color: PALETTE.gridLine, transparent: true, opacity: 0.9 })
        );
        this.gridMajor = new THREE.LineSegments(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({ color: PALETTE.gridLineMajor, transparent: true, opacity: 0.95 })
        );
        this.gridMinor.position.y = 0.4;
        this.gridMajor.position.y = 0.5;
        this.groundGroup.add(this.gridMinor, this.gridMajor);

        // 每帧统一处理地面覆盖刷新（缩放/平移/旋转后底盘始终铺满视口）
        this.addFrameCallback(() => this._processGroundUpdate());
        this._requestGroundUpdate();
    }

    /** 绑定容器尺寸监听 */
    _bindResize() {
        this._resizeObserver = new ResizeObserver(() => this.resize());
        this._resizeObserver.observe(this.container);
    }

    /**
     * 获取容器尺寸（兜底防止初始化时尺寸为 0）。
     * @returns {{width: number, height: number}}
     */
    _getContainerSize() {
        const width = Math.max(1, this.container.clientWidth || 800);
        const height = Math.max(1, this.container.clientHeight || 600);
        return { width, height };
    }

    // ==================== 地面与取景 ====================

    /**
     * 记录拓扑内容包围盒（设备/连线所在范围），并请求刷新地面覆盖。
     * @param {{minX: number, minZ: number, maxX: number, maxZ: number}} bounds 世界地面包围盒
     */
    setContentBounds(bounds) {
        this._contentBounds = { ...bounds };
        this._requestGroundUpdate();
    }

    /** 标记需要刷新地面覆盖范围（同一帧内只处理一次） */
    _requestGroundUpdate() {
        this._groundPending = true;
    }

    /** 帧内统一处理地面覆盖刷新，避免一次拖拽触发多次几何体重建 */
    _processGroundUpdate() {
        if (!this._groundPending) return;
        this._groundPending = false;
        try {
            this._updateGroundCover();
        } catch (error) {
            console.error('[SceneManager] 地面覆盖刷新失败', error);
        }
    }

    /**
     * 计算当前视锥与地面 (y=0) 的交叠范围（世界 XZ 包围盒）。
     * @returns {{minX: number, minZ: number, maxX: number, maxZ: number}}
     */
    _groundFrustumBounds() {
        const hit = new THREE.Vector3();
        let minX = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxZ = -Infinity;
        // 视口四角对应的地面点，构成可见地面范围
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([nx, ny]) => {
            this._raycaster.setFromCamera(this._ndc.set(nx, ny), this.camera);
            if (this._raycaster.ray.intersectPlane(this._groundPlane, hit)) {
                minX = Math.min(minX, hit.x);
                minZ = Math.min(minZ, hit.z);
                maxX = Math.max(maxX, hit.x);
                maxZ = Math.max(maxZ, hit.z);
            }
        });
        if (!Number.isFinite(minX)) {
            // 相机与地面近乎平行时取不到交点，回退为目标点附近的范围
            return { minX: this.target.x - 2000, minZ: this.target.z - 2000, maxX: this.target.x + 2000, maxZ: this.target.z + 2000 };
        }
        // 俯仰角较小时投影距离可能极大，钳制避免几何体无限膨胀
        const LIMIT = 24000;
        return {
            minX: Math.max(-LIMIT, minX),
            minZ: Math.max(-LIMIT, minZ),
            maxX: Math.min(LIMIT, maxX),
            maxZ: Math.min(LIMIT, maxZ)
        };
    }

    /**
     * 让地面与网格始终铺满当前可视区域：
     *  - 地面为固定超大平面，仅需跟随视角中心平移（无几何体重建，开销为零）
     *  - 网格取"视锥地面范围 ∪ 内容范围"并外扩边距，未覆盖时才重建
     */
    _updateGroundCover() {
        const frustum = this._groundFrustumBounds();
        const content = this._contentBounds || frustum;
        const centerX = (frustum.minX + frustum.maxX) / 2;
        const centerZ = (frustum.minZ + frustum.maxZ) / 2;

        // 超大地面平面跟随视角中心，保证任何缩放/旋转下都铺满画布
        this.plate.position.set(centerX, 0, centerZ);

        // 网格范围 = 视锥 ∪ 内容，边距取可视范围的 30%（至少 400），确保边缘外仍有网格
        const extentX = frustum.maxX - frustum.minX;
        const extentZ = frustum.maxZ - frustum.minZ;
        const margin = Math.max(400, Math.max(extentX, extentZ) * 0.3);
        const need = {
            minX: Math.min(frustum.minX, content.minX) - margin,
            minZ: Math.min(frustum.minZ, content.minZ) - margin,
            maxX: Math.max(frustum.maxX, content.maxX) + margin,
            maxZ: Math.max(frustum.maxZ, content.maxZ) + margin
        };

        // 滞回：现有网格已覆盖（且留有余量）时不重建，避免连续缩放/拖拽时频繁重建几何体
        const slack = Math.max(200, margin * 0.5);
        const grid = this._gridBounds;
        if (
            grid &&
            grid.minX <= need.minX - slack &&
            grid.minZ <= need.minZ - slack &&
            grid.maxX >= need.maxX + slack &&
            grid.maxZ >= need.maxZ + slack
        ) {
            return;
        }
        this._rebuildGrid(need);

        // 主光/阴影相机跟随可视中心
        this._updateLightFollow(centerX, centerZ, Math.max(extentX, extentZ) / 2 + 600);
    }

    /**
     * 重建地面网格。
     * @param {{minX: number, minZ: number, maxX: number, maxZ: number}} bounds 需要覆盖的世界范围
     */
    _rebuildGrid(bounds) {
        this._buildGrid(bounds);
        this._gridBounds = { ...bounds };
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerZ = (bounds.minZ + bounds.maxZ) / 2;
        this._plateCenter = new THREE.Vector3(centerX, 0, centerZ);
    }

    /**
     * 构建地面网格线段（线距随可视范围自适应，保证线数量有上限）。
     * @param {{minX: number, minZ: number, maxX: number, maxZ: number}} bounds 覆盖范围
     */
    _buildGrid(bounds) {
        const width = bounds.maxX - bounds.minX;
        const depth = bounds.maxZ - bounds.minZ;
        // 控制网格密度：每个方向最多约 110 条线，避免超大底盘时线段数量爆炸
        const targetLines = 110;
        const minorStep = Math.max(20, Math.ceil(width / targetLines / 10) * 10);
        const majorStep = minorStep * 5;

        const minorVerts = [];
        const majorVerts = [];
        const pushLine = (x1, z1, x2, z2) => {
            // 与世界坐标对齐（step 的整数倍），保证缩放/平移时网格不发生漂移
            const isMajor =
                Math.abs(Math.round(x1) % majorStep) < 0.5 || Math.abs(Math.round(z1) % majorStep) < 0.5;
            (isMajor ? majorVerts : minorVerts).push(x1, 0, z1, x2, 0, z2);
        };

        const startX = Math.ceil(bounds.minX / minorStep) * minorStep;
        for (let x = startX; x <= bounds.maxX; x += minorStep) {
            pushLine(x, bounds.minZ, x, bounds.maxZ);
        }
        const startZ = Math.ceil(bounds.minZ / minorStep) * minorStep;
        for (let z = startZ; z <= bounds.maxZ; z += minorStep) {
            pushLine(bounds.minX, z, bounds.maxX, z);
        }

        this.gridMinor.geometry.dispose();
        this.gridMinor.geometry = new THREE.BufferGeometry();
        this.gridMinor.geometry.setAttribute('position', new THREE.Float32BufferAttribute(minorVerts, 3));
        this.gridMajor.geometry.dispose();
        this.gridMajor.geometry = new THREE.BufferGeometry();
        this.gridMajor.geometry.setAttribute('position', new THREE.Float32BufferAttribute(majorVerts, 3));
    }

    /**
     * 让主光与阴影相机跟随场景中心，保证阴影贴图分辨率利用充分。
     * @param {number} centerX 场景中心 X
     * @param {number} centerZ 场景中心 Z
     * @param {number} radius 场景半径
     */
    _updateLightFollow(centerX, centerZ, radius) {
        const r = Math.max(600, radius);
        this.keyLight.target.position.set(centerX, 0, centerZ);
        this.keyLight.target.updateMatrixWorld();
        this.keyLight.position.set(centerX - r * 0.55, r * 1.6 + 500, centerZ - r * 0.45);
        const size = Math.max(this.shadowCameraSize, r * 1.15);
        const shadowCam = this.keyLight.shadow.camera;
        // 阴影相机范围只需覆盖场景半径（略放大避免裁切）
        shadowCam.left = -size;
        shadowCam.right = size;
        shadowCam.top = size;
        shadowCam.bottom = -size;
        shadowCam.near = 1;
        shadowCam.far = r * 4 + 4000;
        shadowCam.updateProjectionMatrix();
    }

    /**
     * 自适应取景到指定世界包围盒。
     * @param {{minX: number, minZ: number, maxX: number, maxZ: number}} bounds 世界地面包围盒
     * @param {Object} [options] 可选项
     * @param {number} [options.padding=0.16] 边距比例
     * @param {number} [options.height=110] 参考设备高度（用于计算纵向范围）
     */
    fitBounds(bounds, options = {}) {
        const padding = options.padding != null ? options.padding : 0.16;
        const height = options.height != null ? options.height : 130;
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerZ = (bounds.minZ + bounds.maxZ) / 2;
        this.target.set(centerX, height * 0.35, centerZ);
        this._updateCameraPose();

        // 将包围盒 8 个角点投影到相机坐标系，计算所需可视范围
        const corners = [];
        [bounds.minX, bounds.maxX].forEach((x) => {
            [0, height].forEach((y) => {
                [bounds.minZ, bounds.maxZ].forEach((z) => {
                    corners.push(new THREE.Vector3(x, y, z));
                });
            });
        });
        this.camera.updateMatrixWorld();
        const viewMatrix = this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
        let maxX = 1;
        let maxY = 1;
        corners.forEach((corner) => {
            const p = corner.clone().applyMatrix4(viewMatrix);
            maxX = Math.max(maxX, Math.abs(p.x));
            maxY = Math.max(maxY, Math.abs(p.y));
        });

        const { width, height: containerHeight } = this._getContainerSize();
        const aspect = width / containerHeight;
        const scale = 1 - padding * 2;
        const needByY = (maxY * 2) / scale;
        const needByX = (maxX * 2) / scale / aspect;
        this.viewSize = this._clampViewSize(Math.max(needByY, needByX));
        this._applyProjection();
    }

    /**
     * 限制可视范围在合理区间内。
     * @param {number} size 目标可视高度
     * @returns {number}
     */
    _clampViewSize(size) {
        return THREE.MathUtils.clamp(size, this.view.minViewSize, this.view.maxViewSize);
    }

    // ==================== 相机控制 ====================

    /** 依据球坐标更新相机位置与朝向 */
    _updateCameraPose() {
        const az = THREE.MathUtils.degToRad(this.azimuth);
        const po = THREE.MathUtils.degToRad(this.polar);
        const radius = Math.cos(po) * this.view.distance;
        this.camera.position.set(
            this.target.x + radius * Math.cos(az),
            this.target.y + Math.sin(po) * this.view.distance,
            this.target.z + radius * Math.sin(az)
        );
        this.camera.lookAt(this.target);
        this.camera.updateMatrixWorld();
    }

    /** 依据 viewSize 与容器宽高比更新正交视锥 */
    _applyProjection() {
        const { width, height } = this._getContainerSize();
        const aspect = width / height;
        const halfH = this.viewSize / 2;
        const halfW = halfH * aspect;
        this.camera.left = -halfW;
        this.camera.right = halfW;
        this.camera.top = halfH;
        this.camera.bottom = -halfH;
        this.camera.updateProjectionMatrix();
    }

    /**
     * 缩放（以当前 target 为中心）。
     * @param {number} factor 缩放系数（>1 放大）
     */
    zoomBy(factor) {
        this.viewSize = this._clampViewSize(this.viewSize / factor);
        this._applyProjection();
        this._requestGroundUpdate();
    }

    /**
     * 以屏幕某点为锚点缩放，保持锚点下的地面位置不动（滚轮缩放手感）。
     * @param {number} factor 缩放系数
     * @param {number} clientX 锚点屏幕 X
     * @param {number} clientY 锚点屏幕 Y
     */
    zoomAtScreenPoint(factor, clientX, clientY) {
        const before = this.screenToGround(clientX, clientY);
        this.zoomBy(factor);
        if (!before) return;
        const after = this.screenToGround(clientX, clientY);
        if (!after) return;
        this.target.x += before.x - after.x;
        this.target.z += before.z - after.z;
        this._updateCameraPose();
    }

    /**
     * 按屏幕像素位移平移场景（跟随鼠标拖动）。
     * @param {number} dx 屏幕位移 X
     * @param {number} dy 屏幕位移 Y
     */
    panByScreen(dx, dy) {
        const { height } = this._getContainerSize();
        const worldPerPixel = this.viewSize / height;
        // 相机右向量恒在地面内（无 roll），取用即可
        const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
        right.y = 0;
        right.normalize();
        // 相机前向量在地面的投影（远离观察者方向）
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        this.target.addScaledVector(right, -dx * worldPerPixel);
        this.target.addScaledVector(forward, dy * worldPerPixel);
        this._updateCameraPose();
        this._requestGroundUpdate();
    }

    /**
     * 环绕相机（方位角支持 360° 整体旋转，俯仰角限制在可读范围内）。
     * @param {number} dx 屏幕位移 X
     * @param {number} dy 屏幕位移 Y
     */
    orbitBy(dx, dy) {
        this.azimuth += dx * 0.28;
        // 归一化到 (-180, 180]，避免长时间拖拽后数值无限增大
        this.azimuth = ((this.azimuth + 180) % 360 + 360) % 360 - 180;
        this.polar = THREE.MathUtils.clamp(this.polar - dy * 0.22, this.view.minPolar, this.view.maxPolar);
        this._updateCameraPose();
        this._requestGroundUpdate();
    }

    /** 恢复默认等轴测视角（不改动缩放与目标点） */
    resetView() {
        this.azimuth = this.view.azimuth;
        this.polar = this.view.polar;
        this._updateCameraPose();
    }

    /**
     * 平移到指定世界坐标点。
     * @param {number} x 世界 X
     * @param {number} z 世界 Z
     */
    focusOn(x, z) {
        this.target.x = x;
        this.target.z = z;
        this._updateCameraPose();
    }

    /** 获取当前缩放比例（相对初始可视范围） */
    getZoomRatio() {
        return this.view.viewSize / this.viewSize;
    }

    // ==================== 拾取 ====================

    /**
     * 将客户端坐标转换为归一化设备坐标。
     * @param {number} clientX 屏幕 X
     * @param {number} clientY 屏幕 Y
     * @returns {THREE.Vector2}
     */
    toNDC(clientX, clientY) {
        const rect = this.container.getBoundingClientRect();
        this._pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this._pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        return this._pointer;
    }

    /**
     * 屏幕坐标 -> 地面（世界 Y = 0 平面）交点。
     * @param {number} clientX 屏幕 X
     * @param {number} clientY 屏幕 Y
     * @returns {THREE.Vector3|null} 交点；相机与地面平行时返回 null
     */
    screenToGround(clientX, clientY) {
        const ndc = this.toNDC(clientX, clientY);
        this._raycaster.setFromCamera(ndc, this.camera);
        const hit = new THREE.Vector3();
        const result = this._raycaster.ray.intersectPlane(this._groundPlane, hit);
        return result ? hit : null;
    }

    /**
     * 屏幕坐标 -> 射线。
     * @param {number} clientX 屏幕 X
     * @param {number} clientY 屏幕 Y
     * @returns {THREE.Raycaster}
     */
    getRaycaster(clientX, clientY) {
        const ndc = this.toNDC(clientX, clientY);
        this._raycaster.setFromCamera(ndc, this.camera);
        return this._raycaster;
    }

    // ==================== 渲染循环 ====================

    /**
     * 注册帧回调（用于流光动画、呼吸灯等）。
     * @param {Function} callback 回调，参数为 { delta, elapsed }
     * @returns {Function} 取消注册函数
     */
    addFrameCallback(callback) {
        this._frameCallbacks.add(callback);
        return () => this._frameCallbacks.delete(callback);
    }

    /** 启动渲染循环 */
    start() {
        if (this._running || this._disposed) return;
        this._running = true;
        this._clock.start();
        const loop = () => {
            if (!this._running) return;
            this._rafId = requestAnimationFrame(loop);
            this._renderFrame();
        };
        this._rafId = requestAnimationFrame(loop);
    }

    /** 停止渲染循环 */
    stop() {
        this._running = false;
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }

    /** 渲染一帧并派发帧回调 */
    _renderFrame() {
        try {
            // 容器尺寸变化兜底（部分布局在首帧后才稳定，ResizeObserver 可能晚于首帧）
            const size = this._getContainerSize();
            if (size.width !== this._lastFrameWidth || size.height !== this._lastFrameHeight) {
                this._lastFrameWidth = size.width;
                this._lastFrameHeight = size.height;
                this.resize();
            }
            const delta = Math.min(this._clock.getDelta(), 0.1);
            const elapsed = this._clock.elapsedTime;
            this._frameCallbacks.forEach((cb) => {
                try {
                    cb({ delta, elapsed });
                } catch (error) {
                    console.error('[SceneManager] 帧回调执行失败', error);
                }
            });
            this.renderer.render(this.scene, this.camera);
        } catch (error) {
            console.error('[SceneManager] 渲染失败', error);
            this.stop();
        }
    }

    // ==================== 尺寸与销毁 ====================

    /** 容器尺寸变化时同步渲染器与相机 */
    resize() {
        if (this._disposed) return;
        const { width, height } = this._getContainerSize();
        this.renderer.setSize(width, height, false);
        this._applyProjection();
        this._requestGroundUpdate();
    }

    /**
     * 将世界坐标写入对象位置（拓扑坐标 -> 世界坐标的纯函数）。
     * @param {THREE.Object3D} object 目标对象
     * @param {number} x 拓扑 X
     * @param {number} z 拓扑 Y（映射到世界 Z）
     * @param {number} [y=0] 世界高度
     */
    static applyTopoPosition(object, x, z, y = 0) {
        object.position.set(x, y, z);
    }

    /** 销毁场景与所有 GPU 资源 */
    dispose() {
        this._disposed = true;
        this.stop();
        if (this._resizeObserver) this._resizeObserver.disconnect();
        this._frameCallbacks.clear();
        disposeObject(this.scene);
        if (this._envRT) {
            this._envRT.dispose();
            this._envRT = null;
        }
        this.renderer.dispose();
        if (this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
    }
}

/**
 * 释放材质自身持有的画布贴图资源。
 * @param {THREE.Material} mat 材质
 */
function disposeMaterialTextures(mat) {
    ['map', 'alphaMap', 'emissiveMap'].forEach((key) => {
        if (mat[key] && mat[key].isTexture) mat[key].dispose();
    });
}

/**
 * 释放单个设备/电缆对象组。
 * 仅释放"该对象私有"的资源（标记 userData.owned 的材质与贴图），
 * 共享材质库与几何体缓存中的资源由其自身管理，避免误伤其他设备。
 * @param {THREE.Object3D} root 根对象
 */
export function disposeObject(root) {
    if (!root) return;
    root.traverse((obj) => {
        if (obj.material) {
            const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
            materials.forEach((mat) => {
                if (mat.userData && mat.userData.owned) {
                    disposeMaterialTextures(mat);
                    mat.dispose();
                }
            });
        }
        if (obj.geometry && !(obj.geometry.userData && obj.geometry.userData.shared)) {
            obj.geometry.dispose();
        }
    });
}
