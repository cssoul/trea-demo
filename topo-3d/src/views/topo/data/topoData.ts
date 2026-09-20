/**
 * 拓扑图数据（节点 + 连线）
 *
 * 第二版说明：
 *  - 数据结构与第一版完全一致（node.x / node.y / width / height / rotate，link.source / target / style / data），
 *    第一版导出的 JSON 无需任何修改即可在第二版加载渲染
 *  - 平面坐标 (x, y) 在三维中被映射为地面坐标 (x, 0, z)，y 轴自动归零
 *  - 默认场景覆盖全部节点类型（母线/直线/文字/矩形框 + 9 类设备），便于直观查看各类立体模型
 */

export interface TopoNode {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  text: string
  icon: string | null
  data: {
    deviceType: string | null
    bindable: boolean
    cascadeParent?: string | null
    binding: {
      deviceId: string
      deviceType: string
      deviceName: string
      parentDeviceId: string | null
    } | null
  }
  style: Record<string, any>
  zIndex: number
  rotate: number
  initialWidth: number
  initialHeight: number
  baseFontSize: number
}

export interface TopoLink {
  id: string
  source: string
  target: string
  type: 'straight' | 'orthogonal' | 'curve'
  style: {
    stroke: string
    strokeWidth: number
    dasharray?: string
  }
  data: {
    controlPoint?: { x: number; y: number }
  }
}

/** 视角数据（编辑器调整的角度/缩放/中心点，随数据保存与恢复） */
export interface TopoView {
  /** 方位角（度），支持 360° 整体旋转 */
  azimuth: number
  /** 俯仰角（度） */
  polar: number
  /** 垂直方向可视世界高度（越小越放大） */
  viewSize: number
  /** 视角中心点（世界地面坐标） */
  target: { x: number; z: number }
}

export interface TopoGraphData {
  nodes: TopoNode[]
  links: TopoLink[]
  /** 可选视角：缺省时由前端自适应取景 */
  view?: TopoView
}

/**
 * 创建节点（减少重复字段，保持导出结构与第一版一致）。
 * @param id 节点 id
 * @param type 节点类型
 * @param x 平面坐标 x
 * @param y 平面坐标 y
 * @param width 宽
 * @param height 高
 * @param text 显示名称
 * @param extra 额外覆盖字段
 */
function node(
  id: string,
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  extra: Partial<TopoNode> = {}
): TopoNode {
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    text,
    icon: null,
    data: { deviceType: null, bindable: false, binding: null },
    style: {},
    zIndex: 0,
    rotate: 0,
    initialWidth: width,
    initialHeight: height,
    baseFontSize: 12,
    ...extra
  }
}

/**
 * 创建已绑定设备的节点。
 * @param id 节点 id
 * @param type 节点类型
 * @param x 平面坐标 x
 * @param y 平面坐标 y
 * @param size 占地尺寸
 * @param device 绑定设备信息
 * @param extra 额外覆盖字段
 */
function deviceNode(
  id: string,
  type: string,
  x: number,
  y: number,
  size: number,
  device: { deviceId: string; deviceName: string; parentDeviceId?: string | null },
  extra: Partial<TopoNode> = {}
): TopoNode {
  return node(id, type, x, y, size, size, device.deviceName, {
    data: {
      deviceType: type,
      bindable: true,
      cascadeParent: type === 'cluster' ? 'stack' : null,
      binding: {
        deviceId: device.deviceId,
        deviceType: type,
        deviceName: device.deviceName,
        parentDeviceId: device.parentDeviceId ?? null
      }
    },
    ...extra
  })
}

