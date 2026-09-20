/**
 * 实时设备数据模拟器
 *
 * 模拟设备实时运行数据：SOC、功率、充放电状态、告警、断路器分合闸等。
 * 接入真实设备时只需替换 getRealtimeData 的数据源，其余渲染逻辑无需改动。
 */

export interface DeviceRealtimeData {
  deviceId: string
  deviceName: string
  deviceType: string
  /** 荷电量 0~100 */
  soc: number
  /** 功率 kW，正=充电，负=放电 */
  power: number
  status: 'charging' | 'discharging' | 'idle' | 'offline'
  /** 是否告警 */
  alarm: boolean
  /** 断路器/开关是否合闸（仅 breaker 有效） */
  closed?: boolean
  /** 电表累计读数 kWh */
  reading?: number
  voltage?: number
  current?: number
  temperature?: number
}

/** 每个设备的内部状态机 */
const deviceStates: Record<
  string,
  { soc: number; power: number; status: string; alarm: boolean; phase: number; closed: boolean; reading: number }
> = {
  grid001: { soc: 0, power: 260, status: 'discharging', alarm: false, phase: 0, closed: true, reading: 0 },
  transformer001: { soc: 0, power: 250, status: 'discharging', alarm: false, phase: 0, closed: true, reading: 0 },
  meter001: { soc: 0, power: 250, status: 'discharging', alarm: false, phase: 0, closed: true, reading: 12680.4 },
  breaker001: { soc: 0, power: 250, status: 'discharging', alarm: false, phase: 0, closed: true, reading: 0 },
  pcs001: { soc: 0, power: 118, status: 'discharging', alarm: false, phase: 0, closed: true, reading: 0 },
  pcs002: { soc: 0, power: -96, status: 'charging', alarm: false, phase: 0, closed: true, reading: 0 },
  pinvt001: { soc: 0, power: 86, status: 'discharging', alarm: false, phase: 0, closed: true, reading: 0 },
  pv001: { soc: 0, power: 88, status: 'discharging', alarm: false, phase: 0, closed: true, reading: 0 },
  charger001: { soc: 0, power: 42, status: 'charging', alarm: false, phase: 0, closed: true, reading: 0 },
  stack001: { soc: 72, power: 118, status: 'discharging', alarm: false, phase: 0, closed: true, reading: 0 },
  stack002: { soc: 28, power: 96, status: 'charging', alarm: false, phase: 0, closed: true, reading: 0 },
  cluster001: { soc: 71, power: 40, status: 'discharging', alarm: false, phase: 0, closed: true, reading: 0 },
  cluster002: { soc: 74, power: 38, status: 'discharging', alarm: false, phase: 0, closed: true, reading: 0 },
  cluster003: { soc: 30, power: -32, status: 'charging', alarm: false, phase: 0, closed: true, reading: 0 },
  cluster004: { soc: 26, power: -30, status: 'charging', alarm: false, phase: 0, closed: true, reading: 0 }
}

/** 设备名称映射 */
const deviceNameMap: Record<string, string> = {
  grid001: '电网-1',
  transformer001: '主变压器-1',
  meter001: '关口表-1',
  breaker001: '主断路器-1',
  pcs001: 'PCS-1',
  pcs002: 'PCS-2',
  pinvt001: '逆变器-1',
  pv001: '光伏-1',
  charger001: '充电桩-1',
  stack001: '电池堆-1',
  stack002: '电池堆-2',
  cluster001: '电池簇-1-1',
  cluster002: '电池簇-1-2',
  cluster003: '电池簇-2-1',
  cluster004: '电池簇-2-2'
}

/** 设备类型映射 */
const deviceTypeMap: Record<string, string> = {
  grid001: 'grid',
  transformer001: 'transformer',
  meter001: 'meter',
  breaker001: 'breaker',
  pcs001: 'pcs',
  pcs002: 'pcs',
  pinvt001: 'pinvt',
  pv001: 'pv',
  charger001: 'charger',
  stack001: 'stack',
  stack002: 'stack',
  cluster001: 'cluster',
  cluster002: 'cluster',
  cluster003: 'cluster',
  cluster004: 'cluster'
}

