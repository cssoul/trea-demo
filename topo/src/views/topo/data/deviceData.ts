/**
 * 设备列表数据（用于绑定）
 */

export interface DeviceItem {
  deviceId: string
  deviceName: string
  deviceType: string
  parentDeviceId?: string | null
  childList?: DeviceItem[]
}

export const deviceList: DeviceItem[] = [
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
  { deviceId: 'meter001', deviceName: '关口表-1', deviceType: 'meter' },
  { deviceId: 'charger001', deviceName: '充电桩-1', deviceType: 'charger' },
  { deviceId: 'breaker001', deviceName: '断路器-1', deviceType: 'breaker' },
  { deviceId: 'pinvt001', deviceName: '逆变器-1', deviceType: 'pinvt' }
]

