/**
 * 节点类型配置
 * 定义所有可用节点的元信息：图标、默认尺寸、是否可绑定设备、设备类型等
 */

export const NODE_TYPES = {
  // === 基础元素 ===
  busbar: {
    type: 'busbar',
    label: '母线',
    category: 'basic',
    icon: '/imgs/busbar.svg',
    defaultWidth: 200,
    defaultHeight: 5,
    bindable: false,
    resizable: 'horizontal',
    strokeColor: '#ffffff',
    showLabel: false,
    description: '交流/直流母线，作为电路汇集节点'
  },
  line: {
    type: 'line',
    label: '直线',
    category: 'basic',
    icon: null,
    defaultWidth: 100,
    defaultHeight: 2,
    bindable: false,
    resizable: 'horizontal',
    strokeColor: '#ffffff',
    showLabel: false,
    description: '直线连接元素'
  },
  text: {
    type: 'text',
    label: '文字',
    category: 'basic',
    icon: null,
    defaultWidth: 100,
    defaultHeight: 24,
    bindable: false,
    resizable: 'both',
    showLabel: false,
    description: '文本标注'
  },
  rect: {
    type: 'rect',
    label: '矩形框',
    category: 'basic',
    icon: null,
    defaultWidth: 120,
    defaultHeight: 80,
    bindable: false,
    resizable: 'both',
    showLabel: false,
    strokeColor: '#ffffff',
    description: '无填充矩形框，仅描边，可设置描边宽度与线型'
  },

  // === 设备元素 ===
  stack: {
    type: 'stack',
    label: '电池堆',
    category: 'device',
    icon: '/imgs/battery.svg',
    defaultWidth: 60,
    defaultHeight: 60,
    bindable: true,
    deviceType: 'stack',
    resizable: 'both',
    cascadeParent: null,
    description: '储能电池堆，包含多个电池簇'
  },
  cluster: {
    type: 'cluster',
    label: '电池簇',
    category: 'device',
    icon: '/imgs/battery.svg',
    defaultWidth: 50,
    defaultHeight: 50,
    bindable: true,
    deviceType: 'cluster',
    cascadeParent: 'stack',
    resizable: 'both',
    description: '电池簇，必须归属于某个电池堆'
  },
  pcs: {
    type: 'pcs',
    label: 'PCS',
    category: 'device',
    icon: '/imgs/PCS.svg',
    defaultWidth: 60,
    defaultHeight: 60,
    bindable: true,
    deviceType: 'pcs',
    resizable: 'both',
    description: '储能变流器，AC/DC 双向转换'
  },
  pinvt: {
    type: 'pinvt',
    label: '逆变器',
    category: 'device',
    icon: '/imgs/pinvt.svg',
    defaultWidth: 60,
    defaultHeight: 60,
    bindable: true,
    deviceType: 'pinvt',
    resizable: 'both',
    description: '光伏逆变器，DC/AC 转换'
  },
  meter: {
    type: 'meter',
    label: '双向电表',
    category: 'device',
    icon: '/imgs/meter.svg',
    defaultWidth: 60,
    defaultHeight: 60,
    bindable: true,
    deviceType: 'meter',
    resizable: 'both',
    description: '双向计量电表'
  },
  charger: {
    type: 'charger',
    label: '充电桩',
    category: 'device',
    icon: '/imgs/charger.svg',
    defaultWidth: 60,
    defaultHeight: 60,
    bindable: true,
    deviceType: 'charger',
    resizable: 'both',
    description: '电动汽车充电桩'
  },
  pv: {
    type: 'pv',
    label: '光伏',
    category: 'device',
    icon: '/imgs/pv.svg',
    defaultWidth: 70,
    defaultHeight: 70,
    bindable: true,
    deviceType: 'pv',
    resizable: 'both',
    description: '光伏组件'
  },
  breaker: {
    type: 'breaker',
    label: '断路器',
    category: 'device',
    icon: '/imgs/breaker.svg',
    defaultWidth: 60,
    defaultHeight: 60,
    bindable: true,
    deviceType: 'breaker',
    resizable: 'both',
    description: '断路器/开关'
  },
  transformer: {
    type: 'transformer',
    label: '变压器',
    category: 'device',
    icon: '/imgs/transformer.svg',
    defaultWidth: 60,
    defaultHeight: 60,
    bindable: true,
    deviceType: 'transformer',
    resizable: 'both',
    description: '变压器'
  },
  grid: {
    type: 'grid',
    label: '电网',
    category: 'device',
    icon: '/imgs/grid.svg',
    defaultWidth: 70,
    defaultHeight: 70,
    bindable: true,
    deviceType: 'grid',
    resizable: 'both',
    description: '电网（电网侧接入）'
  }
}

// 组件库分组配置（用于左侧面板展示）
export const COMPONENT_GROUPS = [
  {
    title: '基础元素',
    items: ['busbar', 'line', 'text', 'rect']
  },
  {
    title: '储能设备',
    items: ['stack', 'cluster', 'pcs']
  },
  {
    title: '发电与计量',
    items: ['pv', 'pinvt', 'meter', 'breaker', 'transformer', 'charger', 'grid']
  }
]

// 连线类型
export const LINK_TYPES = {
  straight: {
    label: '直线',
    stroke: '#666',
    strokeWidth: 2
  },
  orthogonal: {
    label: '正交线',
    stroke: '#666',
    strokeWidth: 2
  },
  curve: {
    label: '曲线',
    stroke: '#666',
    strokeWidth: 2
  }
}

// 设备类型映射（中文名）
export const DEVICE_TYPE_LABELS = {
  rect: '矩形框',
  stack: '电池堆',
  cluster: '电池簇',
  pcs: 'PCS',
  pinvt: '逆变器',
  meter: '双向电表',
  charger: '充电桩',
  pv: '光伏',
  breaker: '断路器',
  transformer: '变压器',
  grid: '电网'
}

// 父子级联关系：key 是子类型，value 是父类型
export const CASCADE_RELATION = {
  cluster: 'stack'
}

/**
 * 创建一个新节点
 */
export function createNode(type, x, y) {
  const config = NODE_TYPES[type]
  if (!config) throw new Error(`未知的节点类型: ${type}`)

  const now = Date.now()
  const node = {
    id: `node_${now}${Math.floor(Math.random() * 1000)}`,
    type,
    x,
    y,
    width: config.defaultWidth,
    height: config.defaultHeight,
    text: config.label,
    icon: config.icon,
    data: {
      deviceType: config.deviceType || null,
      bindable: config.bindable,
      cascadeParent: config.cascadeParent || null,
      binding: null
    },
    style: {},
    zIndex: now,
    rotate: 0,
    initialWidth: config.defaultWidth,
    initialHeight: config.defaultHeight,
    baseFontSize: 12
  }
  return node
}

/**
 * 创建一条新连线
 */
export function createLink(sourceId, targetId, linkType = 'straight') {
  const typeConfig = LINK_TYPES[linkType] || LINK_TYPES.straight
  return {
    id: `link_${Date.now()}${Math.floor(Math.random() * 1000)}`,
    source: sourceId,
    target: targetId,
    type: linkType,
    style: {
      stroke: typeConfig.stroke,
      strokeWidth: typeConfig.strokeWidth
    },
    data: {}
  }
}