export const topoGraphData: TopoGraphData = {
  nodes: [
    // === 基础元素：标题文字 + 区域框 ===
    node('node_text_title', 'text', 640, 30, 360, 84, '储能电站一次接线图', {
      style: { fill: '#2b3440' }
    }),
    node('node_rect_zone', 'rect', 700, -40, 1300, 1180, '设备区', {
      style: { stroke: '#9aa6b8' }
    }),

    // === 电网侧：电网 -> 变压器 -> 关口表 -> 主断路器 ===
    deviceNode('node_grid001', 'grid', 40, 430, 90, { deviceId: 'grid001', deviceName: '电网-1' }),
    deviceNode('node_transformer', 'transformer', 300, 430, 80, {
      deviceId: 'transformer001',
      deviceName: '主变压器-1'
    }),
    deviceNode('node_meter001', 'meter', 560, 440, 70, { deviceId: 'meter001', deviceName: '关口表-1' }),
    deviceNode('node_breaker001', 'breaker', 790, 440, 70, { deviceId: 'breaker001', deviceName: '主断路器-1' }),

    // === 交流主母线 ===
    node('node_busbar_main', 'busbar', 1000, 700, 900, 10, '交流母线', {
      style: {},
      data: { deviceType: null, bindable: false, binding: null }
    }),

    // === 储能侧：PCS -> 直流汇流母线 -> 电池堆 / 电池簇 ===
    deviceNode('node_pcs001', 'pcs', 1080, 200, 70, { deviceId: 'pcs001', deviceName: 'PCS-1' }),
    deviceNode('node_pcs002', 'pcs', 1320, 200, 70, { deviceId: 'pcs002', deviceName: 'PCS-2' }),
    node('node_line_dc', 'line', 1400, 390, 640, 8, '直流母线'),
    deviceNode('node_stack001', 'stack', 1480, 110, 70, { deviceId: 'stack001', deviceName: '电池堆-1' }),
    deviceNode('node_stack002', 'stack', 1860, 110, 70, { deviceId: 'stack002', deviceName: '电池堆-2' }),
    deviceNode('node_cluster001', 'cluster', 1380, 580, 56, {
      deviceId: 'cluster001',
      deviceName: '电池簇-1-1',
      parentDeviceId: 'stack001'
    }),
    deviceNode('node_cluster002', 'cluster', 1560, 580, 56, {
      deviceId: 'cluster002',
      deviceName: '电池簇-1-2',
      parentDeviceId: 'stack001'
    }),
    deviceNode('node_cluster003', 'cluster', 1760, 580, 56, {
      deviceId: 'cluster003',
      deviceName: '电池簇-2-1',
      parentDeviceId: 'stack002'
    }),
    deviceNode('node_cluster004', 'cluster', 1940, 580, 56, {
      deviceId: 'cluster004',
      deviceName: '电池簇-2-2',
      parentDeviceId: 'stack002'
    }),

    // === 光伏与充电侧 ===
    deviceNode('node_pv001', 'pv', 880, 980, 90, { deviceId: 'pv001', deviceName: '光伏-1' }),
    deviceNode('node_pinvt001', 'pinvt', 1160, 980, 70, { deviceId: 'pinvt001', deviceName: '逆变器-1' }),
    deviceNode('node_charger001', 'charger', 1440, 980, 60, { deviceId: 'charger001', deviceName: '充电桩-1' })
  ],
  links: [
    // 电网侧链路
    { id: 'link_grid_transformer', source: 'node_grid001', target: 'node_transformer', type: 'straight', style: { stroke: '#666', strokeWidth: 3 }, data: {} },
    { id: 'link_transformer_meter', source: 'node_transformer', target: 'node_meter001', type: 'straight', style: { stroke: '#666', strokeWidth: 3 }, data: {} },
    { id: 'link_meter_breaker', source: 'node_meter001', target: 'node_breaker001', type: 'straight', style: { stroke: '#666', strokeWidth: 3 }, data: {} },
    { id: 'link_breaker_busbar', source: 'node_breaker001', target: 'node_busbar_main', type: 'straight', style: { stroke: '#666', strokeWidth: 3 }, data: {} },

    // 储能侧链路
    { id: 'link_dc_pcs1', source: 'node_line_dc', target: 'node_pcs001', type: 'straight', style: { stroke: '#666', strokeWidth: 3 }, data: {} },
    { id: 'link_dc_pcs2', source: 'node_line_dc', target: 'node_pcs002', type: 'straight', style: { stroke: '#666', strokeWidth: 3 }, data: {} },
    { id: 'link_pcs1_busbar', source: 'node_pcs001', target: 'node_busbar_main', type: 'straight', style: { stroke: '#666', strokeWidth: 3 }, data: {} },
    { id: 'link_pcs2_busbar', source: 'node_pcs002', target: 'node_busbar_main', type: 'straight', style: { stroke: '#666', strokeWidth: 3 }, data: {} },
    { id: 'link_stack1_dc', source: 'node_stack001', target: 'node_line_dc', type: 'straight', style: { stroke: '#666', strokeWidth: 3 }, data: {} },
    { id: 'link_stack2_dc', source: 'node_stack002', target: 'node_line_dc', type: 'straight', style: { stroke: '#666', strokeWidth: 3 }, data: {} },
    { id: 'link_cluster1_stack1', source: 'node_cluster001', target: 'node_stack001', type: 'straight', style: { stroke: '#666', strokeWidth: 2 }, data: {} },
    { id: 'link_cluster2_stack1', source: 'node_cluster002', target: 'node_stack001', type: 'straight', style: { stroke: '#666', strokeWidth: 2 }, data: {} },
    { id: 'link_cluster3_stack2', source: 'node_cluster003', target: 'node_stack002', type: 'straight', style: { stroke: '#666', strokeWidth: 2 }, data: {} },
    { id: 'link_cluster4_stack2', source: 'node_cluster004', target: 'node_stack002', type: 'straight', style: { stroke: '#666', strokeWidth: 2 }, data: {} },

    // 光伏与充电链路
    { id: 'link_pv_pinvt', source: 'node_pv001', target: 'node_pinvt001', type: 'straight', style: { stroke: '#666', strokeWidth: 2 }, data: {} },
    { id: 'link_pinvt_busbar', source: 'node_pinvt001', target: 'node_busbar_main', type: 'straight', style: { stroke: '#666', strokeWidth: 3 }, data: {} },
    { id: 'link_charger_busbar', source: 'node_charger001', target: 'node_busbar_main', type: 'straight', style: { stroke: '#666', strokeWidth: 3 }, data: {} }
  ],
  // 默认视角：标准等轴测（方位角 45°、俯仰角 35.264°），自适应取景后的中心与缩放
  view: { azimuth: 45, polar: 35.264, viewSize: 1500, target: { x: 1020, z: 560 } }
}
