/**
 * 拓扑图数据（节点 + 连线）
 * 基于预设的储能系统接线图
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

export interface TopoGraphData {
  nodes: TopoNode[]
  links: TopoLink[]
}

export const topoGraphData: TopoGraphData = {
  nodes: [
    {
      id: 'node_1770552045673',
      type: 'stack',
      x: 482,
      y: 170,
      width: 60,
      height: 60,
      text: '电池堆-1',
      icon: '/imgs/stack.svg',
      data: {
        deviceType: 'stack',
        bindable: true,
        binding: {
          deviceId: 'stack001',
          deviceType: 'stack',
          deviceName: '电池堆-1',
          parentDeviceId: null
        }
      },
      style: {},
      zIndex: 0,
      rotate: 6.46,
      initialWidth: 60,
      initialHeight: 60,
      baseFontSize: 12
    },
    {
      id: 'node_1770552053705',
      type: 'line',
      x: 309.91,
      y: 381,
      width: 555.9,
      height: 2,
      text: '',
      icon: null,
      data: { deviceType: null, bindable: false, binding: null },
      style: { fill: '#e70808', stroke: '#ed0707', strokeWidth: 1 },
      zIndex: 1,
      rotate: 270,
      initialWidth: 100,
      initialHeight: 2,
      baseFontSize: 12
    },
    {
      id: 'node_1770552070021',
      type: 'stack',
      x: 523,
      y: 397,
      width: 60,
      height: 60,
      text: '电池堆-2',
      icon: '/imgs/stack.svg',
      data: {
        deviceType: 'stack',
        bindable: true,
        binding: {
          deviceId: 'stack002',
          deviceType: 'stack',
          deviceName: '电池堆-2',
          parentDeviceId: null
        }
      },
      style: {},
      zIndex: 2,
      rotate: 0,
      initialWidth: 60,
      initialHeight: 60,
      baseFontSize: 12
    },
    {
      id: 'node_1770552071687',
      type: 'cluster',
      x: 819.92,
      y: 100.94,
      width: 50,
      height: 50,
      text: '电池簇-1-1',
      icon: '/imgs/cluster.svg',
      data: {
        deviceType: 'cluster',
        bindable: true,
        cascadeParent: 'stack',
        binding: {
          deviceId: 'cluster001',
          deviceType: 'cluster',
          deviceName: '电池簇-1-1',
          parentDeviceId: 'stack001'
        }
      },
      style: {},
      zIndex: 3,
      rotate: 0,
      initialWidth: 50,
      initialHeight: 50,
      baseFontSize: 12
    },
    {
      id: 'node_1770552073772',
      type: 'cluster',
      x: 824,
      y: 254,
      width: 50,
      height: 50,
      text: '电池簇-1-2',
      icon: '/imgs/cluster.svg',
      data: {
        deviceType: 'cluster',
        bindable: true,
        cascadeParent: 'stack',
        binding: {
          deviceId: 'cluster002',
          deviceType: 'cluster',
          deviceName: '电池簇-1-2',
          parentDeviceId: 'stack001'
        }
      },
      style: {},
      zIndex: 4,
      rotate: 0,
      initialWidth: 50,
      initialHeight: 50,
      baseFontSize: 12
    },
    {
      id: 'node_1770552075639',
      type: 'cluster',
      x: 827.11,
      y: 463.87,
      width: 50,
      height: 50,
      text: '电池簇-2-2',
      icon: '/imgs/cluster.svg',
      data: {
        deviceType: 'cluster',
        bindable: true,
        cascadeParent: 'stack',
        binding: {
          deviceId: 'cluster004',
          deviceType: 'cluster',
          deviceName: '电池簇-2-2',
          parentDeviceId: 'stack002'
        }
      },
      style: {},
      zIndex: 5,
      rotate: 0,
      initialWidth: 50,
      initialHeight: 50,
      baseFontSize: 12
    },
    {
      id: 'node_1770552093689',
      type: 'pcs',
      x: 668.78,
      y: 616.03,
      width: 60,
      height: 60,
      text: 'PCS-2',
      icon: '/imgs/PCS.svg',
      data: {
        deviceType: 'pcs',
        bindable: true,
        binding: {
          deviceId: 'pcs002',
          deviceType: 'pcs',
          deviceName: 'PCS-2',
          parentDeviceId: null
        }
      },
      style: {},
      zIndex: 6,
      rotate: 32.01,
      initialWidth: 60,
      initialHeight: 60,
      baseFontSize: 12
    },
    {
      id: 'node_1770552097388',
      type: 'pcs',
      x: 87.9,
      y: 254.13,
      width: 62,
      height: 71,
      text: 'PCS-1',
      icon: '/imgs/PCS.svg',
      data: {
        deviceType: 'pcs',
        bindable: true,
        binding: {
          deviceId: 'pcs001',
          deviceType: 'pcs',
          deviceName: 'PCS-1',
          parentDeviceId: null
        }
      },
      style: {},
      zIndex: 7,
      rotate: 336.43,
      initialWidth: 60,
      initialHeight: 60,
      baseFontSize: 12
    },
    {
      id: 'node_1770552313639',
      type: 'pv',
      x: 86.87,
      y: 481.35,
      width: 69.08,
      height: 78.3,
      text: '光伏',
      icon: '/imgs/pv.svg',
      data: {
        deviceType: 'pv',
        bindable: true,
        binding: {
          deviceId: 'pv001',
          deviceType: 'pv',
          deviceName: '光伏-1',
          parentDeviceId: null
        }
      },
      style: {},
      zIndex: 8,
      rotate: 33.69,
      initialWidth: 60,
      initialHeight: 60,
      baseFontSize: 12
    }
  ],
  links: [
    {
      id: 'link_1770552111422',
      source: 'node_1770552053705',
      target: 'node_1770552097388',
      type: 'orthogonal',
      style: { stroke: '#666', strokeWidth: 2 },
      data: {}
    },
    {
      id: 'link_1770552115256',
      source: 'node_1770552053705',
      target: 'node_1770552045673',
      type: 'straight',
      style: { stroke: '#666', strokeWidth: 2 },
      data: {}
    },
    {
      id: 'link_1770552120188',
      source: 'node_1770552053705',
      target: 'node_1770552070021',
      type: 'straight',
      style: { stroke: '#666', strokeWidth: 2 },
      data: {}
    },
    {
      id: 'link_1770552122622',
      source: 'node_1770552075639',
      target: 'node_1770552070021',
      type: 'straight',
      style: { stroke: '#666', strokeWidth: 2 },
      data: {}
    },
    {
      id: 'link_1770552138473',
      source: 'node_1770552045673',
      target: 'node_1770552071687',
      type: 'curve',
      style: { stroke: '#666', strokeWidth: 2 },
      data: { controlPoint: { x: 644.79, y: 77.76 } }
    },
    {
      id: 'link_1770552141306',
      source: 'node_1770552045673',
      target: 'node_1770552073772',
      type: 'orthogonal',
      style: { stroke: '#666', strokeWidth: 2 },
      data: {}
    },
    {
      id: 'link_1770552146039',
      source: 'node_1770552053705',
      target: 'node_1770552093689',
      type: 'straight',
      style: { stroke: '#666', strokeWidth: 2, dasharray: '6,3' },
      data: {}
    },
    {
      id: 'link_1770552325871',
      source: 'node_1770552053705',
      target: 'node_1770552313639',
      type: 'orthogonal',
      style: { stroke: '#666', strokeWidth: 2 },
      data: {}
    }
  ]
}
