/**
 * AnimationManager - 实时数据动画管理器（第二版：驱动三维渲染）
 *
 * 职责（仅查看模式使用）：
 *  - 构建 nodeId -> deviceId 映射，把一帧设备数据分发到对应三维设备
 *  - 驱动设备状态渲染：指示灯、SOC 电量条、液晶屏读数、断路器手柄、告警标记、离线暗化
 *  - 驱动连线能量流光：方向与速度映射实际功率大小与方向（颜色读全局连线配置）
 *  - 供电拓扑联动：断路器分闸时，其下游电缆失去能量（流光停止、基管置灰），
 *    实现"分闸即断开"的直观表达
 *  - 内置轮询机制，周期性拉取实时数据
 */

export default class AnimationManager {
    /**
     * @param {import('./three/TopoScene.js').default} scene 立体拓扑画布
     * @param {Object} [options] 可选项
     * @param {number} [options.pollInterval=2500] 轮询间隔（毫秒）
     * @param {Function} [options.dataFetcher] 数据源函数
     */
    constructor(scene, options = {}) {
        this.scene = scene;
        /** @type {Record<string, Object>} 设备实时数据 */
        this.deviceData = {};
        /** @type {Record<string, string>} nodeId -> deviceId */
        this.nodeDeviceMap = {};
        this._pollTimer = null;
        this._pollInterval = options.pollInterval || 2500;
        this._dataFetcher = options.dataFetcher || null;

        // 开发环境暴露实例，便于在控制台/自动化测试中检查实时渲染状态
        if (import.meta.env && import.meta.env.DEV) {
            window.__animationManager = this;
        }
    }

    /**
     * 兼容第一版接口：设置节点集合。
     * @param {Array} nodes 节点数组
     */
    setNodes(nodes) {
        this.nodes = nodes;
        this.syncFromCanvas();
    }

    /**
     * 兼容第一版接口：设置设备列表（当前仅用于扩展场景）。
     * @param {Array} deviceList 设备列表
     */
    setDeviceList(deviceList) {
        this.deviceList = deviceList;
    }

    /**
     * 从画布节点构建 nodeId -> deviceId 映射。
     */
    syncFromCanvas() {
        this.nodeDeviceMap = {};
        const nodes = this.scene && this.scene.nodes ? this.scene.nodes : [];
        nodes.forEach((node) => {
            if (node.data && node.data.binding && node.data.binding.deviceId) {
                this.nodeDeviceMap[node.id] = node.data.binding.deviceId;
            }
        });
    }

    /**
     * 注入一帧设备数据并刷新所有动画。
     * @param {Object} deviceDataMap { deviceId: DeviceRealtimeData }
     */
    applyDeviceData(deviceDataMap) {
        try {
            this.deviceData = deviceDataMap || {};
            this.syncFromCanvas();
            this._updateDevices();
            this._updateLinks();
        } catch (error) {
            console.error('[AnimationManager] 实时数据渲染失败', error);
        }
    }

    /**
     * 取节点绑定的设备实时数据。
     * @param {string} nodeId 节点 id
     * @returns {Object|null}
     */
    _dataOf(nodeId) {
        const deviceId = this.nodeDeviceMap[nodeId];
        return deviceId ? this.deviceData[deviceId] || null : null;
    }

    /** 刷新所有设备的状态渲染 */
    _updateDevices() {
        Object.entries(this.nodeDeviceMap).forEach(([nodeId, deviceId]) => {
            const data = this.deviceData[deviceId];
            if (!data) return;
            const node = this.scene.getNode(nodeId);
            if (!node) return;

            // 分类型的屏幕内容：电表显示累计电量，其余显示功率
            let screenPayload = null;
            if (node.type === 'meter' && data.reading != null) {
                screenPayload = {
                    value: data.reading.toFixed(1),
                    unit: 'kWh',
                    status: data.status === 'offline' ? 'OFFLINE' : 'METERING'
                };
            }

            this.scene.applyDeviceData(nodeId, data);
            if (screenPayload) {
                this.scene.setNodeScreen(nodeId, {
                    ...screenPayload,
                    title: node.type === 'meter' ? 'kWh' : 'PCS'
                });
            }
        });
    }

