/**
 * 设备列表数据（用于拓扑节点绑定真实设备）
 * 结构与第一版保持一致，新增变压器设备以覆盖全部设备类型。
 */

export interface DeviceItem {
  deviceId: string
  deviceName: string
  deviceType: string
  parentDeviceId?: string | null
  childList?: DeviceItem[]
}

export const deviceList: DeviceItem[] = [
  { deviceId: 'grid001', deviceName: '电网-1', deviceType: 'grid' },
  { deviceId: 'transformer001', deviceName: '主变压器-1', deviceType: 'transformer' },
  { deviceId: 'meter001', deviceName: '关口表-1', deviceType: 'meter' },
  { deviceId: 'breaker001', deviceName: '主断路器-1', deviceType: 'breaker' },
  { deviceId: 'pcs001', deviceName: 'PCS-1', deviceType: 'pcs' },
  { deviceId: 'pcs002', deviceName: 'PCS-2', deviceType: 'pcs' },
  {
    deviceId: 'stack001',
    deviceName: '电池堆-1',
    deviceType: 'stack',
    childList: [
      { deviceId: 'cluster001', deviceName: '电池簇-1-1', deviceType: 'cluster', parentDeviceId: 'stack001' },
      { deviceId: 'cluster002', deviceName: '电池簇-1-2', deviceType: 'cluster', parentDeviceId: 'stack001' }
    ]
  },
  {
    deviceId: 'stack002',
    deviceName: '电池堆-2',
    deviceType: 'stack',
    childList: [
      { deviceId: 'cluster003', deviceName: '电池簇-2-1', deviceType: 'cluster', parentDeviceId: 'stack002' },
      { deviceId: 'cluster004', deviceName: '电池簇-2-2', deviceType: 'cluster', parentDeviceId: 'stack002' }
    ]
  },
  { deviceId: 'pv001', deviceName: '光伏-1', deviceType: 'pv' },
  { deviceId: 'pinvt001', deviceName: '逆变器-1', deviceType: 'pinvt' },
  { deviceId: 'charger001', deviceName: '充电桩-1', deviceType: 'charger' }
]
