/**
 * AnimationManager - 动画管理器
 *
 * 职责（仅查看模式使用）：
 *  - 根据设备实时数据驱动 SOC 进度条
 *  - 根据充放电状态驱动连线流动动画
 *  - 根据告警状态驱动节点告警闪烁
 *  - 根据设备状态显示数据徽章（功率/电压等）
 */

export default class AnimationManager {
  constructor(canvas, options = {}) {
    this.canvas = canvas
    this.deviceData = {} // { deviceId: { soc, power, status, alarm, ... } }
    this.nodeDeviceMap = {} // { nodeId: deviceId }
    this.linkFlowState = {} // { linkId: direction }
    this._pollTimer = null
    this._pollInterval = options.pollInterval || 3000
    this._dataFetcher = options.dataFetcher || null
  }

  /**
   * 从画布节点构建 nodeId -> deviceId 映射
   */
  syncFromCanvas() {
    this.nodeDeviceMap = {}
    this.canvas.nodes.forEach((n) => {
      if (n.data && n.data.binding && n.data.binding.deviceId) {
        this.nodeDeviceMap[n.id] = n.data.binding.deviceId
      }
    })
  }

  /**
   * 注入一帧设备数据并刷新所有动画
   * @param {Object} deviceDataMap { deviceId: {...} }
   */
  applyDeviceData(deviceDataMap) {
    this.deviceData = deviceDataMap || {}
    this.syncFromCanvas()
    this._updateNodes()
    this._updateLinks()
  }

  _updateNodes() {
    Object.entries(this.nodeDeviceMap).forEach(([nodeId, deviceId]) => {
      const data = this.deviceData[deviceId]
      if (!data) return
      const node = this.canvas.getNode(nodeId)
      if (!node) return

      // 电池节点（stack/cluster）：用电池组件渲染 SOC + 充放电动效
      if (node.type === 'stack' || node.type === 'cluster') {
        // status: charging -> charge=1, discharging -> charge=-1, idle/offline -> charge=0
        let charge = 0
        if (data.status === 'charging') charge = 1
        else if (data.status === 'discharging') charge = -1
        // data.soc 为 0-100 百分制，转成 0-1 小数传给电池组件
        this.canvas.setNodeBattery(nodeId, data.soc / 100, charge)
      }

      // 告警闪烁
      if (data.alarm) {
        this.canvas.setNodeAlarm(nodeId, true)
      } else {
        this.canvas.setNodeAlarm(nodeId, false)
      }

      // 功率徽章
      if (data.power != null) {
        const sign = data.power >= 0 ? '+' : ''
        const text = `${sign}${data.power.toFixed(1)}kW`
        const color =
          data.status === 'charging'
            ? 'var(--accent-cyan)'
            : data.status === 'discharging'
              ? 'var(--accent-amber)'
              : 'var(--text-tertiary)'
        this.canvas.setNodeBadge(nodeId, text, color)
      }
    })
  }

  _updateLinks() {
    // 根据两端设备状态决定连线流动方向
    this.canvas.links.forEach((link) => {
      const srcDeviceId = this.nodeDeviceMap[link.source]
      const tgtDeviceId = this.nodeDeviceMap[link.target]
      const srcData = srcDeviceId ? this.deviceData[srcDeviceId] : null
      const tgtData = tgtDeviceId ? this.deviceData[tgtDeviceId] : null

      // 母线/直线节点没有设备数据，根据对端设备状态决定
      let direction = null
      let color = 'var(--accent-cyan)'
      let device = null
      if (srcData && srcData.status) device = srcData
      else if (tgtData && tgtData.status) device = tgtData

      if (device) {
        if (device.status === 'charging') {
          direction = 'forward'
          color = 'var(--accent-cyan)'
        } else if (device.status === 'discharging') {
          direction = 'backward'
          color = 'var(--accent-amber)'
        }
      }
      this.canvas.setLinkFlow(link.id, direction, color)
    })
  }

  /**
   * 启动轮询
   */
  start() {
    this.stop()
    const tick = async () => {
      if (this._dataFetcher) {
        try {
          const data = await this._dataFetcher()
          this.applyDeviceData(data)
        } catch (e) {
          console.error('[AnimationManager] poll error', e)
        }
      }
      this._pollTimer = setTimeout(tick, this._pollInterval)
    }
    tick()
  }

  stop() {
    if (this._pollTimer) {
      clearTimeout(this._pollTimer)
      this._pollTimer = null
    }
  }
}
