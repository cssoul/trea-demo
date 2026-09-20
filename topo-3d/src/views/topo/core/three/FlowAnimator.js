/**
 * FlowAnimator - 能量流光动画器
 *
 * 职责：
 *  - 提供流光着色器材质：沿电缆管道方向推进的能量光团，方向与速度映射实际功率大小与方向
 *  - 统一驱动所有流光材质的 uTime，帧率无关（基于 delta 累加），组件销毁时彻底释放
 *
 * 着色器说明：
 *  - uv.x 为沿管道方向的参数（0 起点 -> 1 终点），uv.y 为环绕管壁方向
 *  - uSpeed 为正表示"起点流向终点"，为负表示反向；为 0 时流光静止（断路器分闸）
 */
import * as THREE from 'three';

/** 顶点着色器：直接传递 uv 与裁切空间坐标 */
const VERTEX_SHADER = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

/** 片元着色器：周期性能量光团 + 两端渐隐 + 管壁明暗带 */
const FRAGMENT_SHADER = `
    uniform float uTime;
    uniform float uSpeed;
    uniform float uDensity;
    uniform float uOpacity;
    uniform vec3 uColor;
    varying vec2 vUv;

    void main() {
        // 沿管长方向推进的周期性光团
        float t = fract(vUv.x * uDensity - uTime * uSpeed);
        float pulse = pow(max(0.0, sin(t * 3.14159265)), 7.0);
        // 管道两端渐隐，避免端子处生硬截断
        float edge = smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.95, vUv.x);
        // 管壁明暗带，形成金属管道高光观感
        float band = 0.6 + 0.4 * abs(sin(vUv.y * 3.14159265));
        float alpha = pulse * edge * band * uOpacity;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(uColor * (0.85 + 1.5 * pulse), alpha);
    }
`;

/**
 * 创建流光着色器材质。
 * @returns {THREE.ShaderMaterial}
 */
export function createFlowMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uSpeed: { value: 0 },
            uDensity: { value: 3 },
            uOpacity: { value: 0 },
            uColor: { value: new THREE.Color(0x00e0a4) }
        },
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.FrontSide,
        toneMapped: false
    });
}

export default class FlowAnimator {
    constructor() {
        /** @type {Set<THREE.ShaderMaterial>} 已注册的流光材质 */
        this.materials = new Set();
        this.time = 0;
        this._unregisterFrame = null;
        this._running = false;
    }

    /**
     * 绑定场景管理器并启动帧驱动。
     * @param {import('./SceneManager.js').default} sceneManager 场景管理器
     */
    attach(sceneManager) {
        this.sceneManager = sceneManager;
        this.start();
    }

    /**
     * 注册一个流光材质参与统一驱动。
     * @param {THREE.ShaderMaterial} material 材质
     */
    register(material) {
        if (material) this.materials.add(material);
    }

    /**
     * 注销流光材质。
     * @param {THREE.ShaderMaterial} material 材质
     */
    unregister(material) {
        this.materials.delete(material);
    }

    /**
     * 设置某条电缆的流光参数。
     * @param {THREE.ShaderMaterial} material 材质
     * @param {Object} state 流光状态
     * @param {boolean} state.active 是否通电流动
     * @param {number} [state.speed=1] 流速（正=起点到终点；负=反向）
     * @param {number} [state.density=3] 光团密度
     * @param {number} [state.opacity=0.9] 强度
     * @param {number|string} [state.color] 颜色
     */
    setFlow(material, state = {}) {
        if (!material) return;
        const { active, speed = 1, density = 3, opacity = 0.9, color } = state;
        material.uniforms.uSpeed.value = active ? speed : 0;
        material.uniforms.uOpacity.value = active ? opacity : 0;
        material.uniforms.uDensity.value = density;
        if (color != null) {
            material.uniforms.uColor.value.set(color);
        }
    }

    /** 启动帧驱动（基于 delta 累加，暂停/切页后不会出现时间跳变） */
    start() {
        if (this._running || !this.sceneManager) return;
        this._running = true;
        this._unregisterFrame = this.sceneManager.addFrameCallback(({ delta }) => {
            this.time += delta;
            this.materials.forEach((material) => {
                material.uniforms.uTime.value = this.time;
            });
        });
    }

    /** 停止帧驱动 */
    stop() {
        this._running = false;
        if (this._unregisterFrame) {
            this._unregisterFrame();
            this._unregisterFrame = null;
        }
    }

    /** 清空并销毁所有流光材质 */
    dispose() {
        this.stop();
        this.materials.forEach((material) => material.dispose());
        this.materials.clear();
    }
}
