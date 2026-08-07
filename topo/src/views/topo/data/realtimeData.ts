/**
 * 实时设备数据模拟器
 * 模拟设备实时运行数据：SOC、功率、充放电状态、告警等
 */

export interface DeviceRealtimeData {
  deviceId: string
  deviceName: string
  deviceType: string
  soc: number // 0-100 荷电量
  power: number // kW，正=充电，负=放电
  status: 'charging' | 'discharging' | 'idle' | 'offline'
  alarm: boolean
  voltage?: number
  current?: number
  temperature?: number
}

// 每个设备的内部状态机
const deviceStates: Record<string, { soc: number; power: number; status: string; alarm: boolean; phase: number }> = {
  stack001: { soc: 68, power: 120, status: 'charging', alarm: false, phase: 0 },
  stack002: { soc: 15, power: -85, status: 'discharging', alarm: false, phase: 0 },
  cluster001: { soc: 67, power: 40, status: 'charging', alarm: false, phase: 0 },
  cluster002: { soc: 69, power: 38, status: 'charging', alarm: false, phase: 0 },
  cluster004: { soc: 35, power: -28, status: 'discharging', alarm: false, phase: 0 },
  pcs001: { soc: 0, power: 120, status: 'charging', alarm: false, phase: 0 },
  pcs002: { soc: 0, power: -85, status: 'discharging', alarm: false, phase: 0 },
  pv001: { soc: 0, power: 35, status: 'discharging', alarm: false, phase: 0 },
  meter001: { soc: 0, power: 35, status: 'idle', alarm: false, phase: 0 }
}

const deviceNameMap: Record<string, string> = {
  stack001: '电池堆-1',
  stack002: '电池堆-2',
  cluster001: '电池簇-1-1',
  cluster002: '电池簇-1-2',
  cluster004: '电池簇-2-2',
  pcs001: 'PCS-1',
  pcs002: 'PCS-2',
  pv001: '光伏-1',
  meter001: '关口表-1'
}

const deviceTypeMap: Record<string, string> = {
  stack001: 'stack',
  stack002: 'stack',
  cluster001: 'cluster',
  cluster002: 'cluster',
  cluster004: 'cluster',
  pcs001: 'pcs',
  pcs002: 'pcs',
  pv001: 'pv',
  meter001: 'meter'
}

/**
 * 推进一帧：根据当前状态更新数据
 */
function tick() {
  Object.keys(deviceStates).forEach((id) => {
    const s = deviceStates[id]
    s.phase += 1

    if (s.status === 'charging') {
      s.soc = Math.min(100, s.soc + 0.4)
      s.power = 120 + Math.sin(s.phase * 0.3) * 8
      if (s.soc >= 95) s.status = 'idle'
    } else if (s.status === 'discharging') {
      s.soc = Math.max(0, s.soc - 0.5)
      s.power = -(85 + Math.sin(s.phase * 0.25) * 10)
      if (s.soc <= 10) s.status = 'idle'
    } else if (s.status === 'idle') {
      s.power = 0 + Math.sin(s.phase * 0.2) * 2
      // 随机切换充放电
      if (s.phase % 20 === 0 && s.soc > 30) {
        s.status = Math.random() > 0.5 ? 'discharging' : 'charging'
      } else if (s.soc < 20) {
        s.status = 'charging'
      }
    }

    // 随机告警（少量概率）
    if (Math.random() < 0.01) {
      s.alarm = !s.alarm
    }
    // 电池类设备温度过高时告警
    if (id.startsWith('stack') || id.startsWith('cluster')) {
      // 偶发告警
    }
  })
}

/**
 * 获取当前一帧实时数据
 */
export function getRealtimeData(): Record<string, DeviceRealtimeData> {
  tick()
  const result: Record<string, DeviceRealtimeData> = {}
  Object.entries(deviceStates).forEach(([id, s]) => {
    result[id] = {
      deviceId: id,
      deviceName: deviceNameMap[id] || id,
      deviceType: deviceTypeMap[id] || 'unknown',
      soc: Number(s.soc.toFixed(1)),
      power: Number(s.power.toFixed(1)),
      status: s.status as DeviceRealtimeData['status'],
      alarm: s.alarm,
      voltage: id.startsWith('pcs') ? 380 + Math.sin(s.phase * 0.1) * 5 : undefined,
      current: id.startsWith('pcs') ? Number((s.power / 380).toFixed(1)) : undefined,
      temperature: id.startsWith('stack') || id.startsWith('cluster') ? Number((25 + s.soc * 0.2 + Math.sin(s.phase * 0.15) * 2).toFixed(1)) : undefined
    }
  })
  return result
}

/**
 * 重置数据状态
 */
export function resetRealtimeData() {
  deviceStates.stack001 = { soc: 68, power: 120, status: 'charging', alarm: false, phase: 0 }
  deviceStates.stack002 = { soc: 15, power: -85, status: 'discharging', alarm: false, phase: 0 }
  deviceStates.cluster001 = { soc: 67, power: 40, status: 'charging', alarm: false, phase: 0 }
  deviceStates.cluster002 = { soc: 69, power: 38, status: 'charging', alarm: false, phase: 0 }
  deviceStates.cluster004 = { soc: 35, power: -28, status: 'discharging', alarm: false, phase: 0 }
  deviceStates.pcs001 = { soc: 0, power: 120, status: 'charging', alarm: false, phase: 0 }
  deviceStates.pcs002 = { soc: 0, power: -85, status: 'discharging', alarm: false, phase: 0 }
  deviceStates.pv001 = { soc: 0, power: 35, status: 'discharging', alarm: false, phase: 0 }
  deviceStates.meter001 = { soc: 0, power: 35, status: 'idle', alarm: false, phase: 0 }
}