/**
 * 推进一帧：根据当前状态更新数据。
 */
function tick(): void {
  Object.keys(deviceStates).forEach((id) => {
    const state = deviceStates[id]
    state.phase += 1

    // 电网：无 SOC；在取电/馈网之间周期性切换，驱动相连电缆的流向变化
    if (id === 'grid001') {
      if (state.phase % 60 === 0) {
        state.status = Math.random() > 0.5 ? 'charging' : 'discharging'
      }
      state.power = state.status === 'charging' ? 240 + Math.sin(state.phase * 0.3) * 20 : -(230 + Math.sin(state.phase * 0.25) * 18)
      if (Math.random() < 0.006) state.alarm = !state.alarm
      return
    }

    // 断路器：偶发分闸（演示"分闸后流光停止"）
    if (id === 'breaker001') {
      if (state.phase % 240 === 0) state.closed = !state.closed
      state.power = state.closed ? 250 : 0
      state.status = state.closed ? 'discharging' : 'idle'
      return
    }

    // 关口表：累计电量持续增长
    if (id === 'meter001') {
      state.reading += Math.abs(state.power) / 3600
      state.power = 240 + Math.sin(state.phase * 0.2) * 12
      state.status = 'discharging'
      if (Math.random() < 0.004) state.alarm = !state.alarm
      return
    }

    // 光伏：白天稳定发电，功率随"云层"波动
    if (id === 'pv001') {
      state.power = 88 + Math.sin(state.phase * 0.12) * 22
      state.status = 'discharging'
      return
    }

    if (state.status === 'charging') {
      state.soc = Math.min(100, state.soc + 0.3)
      state.power = -(90 + Math.sin(state.phase * 0.25) * 12)
      if (state.soc >= 96) state.status = 'idle'
    } else if (state.status === 'discharging') {
      state.soc = Math.max(0, state.soc - 0.35)
      state.power = 90 + Math.sin(state.phase * 0.3) * 14
      if (state.soc <= 8) state.status = 'idle'
    } else {
      state.power = 0
      if (state.phase % 30 === 0) {
        state.status = state.soc > 60 ? 'discharging' : 'charging'
      }
    }

    // 随机告警
    if (Math.random() < 0.008) state.alarm = !state.alarm
  })
}

/**
 * 获取当前一帧实时数据。
 */
export function getRealtimeData(): Record<string, DeviceRealtimeData> {
  tick()
  const result: Record<string, DeviceRealtimeData> = {}
  Object.entries(deviceStates).forEach(([id, state]) => {
    result[id] = {
      deviceId: id,
      deviceName: deviceNameMap[id] || id,
      deviceType: deviceTypeMap[id] || 'unknown',
      soc: Number(state.soc.toFixed(1)),
      power: Number(state.power.toFixed(1)),
      status: state.status as DeviceRealtimeData['status'],
      alarm: state.alarm,
      closed: state.closed,
      reading: id === 'meter001' ? Number(state.reading.toFixed(2)) : undefined,
      voltage: id.startsWith('pcs') ? Number((380 + Math.sin(state.phase * 0.1) * 5).toFixed(1)) : undefined,
      current: id.startsWith('pcs') ? Number((state.power / 380).toFixed(1)) : undefined,
      temperature:
        id.startsWith('stack') || id.startsWith('cluster')
          ? Number((25 + state.soc * 0.2 + Math.sin(state.phase * 0.15) * 2).toFixed(1))
          : undefined
    }
  })
  return result
}

/**
 * 重置数据状态（用于演示复位）。
 */
export function resetRealtimeData(): void {
  Object.keys(deviceStates).forEach((id) => {
    const state = deviceStates[id]
    state.phase = 0
    state.alarm = false
    state.closed = true
  })
}