    /** 刷新所有连线的能量流光 */
    _updateLinks() {
        const energized = this._computeEnergizedNodes();
        const links = this.scene && this.scene.links ? this.scene.links : [];
        links.forEach((link) => {
            const srcData = this._dataOf(link.source);
            const tgtData = this._dataOf(link.target);
            const srcOn = energized.has(link.source);
            const tgtOn = energized.has(link.target);
            // 两端任一未带电（被分闸断路器隔离）则该电缆停运
            const active = srcOn && tgtOn;

            if (!active) {
                this.scene.setLinkFlow(link.id, null, null, { off: true });
                return;
            }

            const state = this._resolveFlowDirection(srcData, tgtData);
            if (!state) {
                this.scene.setLinkFlow(link.id, null, null, { off: false });
                return;
            }
            this.scene.setLinkFlow(link.id, state.direction, state.color, {
                speed: state.speed,
                density: state.density
            });
        });
    }

    /**
     * 计算带电节点集合：
     * 以电网/光伏等电源节点为起点，沿着"未被分闸断路器切断"的电缆做广度优先遍历。
     * @returns {Set<string>} 带电节点 id 集合
     */
    _computeEnergizedNodes() {
        const nodes = this.scene && this.scene.nodes ? this.scene.nodes : [];
        const links = this.scene && this.scene.links ? this.scene.links : [];

        // 分闸的断路器节点（视为断开点）
        const openNodes = new Set();
        nodes.forEach((node) => {
            const data = this._dataOf(node.id);
            if (data && data.closed === false) openNodes.add(node.id);
        });

        // 邻接表：跳过含分闸节点与离线节点的电缆
        const adjacency = new Map();
        nodes.forEach((node) => adjacency.set(node.id, []));
        links.forEach((link) => {
            const srcData = this._dataOf(link.source);
            const tgtData = this._dataOf(link.target);
            if (openNodes.has(link.source) || openNodes.has(link.target)) return;
            if (srcData && srcData.status === 'offline') return;
            if (tgtData && tgtData.status === 'offline') return;
            if (adjacency.has(link.source)) adjacency.get(link.source).push(link.target);
            if (adjacency.has(link.target)) adjacency.get(link.target).push(link.source);
        });

        // 电源节点：电网、光伏逆变器等发电类设备
        const energized = new Set();
        const queue = [];
        nodes.forEach((node) => {
            const data = this._dataOf(node.id);
            const type = (data && data.deviceType) || node.type;
            if (['grid', 'pv', 'pinvt'].includes(type)) {
                energized.add(node.id);
                queue.push(node.id);
            }
        });
        while (queue.length) {
            const current = queue.shift();
            (adjacency.get(current) || []).forEach((next) => {
                if (!energized.has(next)) {
                    energized.add(next);
                    queue.push(next);
                }
            });
        }

        // 未绑定设备的节点（母线/直线/区域等）默认视为带电，避免纯图形节点上的电缆静止
        nodes.forEach((node) => {
            if (!this.nodeDeviceMap[node.id]) energized.add(node.id);
        });
        return energized;
    }

    /**
     * 依据两端设备状态解析流动方向、速度与颜色。
     * 约定：power > 0 表示设备吸收功率（充电/用电），power < 0 表示设备输出功率（放电/发电）。
     * 颜色不在此指定（传 null），由 TopoScene.setLinkFlow 按全局连线配置解析。
     * @param {Object|null} srcData 源端设备数据
     * @param {Object|null} tgtData 目标端设备数据
     * @returns {{direction: string, color: null, speed: number, density: number}|null} 流动状态，null 表示无流动
     */
    _resolveFlowDirection(srcData, tgtData) {
        const pick = srcData && srcData.status && srcData.status !== 'idle' ? srcData : tgtData;
        if (!pick || !pick.status || pick.status === 'idle' || pick.status === 'offline') return null;
        const power = Math.abs(Number(pick.power) || 0);
        if (power < 1) return null;

        // 源端放电（输出）时能量由源流向目标；源端充电时反向
        let forward;
        if (srcData && srcData.status && srcData.status !== 'idle') {
            forward = srcData.power < 0;
        } else {
            forward = tgtData.power > 0;
        }
        return {
            direction: forward ? 'forward' : 'backward',
            // null = 使用全局配置中的充电/放电颜色
            color: null,
            // 流速与功率正相关（映射"功率越大流动越快"）
            speed: Math.min(2.4, Math.max(0.55, power / 70)),
            density: 3
        };
    }

    /**
     * 启动轮询。
     */
    start() {
        this.stop();
        const tick = async () => {
            if (this._dataFetcher) {
                try {
                    const data = await this._dataFetcher();
                    this.applyDeviceData(data);
                } catch (error) {
                    console.error('[AnimationManager] 轮询失败', error);
                }
            }
            this._pollTimer = setTimeout(tick, this._pollInterval);
        };
        tick();
    }

    /**
     * 停止轮询。
     */
    stop() {
        if (this._pollTimer) {
            clearTimeout(this._pollTimer);
            this._pollTimer = null;
        }
    }
}
