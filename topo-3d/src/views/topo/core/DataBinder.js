/**
 * DataBinder - 设备数据绑定管理
 *
 * 职责：
 *  - 维护节点与实际设备的绑定关系
 *  - 计算可用设备列表（已绑定的设备不可再被关联）
 *  - 处理父子级联（电池簇必须归属于某电池堆）
 *  - 提供绑定/解绑 API
 */

export default class DataBinder {
  constructor(nodes = [], deviceList = []) {
    this.nodes = nodes
    this.deviceList = deviceList
  }

  setNodes(nodes) {
    this.nodes = nodes
  }
  setDeviceList(deviceList) {
    this.deviceList = deviceList
  }

  /**
   * 获取所有已被绑定的 deviceId
   */
  getBoundDeviceIds() {
    const ids = new Set()
    this.nodes.forEach((n) => {
      if (n.data && n.data.binding && n.data.binding.deviceId) {
        ids.add(n.data.binding.deviceId)
      }
    })
    return ids
  }

  /**
   * 获取某设备类型下可用的设备（未被绑定的）
   * @param {string} deviceType
   * @param {string|null} parentDeviceId 仅当为 cluster 时，传入父级 stack 的 deviceId
   */
  getAvailableDevices(deviceType, parentDeviceId = null) {
    const bound = this.getBoundDeviceIds()
    // 允许当前正在编辑的节点保留其已绑定的设备
    const result = []
    const walk = (list, parent) => {
      list.forEach((dev) => {
        if (dev.deviceType === deviceType) {
          if (deviceType === 'cluster' && parentDeviceId) {
            if (parent === parentDeviceId) {
              result.push(dev)
            }
          } else if (deviceType !== 'cluster') {
            result.push(dev)
          }
        }
        if (dev.childList && dev.childList.length) {
          walk(dev.childList, dev.deviceId)
        }
      })
    }
    walk(this.deviceList, null)
    return result.filter((d) => !bound.has(d.deviceId))
  }

  /**
   * 获取所有电池堆设备（用于 cluster 绑定前选父级）
   */
  getStackDevices() {
    const result = []
    const walk = (list) => {
      list.forEach((dev) => {
        if (dev.deviceType === 'stack') result.push(dev)
        if (dev.childList && dev.childList.length) walk(dev.childList)
      })
    }
    walk(this.deviceList)
    return result
  }

  /**
   * 绑定节点到设备
   */
  bind(nodeId, device) {
    const node = this.nodes.find((n) => n.id === nodeId)
    if (!node) return false
    if (!node.data) node.data = {}
    node.data.binding = {
      deviceId: device.deviceId,
      deviceType: device.deviceType,
      deviceName: device.deviceName,
      parentDeviceId: device.parentDeviceId || null
    }
    // 同步节点文本为设备名
    if (device.deviceName) {
      node.text = device.deviceName
    }
    return true
  }

  /**
   * 解绑
   */
  unbind(nodeId) {
    const node = this.nodes.find((n) => n.id === nodeId)
    if (!node) return false
    if (node.data) node.data.binding = null
    return true
  }

  /**
   * 获取节点的绑定设备
   */
  getBinding(nodeId) {
    const node = this.nodes.find((n) => n.id === nodeId)
    return node && node.data && node.data.binding ? node.data.binding : null
  }

  /**
   * 校验级联关系：cluster 必须绑定到其所属 stack 的子簇
   * 返回校验结果 { valid, message }
   */
  validateCascade(nodeId, parentStackDeviceId) {
    const node = this.nodes.find((n) => n.id === nodeId)
    if (!node) return { valid: false, message: '节点不存在' }
    if (node.type !== 'cluster') return { valid: true }
    if (!parentStackDeviceId) return { valid: false, message: '电池簇必须选择所属电池堆' }
    return { valid: true }
  }
}
