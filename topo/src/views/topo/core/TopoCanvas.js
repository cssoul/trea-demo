/**
 * TopoCanvas - 基于 D3.js 的拓扑图画布管理类
 *
 * 职责：
 *  - SVG 画布创建、缩放、平移
 *  - 节点的渲染、拖拽、选中、缩放、旋转
 *  - 连线的渲染、增删、选中
 *  - 连线模式（点击源节点出现连接点，拖动到目标节点建立连线）
 *  - 事件系统
 *
 * 支持两种模式：
 *  - editor: 编辑模式（可拖拽、可连线、可右键、显示选择框/缩放手柄）
 *  - viewer: 查看模式（只读，可缩放平移，可点击弹窗）
 */
import * as d3 from 'd3'
import { NODE_TYPES } from '../config/nodeConfig'

export default class TopoCanvas {
  constructor(container, options = {}) {
    this.container = container
    this.mode = options.mode || 'editor' // 'editor' | 'viewer'
    this.readonly = this.mode === 'viewer'

    // 数据
    this.nodes = []
    this.links = []
    this.selectedNodeId = null
    this.selectedLinkId = null

    // 连线模式
    this.linkMode = false
    this.linkSourceId = null
    this.tempLink = null

    // 缩放
    this.transform = d3.zoomIdentity
    this.minScale = 0.2
    this.maxScale = 4

    // 事件回调
    this._listeners = {}

    // D3 selection 引用
    this.svg = null
    this.zoomG = null
    this.gridRect = null
    this.linksG = null
    this.nodesG = null
    this.overlayG = null
    this.zoomBehavior = null

    this._init()
  }

  // ============ 事件系统 ============
  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = []
    this._listeners[event].push(cb)
    return this
  }
  off(event, cb) {
    if (!this._listeners[event]) return this
    this._listeners[event] = this._listeners[event].filter((f) => f !== cb)
    return this
  }
  emit(event, payload) {
    ;(this._listeners[event] || []).forEach((cb) => {
      try {
        cb(payload)
      } catch (e) {
        console.error('[TopoCanvas] listener error', e)
      }
    })
  }

  // ============ 初始化 ============
  _init() {
    const width = this.container.clientWidth
    const height = this.container.clientHeight

    this.width = width
    this.height = height

    this.svg = d3
      .select(this.container)
      .append('svg')
      .attr('class', 'topo-svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .style('display', 'block')
      .style('cursor', this.readonly ? 'grab' : 'default')

    // defs：网格 pattern、滤镜
    const defs = this.svg.append('defs')

    // 小网格
    const smallGrid = defs
      .append('pattern')
      .attr('id', 'topo-grid-small')
      .attr('width', 20)
      .attr('height', 20)
      .attr('patternUnits', 'userSpaceOnUse')
    smallGrid.append('path').attr('d', 'M 20 0 L 0 0 0 20').attr('fill', 'none').attr('stroke', 'var(--grid-line)').attr('stroke-width', 1)

    // 大网格
    const bigGrid = defs
      .append('pattern')
      .attr('id', 'topo-grid-big')
      .attr('width', 100)
      .attr('height', 100)
      .attr('patternUnits', 'userSpaceOnUse')
    bigGrid.append('rect').attr('width', 100).attr('height', 100).attr('fill', 'url(#topo-grid-small)')
    bigGrid.append('path').attr('d', 'M 100 0 L 0 0 0 100').attr('fill', 'none').attr('stroke', 'var(--grid-major)').attr('stroke-width', 1)

    // glow 滤镜
    const glow = defs
      .append('filter')
      .attr('id', 'topo-glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%')
    glow.append('feGaussianBlur').attr('stdDeviation', '2.5').attr('result', 'blur')
    const merge = glow.append('feMerge')
    merge.append('feMergeNode').attr('in', 'blur')
    merge.append('feMergeNode').attr('in', 'SourceGraphic')

    // 网格背景（覆盖整个视口，不随缩放）
    this.gridRect = this.svg
      .append('rect')
      .attr('class', 'topo-grid-bg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('fill', 'url(#topo-grid-big)')
      .style('pointer-events', 'all')

    // 缩放/平移的根 g
    this.zoomG = this.svg.append('g').attr('class', 'topo-zoom-layer')

    // 连线层 / 节点层 / 覆盖层（临时连线等）
    this.linksG = this.zoomG.append('g').attr('class', 'topo-links-layer')
    this.nodesG = this.zoomG.append('g').attr('class', 'topo-nodes-layer')
    this.overlayG = this.zoomG.append('g').attr('class', 'topo-overlay-layer')

    // zoom 行为
    this.zoomBehavior = d3
      .zoom()
      .scaleExtent([this.minScale, this.maxScale])
      .on('zoom', (event) => {
        this.transform = event.transform
        this.zoomG.attr('transform', event.transform)
        this.emit('zoom', { transform: event.transform })
      })

    this.svg.call(this.zoomBehavior)

    // 点击空白处取消选中
    this.svg.on('click', (event) => {
      if (event.target === this.svg.node() || event.target === this.gridRect.node()) {
        this.clearSelection()
        if (this.linkMode && this.linkSourceId) {
          this._clearLinkSource()
        }
      }
    })

    // 右键
    if (!this.readonly) {
      this.svg.on('contextmenu', (event) => {
        event.preventDefault()
      })
    }

    // 监听容器尺寸变化
    this._resizeObserver = new ResizeObserver(() => this._onResize())
    this._resizeObserver.observe(this.container)
  }

  _onResize() {
    // SVG 是 100%，无需调整尺寸，仅触发事件
    this.emit('resize')
  }

  // ============ 数据加载 ============
  setData(data) {
    this.nodes = (data && data.nodes ? data.nodes : []).slice()
    this.links = (data && data.links ? data.links : []).slice()
    this.selectedNodeId = null
    this.selectedLinkId = null
    this.render()
  }

  getData() {
    return {
      nodes: this.nodes.map((n) => this._cloneNode(n)),
      links: this.links.map((l) => ({ ...l, style: { ...l.style }, data: { ...l.data } }))
    }
  }

  _cloneNode(n) {
    return {
      ...n,
      style: { ...n.style },
      data: {
        ...n.data,
        binding: n.data.binding ? { ...n.data.binding } : null
      }
    }
  }

  // ============ 节点查询 ============
  getNode(id) {
    return this.nodes.find((n) => n.id === id)
  }
  getLink(id) {
    return this.links.find((l) => l.id === id)
  }

  // ============ 渲染 ============
  render() {
    this._renderLinks()
    this._renderNodes()
    this._renderLinkHandles()
  }

  // ---- 节点中心点 ----
  _nodeCenter(node) {
    return { x: node.x + node.width / 2, y: node.y + node.height / 2 }
  }

  // ---- 连线路径计算 ----
  _linkPath(link) {
    const s = this.getNode(link.source)
    const t = this.getNode(link.target)
    if (!s || !t) return ''
    const sc = this._nodeCenter(s)
    const tc = this._nodeCenter(t)

    if (link.type === 'curve') {
      const cp = (link.data && link.data.controlPoint) || {
        x: (sc.x + tc.x) / 2,
        y: Math.min(sc.y, tc.y) - 60
      }
      return `M ${sc.x} ${sc.y} Q ${cp.x} ${cp.y} ${tc.x} ${tc.y}`
    }
    if (link.type === 'orthogonal') {
      const midX = (sc.x + tc.x) / 2
      return `M ${sc.x} ${sc.y} L ${midX} ${sc.y} L ${midX} ${tc.y} L ${tc.x} ${tc.y}`
    }
    return `M ${sc.x} ${sc.y} L ${tc.x} ${tc.y}`
  }

  _renderLinks() {
    const sel = this.linksG.selectAll('g.topo-link').data(this.links, (d) => d.id)

    sel.exit().remove()

    const enter = sel
      .enter()
      .append('g')
      .attr('class', 'topo-link')
      .style('cursor', this.readonly ? 'pointer' : 'default')

    // 命中区（透明粗线，便于点击）
    enter
      .append('path')
      .attr('class', 'topo-link-hit')
      .attr('fill', 'none')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 14)
      .style('pointer-events', 'stroke')

    // 可见线
    enter
      .append('path')
      .attr('class', 'topo-link-line')
      .attr('fill', 'none')

    // 流动效果层（用于动画）
    enter
      .append('path')
      .attr('class', 'topo-link-flow')
      .attr('fill', 'none')
      .style('pointer-events', 'none')

    const merged = enter.merge(sel)

    merged
      .select('.topo-link-hit')
      .attr('d', (d) => this._linkPath(d))
      .on('click', (event, d) => {
        event.stopPropagation()
        if (this.readonly) return
        this._selectLink(d.id)
      })

    merged
      .select('.topo-link-line')
      .attr('d', (d) => this._linkPath(d))
      .attr('stroke', (d) => {
        if (d.id === this.selectedLinkId) return 'var(--accent-cyan)'
        return (d.style && d.style.stroke) || '#666'
      })
      .attr('stroke-width', (d) => (d.style && d.style.strokeWidth) || 2)
      .attr('stroke-dasharray', (d) => {
        const da = d.style && d.style.dasharray
        return da && da !== '' ? da : null
      })

    merged
      .select('.topo-link-flow')
      .attr('d', (d) => this._linkPath(d))
      .attr('stroke', 'var(--accent-cyan)')
      .attr('stroke-width', (d) => (d.style && d.style.strokeWidth ? d.style.strokeWidth + 1 : 3))
      .attr('stroke-dasharray', '8 12')
      .attr('opacity', 0)

    // 选中态
    merged.classed('selected', (d) => d.id === this.selectedLinkId)
  }

  // ---- 节点渲染 ----
  _renderNodes() {
    const sel = this.nodesG.selectAll('g.topo-node').data(this.nodes, (d) => d.id)
    sel.exit().remove()

    const enter = sel
      .enter()
      .append('g')
      .attr('class', 'topo-node')
      .style('cursor', this.readonly ? 'pointer' : 'move')

    // 文本标签（line/busbar/text 不显示），放在外层（不参与旋转）
    enter
      .append('text')
      .attr('class', 'topo-node-label')
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--text-primary)')
      .attr('font-family', 'var(--font-display)')
      .attr('font-size', 12)
      .attr('font-weight', 500)
      .style('pointer-events', 'none')
      .style('user-select', 'none')

    // 旋转子组：内容、选中框、告警框、缩放手柄都放在这里，整体一起旋转
    enter.append('g').attr('class', 'topo-node-rotator')

    // 外层旋转句柄组（杆子 + 圆点），不跟随元素旋转，位置根据当前旋转角度计算，始终指向鼠标方向
    if (!this.readonly) {
      const rotHandleG = enter.append('g').attr('class', 'topo-rot-handles').style('opacity', 0)
      // 旋转杆（直线）
      rotHandleG
        .append('line')
        .attr('class', 'topo-rot-line')
        .attr('stroke', 'var(--accent-cyan)')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '3 2')
        .attr('opacity', 0.6)
        .style('pointer-events', 'none')
      // 旋转圆点
      rotHandleG
        .append('circle')
        .attr('class', 'topo-handle topo-handle-rotate')
        .attr('r', 7)
        .attr('fill', 'var(--accent-cyan)')
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5)
        .style('cursor', 'grab')
        .style('filter', 'drop-shadow(0 0 4px var(--accent-cyan-glow))')
      // 圆点内旋转图标
      rotHandleG
        .append('text')
        .attr('class', 'topo-rot-icon')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('font-size', 9)
        .attr('fill', '#0a1428')
        .style('font-weight', 700)
        .style('pointer-events', 'none')
        .style('user-select', 'none')
        .text('↻')
    }

    const merged = enter.merge(sel)

    // 更新外层位置
    merged.attr('transform', (d) => `translate(${d.x}, ${d.y})`)

    // 标签：line/busbar/text 不显示文本，放外层保持水平
    const HIDE_LABEL_TYPES = ['line', 'busbar', 'text']
    merged
      .select('.topo-node-label')
      .text((d) => (HIDE_LABEL_TYPES.includes(d.type) ? '' : d.text || ''))
      .attr('x', (d) => d.width / 2)
      .attr('y', (d) => d.height + 16)

    // 旋转子组渲染内容、选中框、告警框、手柄
    merged.each((d, i, nodes) => {
      const nodeG = d3.select(nodes[i])
      const rotatorG = nodeG.select('.topo-node-rotator')

      // 内容组（首次进入时不存在才创建）
      let contentG = rotatorG.select('.topo-node-content')
      if (contentG.empty()) {
        contentG = rotatorG.append('g').attr('class', 'topo-node-content')
      }
      this._renderNodeContent(contentG, d)
      // 选中框（首次进入时创建）
      let selectionG = rotatorG.select('.topo-node-selection')
      if (selectionG.empty()) {
        selectionG = rotatorG
          .append('rect')
          .attr('class', 'topo-node-selection')
          .attr('fill', 'none')
          .attr('stroke', 'var(--accent-emerald)')
          .attr('stroke-width', 1.5)
          .attr('opacity', 0)
      }
      // 告警指示（右上角闪烁图标，使用 alarm.png 图片）
      let alarmG = rotatorG.select('.topo-node-alarm')
      if (alarmG.empty()) {
        alarmG = rotatorG
          .append('image')
          .attr('class', 'topo-node-alarm')
          .attr('href', '/imgs/alarm.png')
          .attr('preserveAspectRatio', 'xMidYMid meet')
          .attr('opacity', 0)
      }

      // 应用旋转（围绕节点中心）
      const angle = d.rotate || 0
      rotatorG.attr('transform', `rotate(${angle} ${d.width / 2} ${d.height / 2})`)

      // 选中框尺寸 + 位置（-4 边距包住元素）
      selectionG
        .attr('x', -4)
        .attr('y', -4)
        .attr('width', d.width + 8)
        .attr('height', d.height + 8)
        .attr('rx', 4)
        .attr('opacity', d.id === this.selectedNodeId ? 1 : 0)

      // 告警图标
      const alarmSize = Math.max(24, Math.min(40, Math.min(d.width, d.height) * 0.4))
      alarmG
        .attr('width', alarmSize)
        .attr('height', alarmSize)
        .attr('x', d.width / 2)
        .attr('y', d.height / 2 - alarmSize)

      // 4 角缩放手柄（放在旋转子组内跟随元素一起旋转）
      if (!this.readonly) {
        let handlesG = rotatorG.select('.topo-node-handles')
        if (handlesG.empty()) {
          handlesG = rotatorG.append('g').attr('class', 'topo-node-handles').style('opacity', 0)
          ;['nw', 'ne', 'sw', 'se'].forEach((pos) => {
            handlesG
              .append('rect')
              .attr('class', `topo-handle topo-handle-${pos}`)
              .attr('width', 8)
              .attr('height', 8)
              .attr('fill', 'var(--accent-amber)')
              .attr('stroke', '#fff')
              .attr('stroke-width', 1)
              .style('cursor', this._handleCursor(pos))
          })
        }
        // 仅选中时显示并启用手柄；未选中时禁用 pointer-events
        const isSelected = d.id === this.selectedNodeId
        handlesG.style('opacity', isSelected ? 1 : 0)
        handlesG.style('pointer-events', isSelected ? 'all' : 'none')
        // 4 角缩放手柄位置：贴在选中框四个角
        handlesG.select('.topo-handle-nw').attr('x', -8).attr('y', -8)
        handlesG.select('.topo-handle-ne').attr('x', d.width - 0).attr('y', -8)
        handlesG.select('.topo-handle-sw').attr('x', -8).attr('y', d.height - 0)
        handlesG.select('.topo-handle-se').attr('x', d.width - 0).attr('y', d.height - 0)
      }

      // 外层旋转句柄位置：杆子 + 圆点始终指向当前旋转角度方向，跟随鼠标，避免旋转时闪烁
      if (!this.readonly) {
        this._updateRotHandle(nodeG, d)
      }
    })

    // 绑定事件
    if (!this.readonly) {
      merged
        .on('click', (event, d) => {
          event.stopPropagation()
          this._selectNode(d.id)
        })
        .on('contextmenu', (event, d) => {
          event.preventDefault()
          event.stopPropagation()
          this._selectNode(d.id)
          this.emit('contextmenu', { event, node: d, x: event.offsetX, y: event.offsetY })
        })
        .call(this._nodeDragBehavior())
      // 缩放手柄拖拽
      merged.selectAll('.topo-handle-nw, .topo-handle-ne, .topo-handle-sw, .topo-handle-se').call(this._resizeBehavior())
      // 旋转句柄（上方圆点）拖拽旋转
      merged.selectAll('.topo-handle-rotate').call(this._rotateBehavior())
    } else {
      merged.on('click', (event, d) => {
        event.stopPropagation()
        this.emit('nodeClick', { node: d, event })
      })
    }

    // 连线模式下显示连接点（位于旋转子组内，跟随节点一起旋转）
    merged.each((d, i, nodes) => {
      const rotatorG = d3.select(nodes[i]).select('.topo-node-rotator')
      rotatorG.selectAll('.topo-link-point').remove()
      if (this.linkMode) {
        rotatorG
          .append('circle')
          .attr('class', 'topo-link-point')
          .attr('cx', d.width / 2)
          .attr('cy', d.height / 2)
          .attr('r', 6)
          .attr('fill', 'var(--accent-cyan)')
          .attr('stroke', '#fff')
          .attr('stroke-width', 1.5)
          .style('cursor', 'crosshair')
          .style('filter', 'drop-shadow(0 0 6px var(--accent-cyan-glow))')
          .style('opacity', d.id === this.linkSourceId ? 1 : 0.6)
          .on('click', (event, dd) => {
            event.stopPropagation()
            this._startLinkFrom(dd.id)
          })
      }
    })
  }

  _handleCursor(pos) {
    return { nw: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', se: 'nwse-resize' }[pos]
  }

  /**
   * 更新外层旋转句柄（杆子 + 圆点）的位置。
   * 圆点沿元素中心按当前旋转角度方向放置（始终指向鼠标），距离固定，
   * 从而避免旋转时圆点被旋转子组带着一起转导致的抖动/闪烁。
   * @param {d3.Selection} nodeG 外层 g（topo-node，已 translate 到节点左上角）
   * @param {Object} d 节点数据
   */
  _updateRotHandle(nodeG, d) {
    const rotHandleG = nodeG.select('.topo-rot-handles')
    rotHandleG.style('opacity', d.id === this.selectedNodeId ? 1 : 0)
    const ROT_RADIUS = Math.max(d.width, d.height) / 2 + 28 // 圆点到元素中心的固定距离（随元素大小微调，保证在元素外）
    const theta = ((d.rotate || 0) * Math.PI) / 180
    // 元素中心局部坐标
    const cx = d.width / 2
    const cy = d.height / 2
    // 0°=顶部(-y)，顺时针：x 偏移 +R*sin，y 偏移 -R*cos
    const hx = cx + ROT_RADIUS * Math.sin(theta)
    const hy = cy - ROT_RADIUS * Math.cos(theta)
    rotHandleG.select('.topo-handle-rotate').attr('cx', hx).attr('cy', hy)
    rotHandleG.select('.topo-rot-icon').attr('x', hx).attr('y', hy + 0.5)
    // 杆子：从元素中心到圆点
    rotHandleG.select('.topo-rot-line').attr('x1', cx).attr('y1', cy).attr('x2', hx).attr('y2', hy)
  }

  // ---- 单个节点内容渲染 ----
  _renderNodeContent(selection, node) {
    selection.selectAll('*').remove()
    const type = node.type

    if (type === 'busbar') {
      // 母线：默认白色实心矩形，颜色可由 style.stroke 配置
      const color = (node.style && node.style.stroke) || '#ffffff'
      selection
        .append('rect')
        .attr('width', node.width)
        .attr('height', node.height)
        .attr('rx', 1)
        .attr('fill', color)
        .attr('stroke', color)
        .attr('stroke-width', 0.5)
      // 顶部细微高光
      selection
        .append('rect')
        .attr('y', node.height * 0.2)
        .attr('width', node.width)
        .attr('height', Math.max(1, node.height * 0.15))
        .attr('fill', '#ffffff')
        .attr('opacity', 0.25)
      return
    }

    if (type === 'line') {
      // 直线：默认白色实心矩形，颜色可由 style.stroke 配置
      const color = (node.style && node.style.stroke) || '#ffffff'
      selection
        .append('rect')
        .attr('width', node.width)
        .attr('height', node.height)
        .attr('fill', color)
        .attr('stroke', color)
        .attr('stroke-width', 0.5)
      return
    }

    if (type === 'text') {
      // 字号随节点高度等比缩放，最小12px
      const baseSize = (node.style && node.style.fontSize) || node.baseFontSize || 12
      const initHeight = node.initialHeight || node.height
      const fontSize = Math.max(12, baseSize * (node.height / initHeight))
      // 将计算出的字号与当前高度写回节点，并让属性面板同步显示
      if (!node.style) node.style = {}
      node.style.fontSize = Math.round(fontSize)
      node.initialHeight = node.height
      selection
        .append('text')
        .attr('x', node.width / 2)
        .attr('y', node.height / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', (node.style && node.style.fill) || 'var(--text-primary)')
        .attr('font-family', 'var(--font-display)')
        .attr('font-size', fontSize)
        .attr('font-weight', 600)
        .text(node.text || '')
      return
    }

    // 电池类节点（stack/cluster）：用电池 SVG 渲染（外壳 + 渐变填充 + 充放电动效）
    if (type === 'stack' || type === 'cluster') {
      this._renderBatteryNode(selection, node)
      // 设备数据徽章容器（右上角）
      selection.append('g').attr('class', 'topo-node-badge')
      return
    }

    // 其他设备类节点：图片 icon
    const config = NODE_TYPES[type]
    const icon = node.icon || (config && config.icon)
    if (icon) {
      const img = selection
        .append('image')
        .attr('href', icon)
        .attr('width', node.width)
        .attr('height', node.height)
        .attr('preserveAspectRatio', 'xMidYMid meet')
      // 旋转统一由内容组应用
      img.style('cursor', this.readonly ? 'pointer' : 'move')
    }

    // 设备数据徽章容器（右上角）
    selection.append('g').attr('class', 'topo-node-badge')
  }

  /**
   * 渲染电池类节点（stack/cluster）：外壳 + 顶部小帽 + 渐变填充。
   * 填充高度由 node.data.batterySoc（0-1）控制，充放电动效由 AnimationManager 驱动。
   * @param {d3.Selection} selection 节点内容组
   * @param {Object} node 节点数据
   */
  _renderBatteryNode(selection, node) {
    // 电池以 viewBox 0 0 72 72 绘制：外壳 M14 12H58V68H14z，填充区 y 24-68(高44)
    // 用 <g> 包裹并按节点宽高等比缩放居中，保证随节点尺寸变化且不失真
    const scale = Math.min(node.width / 72, node.height / 72)
    const offsetX = (node.width - 72 * scale) / 2
    const offsetY = (node.height - 72 * scale) / 2
    const box = selection.append('g').attr('class', 'topo-battery').attr('transform', `translate(${offsetX},${offsetY}) scale(${scale})`)

    // 外壳（描边）
    box
      .append('path')
      .attr('class', 'topo-battery-body')
      .attr('d', 'M14 12H58V68H14z')
      .attr('fill', '#1a2236')
      .attr('stroke', 'rgba(0,253,67,0.75)')
      .attr('stroke-width', 2)
      .attr('stroke-linecap', 'square')
    // 顶部小帽（填充背景色）
    box
      .append('path')
      .attr('class', 'topo-battery-cap')
      .attr('d', 'M28 4H44V12H28z')
      .attr('fill', '#1a2236')
      .attr('stroke', 'rgba(0,253,67,0.75)')
      .attr('stroke-width', 2)
      .attr('stroke-linecap', 'square')
    // 填充区（SOC 高度），纯色，颜色由 SOC 分档决定（初始用默认绿）
    box
      .append('rect')
      .attr('class', 'topo-battery-fill')
      .attr('x', 15)
      .attr('width', 42)
      .attr('y', 68)
      .attr('height', 0)
      .attr('rx', 0)

    // 记录节点电池状态（soc 0-1，charge 1/-1/0），供 AnimationManager 驱动
    if (!node.data) node.data = {}
    // 默认给一个 SOC 高度
    const defaultSoc = 0.8
    if (node.data.batterySoc == null) node.data.batterySoc = defaultSoc
    if (node.data.batteryCharge == null) node.data.batteryCharge = 0
    // 按默认 SOC 设置初始填充高度与颜色
    box.select('.topo-battery-fill').attr('fill', this._batteryColor(node.data.batterySoc))
    this._setBatteryFill(box.select('.topo-battery-fill'), node.data.batterySoc)

    // 用 CSS 过渡实现静置/切换时的平滑升降
    box.select('.topo-battery-fill').style('transition', 'y 0.8s ease, height 0.8s ease')
  }

  /**
   * 根据 SOC 返回电池填充纯色：
   * 0.2 以下红色，0.2-0.6 橙色，0.6 以上绿色
   * @param {number} soc 0-1
   */
  _batteryColor(soc) {
    const s = Math.max(0, Math.min(1, soc == null ? 0 : soc))
    if (s < 0.2) return '#ff3b30' // 红
    if (s <= 0.6) return '#ff9500' // 橙
    return '#00fd43' // 绿
  }

  // ============ 选择 ============
  _selectNode(id) {
    this.selectedNodeId = id
    this.selectedLinkId = null
    this._renderNodes()
    this._renderLinks()
    this._renderLinkHandles()
    const node = this.getNode(id)
    this.emit('select', { type: 'node', node })
  }

  _selectLink(id) {
    this.selectedLinkId = id
    this.selectedNodeId = null
    this._renderNodes()
    this._renderLinks()
    this._renderLinkHandles()
    const link = this.getLink(id)
    this.emit('select', { type: 'link', link })
  }

  clearSelection() {
    this.selectedNodeId = null
    this.selectedLinkId = null
    this._renderNodes()
    this._renderLinks()
    this._renderLinkHandles()
    this.emit('select', { type: 'none' })
  }

  selectNode(id) {
    this._selectNode(id)
  }
  selectLink(id) {
    this._selectLink(id)
  }

  // ============ 节点拖拽 ============
  _nodeDragBehavior() {
    const self = this
    return d3
      .drag()
      .on('start', function (event, d) {
        if (self.linkMode) return // 连线模式下不拖拽节点
        d3.select(this).raise()
        // event.x/event.y 是父级（zoomG）坐标系下的鼠标位置
        // 记录鼠标按下时在节点内的偏移，避免松手后位置跳变
        self._dragStart = {
          x: d.x,
          y: d.y,
          offsetX: event.x - d.x,
          offsetY: event.y - d.y
        }
        self.emit('nodeDragStart', { node: d })
      })
      .on('drag', function (event, d) {
        if (self.linkMode) return
        d.x = event.x - self._dragStart.offsetX
        d.y = event.y - self._dragStart.offsetY
        d3.select(this).attr('transform', `translate(${d.x}, ${d.y})`)
        // 同步更新相连的连线
        self._updateLinksForNode(d.id)
        // 实时通知面板
        self.emit('nodeDrag', { node: d })
      })
      .on('end', function (event, d) {
        if (self.linkMode) return
        self.emit('nodeDragEnd', { node: d, start: self._dragStart })
      })
  }

  _updateLinksForNode(nodeId) {
    const affected = this.links.filter((l) => l.source === nodeId || l.target === nodeId)
    if (!affected.length) return
    const self = this
    const sel = this.linksG.selectAll('g.topo-link').filter((d) => affected.some((a) => a.id === d.id))
    sel.each(function (d) {
      const g = d3.select(this)
      const path = self._linkPath(d)
      g.select('.topo-link-hit').attr('d', path)
      g.select('.topo-link-line').attr('d', path)
      g.select('.topo-link-flow').attr('d', path)
    })
    // 若被影响的是当前选中的曲线，刷新曲线句柄
    if (this.selectedLinkId && affected.some((l) => l.id === this.selectedLinkId)) {
      this._renderLinkHandles()
    }
  }

  // ============ 缩放手柄 ============
  _resizeBehavior() {
    const self = this
    return d3
      .drag()
      .on('start', function (event, d) {
        event.sourceEvent.stopPropagation()
        self._resizeStart = {
          x: d.x,
          y: d.y,
          width: d.width,
          height: d.height,
          // 记录鼠标按下时父级坐标位置
          startMx: event.x,
          startMy: event.y,
          handle: d3.select(this).attr('class').split(' ').pop().replace('topo-handle-', '')
        }
      })
      .on('drag', function (event, d) {
        event.sourceEvent.stopPropagation()
        const s = self._resizeStart
        let { x, y, width, height } = s
        // 鼠标在父级坐标系下相对于拖拽起点的位移
        const dx = event.x - s.startMx
        const dy = event.y - s.startMy
        if (s.handle.includes('e')) width = Math.max(20, s.width + dx)
        if (s.handle.includes('s')) height = Math.max(20, s.height + dy)
        if (s.handle.includes('w')) {
          width = Math.max(20, s.width - dx)
          x = s.x + dx
        }
        if (s.handle.includes('n')) {
          height = Math.max(20, s.height - dy)
          y = s.y + dy
        }
        // 按节点配置限制缩放方向
        const config = NODE_TYPES[d.type]
        if (config) {
          if (config.resizable === 'horizontal') {
            height = s.height
            y = s.y
          } else if (config.resizable === 'vertical') {
            width = s.width
            x = s.x
          }
        }
        d.x = x
        d.y = y
        d.width = width
        d.height = height
        self._renderNodes()
        self._updateLinksForNode(d.id)
        // 实时通知面板
        self.emit('nodeResize', { node: d })
      })
      .on('end', function (event, d) {
        event.sourceEvent.stopPropagation()
        self.emit('nodeResizeEnd', { node: d, start: self._resizeStart })
      })
  }

  // ============ 旋转手柄（外层圆点拖动，元素跟随鼠标角度旋转） ============
  _rotateBehavior() {
    const self = this
    return d3
      .drag()
      .on('start', function (event) {
        event.sourceEvent.stopPropagation()
        d3.select(this.parentNode).raise()
      })
      .on('drag', function (event, d) {
        event.sourceEvent.stopPropagation()
        const cx = d.x + d.width / 2
        const cy = d.y + d.height / 2
        // 鼠标相对节点中心的角度，顶部为 0°，顺时针为正
        let angle = (Math.atan2(event.y - cy, event.x - cx) * 180) / Math.PI + 90
        angle = (angle + 360) % 360
        d.rotate = angle
        // 圆点位于外层 topo-rot-handles，其父节点是 topo-node（已 translate），再查其内的 rotator
        const nodeG = d3.select(this.parentNode.parentNode)
        const rotatorG = nodeG.select('.topo-node-rotator')
        if (!rotatorG.empty()) {
          rotatorG.attr('transform', `rotate(${angle} ${d.width / 2} ${d.height / 2})`)
        }
        // 同步更新外层旋转句柄位置，让圆点始终指向鼠标方向
        self._updateRotHandle(nodeG, d)
        // 实时通知面板
        self.emit('nodeRotate', { node: d })
      })
      .on('end', function (event, d) {
        event.sourceEvent.stopPropagation()
        self.emit('nodeRotateEnd', { node: d })
      })
  }

  // ============ 节点增删改 ============
  addNode(node) {
    this.nodes.push(node)
    this._renderNodes()
    this._selectNode(node.id)
    return node
  }

  removeNode(id) {
    this.nodes = this.nodes.filter((n) => n.id !== id)
    this.links = this.links.filter((l) => l.source !== id && l.target !== id)
    if (this.selectedNodeId === id) this.selectedNodeId = null
    this.render()
    this.emit('nodeRemoved', { id })
  }

  updateNode(id, patch) {
    const node = this.getNode(id)
    if (!node) return
    Object.keys(patch).forEach((key) => {
      if (key === 'style' || key === 'data') {
        node[key] = { ...node[key], ...patch[key] }
      } else {
        node[key] = patch[key]
      }
    })
    // 旋转角度归一化
    if (patch.rotate != null) {
      node.rotate = ((Number(patch.rotate) || 0) + 360) % 360
    }
    this._renderNodes()
    this._updateLinksForNode(id)
  }

  // ============ 连线增删改 ============
  addLink(link) {
    this.links.push(link)
    this._renderLinks()
    this.emit('linkAdded', { link })
    return link
  }

  removeLink(id) {
    this.links = this.links.filter((l) => l.id !== id)
    if (this.selectedLinkId === id) this.selectedLinkId = null
    this._renderLinks()
    this._renderLinkHandles()
    this.emit('linkRemoved', { id })
  }

  updateLink(linkId, patch) {
    const link = this.getLink(linkId)
    if (!link) return
    // 切换为曲线时，若没有控制点，给一个默认值
    if (patch.type === 'curve' && (!link.data || !link.data.controlPoint)) {
      const cp = this._defaultControlPoint(link)
      link.data = { ...(link.data || {}), controlPoint: cp }
    }
    // 切换为非曲线时，移除控制点句柄
    if (patch.type && patch.type !== 'curve') {
      this._renderLinkHandles()
    }
    Object.keys(patch).forEach((key) => {
      if (key === 'style' || key === 'data') {
        link[key] = { ...(link[key] || {}), ...patch[key] }
      } else {
        link[key] = patch[key]
      }
    })
    this._renderLinks()
    this._renderLinkHandles()
  }

  // ---- 默认控制点（用于曲线） ----
  _defaultControlPoint(link) {
    const s = this.getNode(link.source)
    const t = this.getNode(link.target)
    if (!s || !t) return { x: 0, y: 0 }
    const sc = this._nodeCenter(s)
    const tc = this._nodeCenter(t)
    return { x: (sc.x + tc.x) / 2, y: Math.min(sc.y, tc.y) - 60 }
  }

  // ---- 单条连线 path 刷新 ----
  _updateLinkPath(linkId) {
    const link = this.getLink(linkId)
    if (!link) return
    const sel = this.linksG.selectAll('g.topo-link').filter((d) => d.id === linkId)
    const path = this._linkPath(link)
    sel.select('.topo-link-hit').attr('d', path)
    sel.select('.topo-link-line').attr('d', path)
    sel.select('.topo-link-flow').attr('d', path)
  }

  // ---- 曲线弧度句柄 ----
  _renderLinkHandles() {
    this.linksG.selectAll('.topo-curve-handle').remove()
    if (this.readonly) return
    if (!this.selectedLinkId) return
    const link = this.getLink(this.selectedLinkId)
    if (!link || link.type !== 'curve') return
    const cp = (link.data && link.data.controlPoint) || this._defaultControlPoint(link)
    if (!link.data) link.data = {}
    if (!link.data.controlPoint) link.data.controlPoint = { ...cp }

    const g = this.linksG.append('g').attr('class', 'topo-curve-handle').style('pointer-events', 'all')
    // 控制点与端点的虚线指引
    const s = this.getNode(link.source)
    const t = this.getNode(link.target)
    if (s && t) {
      const sc = this._nodeCenter(s)
      const tc = this._nodeCenter(t)
      g.append('line').attr('class', 'topo-curve-guide').attr('x1', sc.x).attr('y1', sc.y).attr('x2', cp.x).attr('y2', cp.y).attr('stroke', 'var(--accent-cyan)').attr('stroke-width', 1).attr('stroke-dasharray', '3 2').attr('opacity', 0.4).style('pointer-events', 'none')
      g.append('line').attr('class', 'topo-curve-guide').attr('x1', tc.x).attr('y1', tc.y).attr('x2', cp.x).attr('y2', cp.y).attr('stroke', 'var(--accent-cyan)').attr('stroke-width', 1).attr('stroke-dasharray', '3 2').attr('opacity', 0.4).style('pointer-events', 'none')
    }
    // 可拖拽控制点
    g
      .append('circle')
      .attr('class', 'topo-curve-handle-pt')
      .attr('cx', cp.x)
      .attr('cy', cp.y)
      .attr('r', 6)
      .attr('fill', 'var(--bg-deep)')
      .attr('stroke', 'var(--accent-cyan)')
      .attr('stroke-width', 1.5)
      .style('cursor', 'move')
      .style('filter', 'drop-shadow(0 0 5px var(--accent-cyan-glow))')
      .call(this._curveHandleDrag())
  }

  _curveHandleDrag() {
    const self = this
    return d3
      .drag()
      .on('start', function (event) {
        event.sourceEvent.stopPropagation()
      })
      .on('drag', function (event) {
        const link = self.getLink(self.selectedLinkId)
        if (!link) return
        if (!link.data) link.data = {}
        link.data.controlPoint = { x: event.x, y: event.y }
        d3.select(this).attr('cx', event.x).attr('cy', event.y)
        // 更新指引线
        const pg = d3.select(this.parentNode)
        pg.selectAll('.topo-curve-guide').each(function (_, i) {
          const line = d3.select(this)
          line.attr('x2', event.x).attr('y2', event.y)
          void i
        })
        self._updateLinkPath(link.id)
      })
      .on('end', function () {
        self.emit('linkCurveEnd', {})
      })
  }

  // ============ 连线模式 ============
  setLinkMode(enabled) {
    this.linkMode = enabled
    this.linkSourceId = null
    this.tempLink = null
    this.overlayG.selectAll('*').remove()
    this.svg.style('cursor', enabled ? 'crosshair' : this.readonly ? 'grab' : 'default')
    this._renderNodes()
    this.emit('linkModeChange', { enabled })
  }

  _startLinkFrom(nodeId) {
    this.linkSourceId = nodeId
    this._renderNodes()
    // 监听整图画布鼠标移动，绘制临时连线
    const self = this
    this.svg.on('mousemove.link', function (event) {
      if (!self.linkSourceId) return
      const [mx, my] = d3.pointer(event, self.zoomG.node())
      self._drawTempLink(nodeId, { x: mx, y: my })
    })
    // 在节点上释放时建立连线
    this.nodesG.selectAll('g.topo-node').on('mouseup.link', function (event, d) {
      if (!self.linkSourceId) return
      if (d.id !== self.linkSourceId) {
        self._createLink(self.linkSourceId, d.id)
      }
      self._clearLinkSource()
    })
  }

  _drawTempLink(sourceId, mouse) {
    const source = this.getNode(sourceId)
    if (!source) return
    const sc = this._nodeCenter(source)
    this.overlayG.selectAll('*').remove()
    this.overlayG
      .append('line')
      .attr('class', 'topo-temp-link')
      .attr('x1', sc.x)
      .attr('y1', sc.y)
      .attr('x2', mouse.x)
      .attr('y2', mouse.y)
      .attr('stroke', 'var(--accent-cyan)')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '6 4')
      .style('pointer-events', 'none')
      .style('filter', 'drop-shadow(0 0 4px var(--accent-cyan-glow))')
  }

  _updateTempLink() {
    // 临时连线在 mousemove 中实时重绘
  }

  _createLink(sourceId, targetId) {
    // 避免重复连线
    const exists = this.links.find((l) => l.source === sourceId && l.target === targetId)
    if (exists) return
    const link = {
      id: `link_${Date.now()}${Math.floor(Math.random() * 1000)}`,
      source: sourceId,
      target: targetId,
      type: 'straight',
      style: { stroke: '#666', strokeWidth: 2 },
      data: {}
    }
    this.addLink(link)
  }

  _clearLinkSource() {
    this.linkSourceId = null
    this.overlayG.selectAll('*').remove()
    this.svg.on('mousemove.link', null)
    this.nodesG.selectAll('g.topo-node').on('mouseup.link', null)
    this._renderNodes()
  }

  // ============ 缩放/平移 ============
  zoomIn() {
    this.svg.transition().duration(200).call(this.zoomBehavior.scaleBy, 1.25)
  }
  zoomOut() {
    this.svg.transition().duration(200).call(this.zoomBehavior.scaleBy, 0.8)
  }
  resetZoom() {
    this.svg.transition().duration(300).call(this.zoomBehavior.transform, d3.zoomIdentity)
  }

  fitView(padding = 60) {
    if (!this.nodes.length) {
      this.resetZoom()
      return
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity
    this.nodes.forEach((n) => {
      minX = Math.min(minX, n.x)
      minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x + n.width)
      maxY = Math.max(maxY, n.y + n.height)
    })
    const w = maxX - minX
    const h = maxY - minY
    const cw = this.container.clientWidth
    const ch = this.container.clientHeight
    const scale = Math.max(this.minScale, Math.min(this.maxScale, (cw - padding * 2) / w, (ch - padding * 2) / h))
    const tx = cw / 2 - scale * (minX + w / 2)
    const ty = ch / 2 - scale * (minY + h / 2)
    const t = d3.zoomIdentity.translate(tx, ty).scale(scale)
    this.svg.transition().duration(400).call(this.zoomBehavior.transform, t)
  }

  // 屏幕坐标 -> 画布坐标
  toCanvasCoords(clientX, clientY) {
    const rect = this.container.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    return this.transform.invert(d3.pointer([x, y], this.svg.node()))
  }

  // ============ 查看模式：节点动画接口 ============
  /**
   * 设置节点的告警状态
   */
  setNodeAlarm(nodeId, alarming) {
    const sel = this.nodesG.select(`g.topo-node[data-id="${nodeId}"]`)
    // data-id 可能没设；改用数据匹配
    this.nodesG
      .selectAll('g.topo-node')
      .filter((d) => d.id === nodeId)
      .select('.topo-node-alarm')
      .classed('alarm-active', alarming)
      .attr('opacity', alarming ? 1 : 0)
    if (alarming) {
      this.nodesG
        .selectAll('g.topo-node')
        .filter((d) => d.id === nodeId)
        .select('.topo-node-alarm')
        .style('animation', 'blink-alarm 0.8s infinite')
    } else {
      this.nodesG
        .selectAll('g.topo-node')
        .filter((d) => d.id === nodeId)
        .select('.topo-node-alarm')
        .style('animation', null)
    }
  }

  /**
   * 设置电池节点（stack/cluster）的 SOC 与充放电状态，并驱动填充高度。
   * @param {string} nodeId 节点 id
   * @param {number} soc 电量 0-1
   * @param {number} charge 1 充电 / -1 放电 / 0 静置
   */
  setNodeBattery(nodeId, soc, charge = 0) {
    const node = this.getNode(nodeId)
    if (!node) return
    const socClamped = Math.max(0, Math.min(1, soc == null ? 0 : soc))
    if (!node.data) node.data = {}
    const prevCharge = node.data.batteryCharge
    node.data.batterySoc = socClamped
    node.data.batteryCharge = charge

    // 获取填充 rect
    const fillSel = this.nodesG
      .selectAll('g.topo-node')
      .filter((d) => d.id === nodeId)
      .select('.topo-battery-fill')
    if (fillSel.empty()) return

    // charge 状态未变化时，保持现有动画/静置状态，只更新 soc 或高度，避免每轮轮询重启动画
    if (prevCharge === charge) {
      if (charge === 0) {
        // 静置：更新到当前 SOC 高度与颜色（平滑过渡）
        this._setBatteryFill(fillSel, socClamped, this._batteryColor(socClamped))
      } else {
        // 充/放电中：更新动画范围（不重启）
        this._updateBatteryAnim(nodeId, socClamped, charge)
      }
      return
    }

    // 停止已有动画
    this._stopBatteryAnim(nodeId)

    if (charge === 1 || charge === -1) {
      // 充电/放电：高度在 [SOC/2, SOC] 区间内，慢速到 SOC 停顿后快速回 SOC/2
      this._startBatteryAnim(nodeId, fillSel, socClamped, charge)
    } else {
      // 静置：禁用过渡后设到 SOC 高度与颜色，再启用过渡（避免 rAF 与过渡冲突）
      fillSel.style('transition', 'none')
      this._setBatteryFill(fillSel, socClamped, this._batteryColor(socClamped))
      // 下一帧启用过渡，用于后续 SOC 变化时的平滑
      requestAnimationFrame(() => {
        fillSel.style('transition', 'y 0.8s ease, height 0.8s ease')
      })
    }
  }

  /**
   * 更新正在进行的充放电动画的目标范围（不重启，保持循环连贯）
   */
  _updateBatteryAnim(nodeId, soc, charge) {
    const anim = this._batteryAnims && this._batteryAnims[nodeId]
    if (anim) {
      anim.soc = soc
      anim.charge = charge
    }
  }

  /**
   * 设置填充高度（SOC 0-1 -> y 24-68）并更新纯色
   * @param {d3.Selection} fillSel 填充 rect
   * @param {number} soc 高度比例 0-1
   * @param {string} [color] 填充颜色（缺省时按 soc 分档）
   */
  _setBatteryFill(fillSel, soc, color) {
    const y = 68 - soc * 44
    fillSel.attr('y', y).attr('height', 68 - y)
    if (color) fillSel.attr('fill', color)
  }

  /**
   * 启动充放电动画（范围 [SOC*2/3, SOC]）：
   * - 充电：从 SOC*2/3 较慢升到 SOC -> 停顿1s -> 较快降回 SOC*2/3 -> 循环
   * - 放电：从 SOC 较慢降到 SOC*2/3 -> 停顿1s -> 较快升回 SOC -> 循环
   * 动画只改变填充高度，颜色由父级 SOC 值决定（<0.2红 / 0.2-0.6橙 / >0.6绿），动效过程中颜色不变
   * @param {string} nodeId 节点 id
   * @param {d3.Selection} fillSel 填充 rect
   * @param {number} soc SOC 值 0-1
   * @param {number} charge 1 充电 / -1 放电
   */
  _startBatteryAnim(nodeId, fillSel, soc, charge) {
    const self = this
    if (!this._batteryAnims) this._batteryAnims = {}
    this._stopBatteryAnim(nodeId)
    // 动画期间禁用 CSS 过渡，避免 rAF 高频更新被过渡拖慢卡顿
    fillSel.style('transition', 'none')
    const slowDur = 3200 // 较慢移动时长 ms
    const fastDur = 900 // 较快移动时长 ms
    const pauseDur = 1000 // 停顿 1s
    const anim = {
      soc,
      charge,
      rafId: null
    }
    // 周期：慢移 + 停顿 + 快移
    const cycleDur = slowDur + pauseDur + fastDur
    const start = performance.now()
    const tick = (now) => {
      const pos = (now - start) % cycleDur // 周期内毫秒位置
      const low = Math.max(0, anim.soc * (2 / 3)) // 区间下限 SOC*2/3
      const top = anim.soc
      let ratio
      const charging = anim.charge === 1
      if (pos < slowDur) {
        // 慢移段
        const p = pos / slowDur
        // 充电：low->SOC(升)；放电：SOC->low(降)
        ratio = charging ? low + (top - low) * p : top - (top - low) * p
      } else if (pos < slowDur + pauseDur) {
        // 停顿段：充电停顶部(SOC)，放电停底部(SOC*2/3)
        ratio = charging ? top : low
      } else {
        // 快移段
        const p = (pos - slowDur - pauseDur) / fastDur
        // 充电：SOC->low(降)；放电：low->SOC(升)
        ratio = charging ? top - (top - low) * p : low + (top - low) * p
      }
      // 颜色由父级传入的 SOC 值（anim.soc）决定，动效只改变高度，不改变颜色
      self._setBatteryFill(fillSel, ratio, self._batteryColor(anim.soc))
      anim.rafId = requestAnimationFrame(tick)
    }
    anim.rafId = requestAnimationFrame(tick)
    this._batteryAnims[nodeId] = anim
  }

  /**
   * 停止节点的电池动画
   */
  _stopBatteryAnim(nodeId) {
    if (this._batteryAnims && this._batteryAnims[nodeId]) {
      const anim = this._batteryAnims[nodeId]
      if (anim.rafId) cancelAnimationFrame(anim.rafId)
      delete this._batteryAnims[nodeId]
    }
  }

  /**
   * 设置节点数据徽章（如功率值）
   */
  setNodeBadge(nodeId, text, color) {
    const node = this.getNode(nodeId)
    if (!node) return
    const sel = this.nodesG
      .selectAll('g.topo-node')
      .filter((d) => d.id === nodeId)
      .select('.topo-node-badge')
    sel.selectAll('*').remove()
    if (!text) return
    // 徽章背景
    const padding = 4
    const tempText = sel.append('text').attr('font-family', 'var(--font-mono)').attr('font-size', 9).attr('font-weight', 600).text(text)
    let tw = 30
    try {
      tw = tempText.node().getBBox().width
    } catch (e) {
      tw = text.length * 6
    }
    tempText.remove()
    const badgeW = tw + padding * 2
    const badgeH = 14
    sel
      .append('rect')
      .attr('x', node.width - badgeW + 2)
      .attr('y', -badgeH + 2)
      .attr('width', badgeW)
      .attr('height', badgeH)
      .attr('rx', 7)
      .attr('fill', 'var(--bg-elevated)')
      .attr('stroke', color || 'var(--accent-cyan)')
      .attr('stroke-width', 1)
      .style('filter', `drop-shadow(0 0 3px ${color || 'var(--accent-cyan-glow)'})`)
    sel
      .append('text')
      .attr('x', node.width - badgeW / 2 + 2)
      .attr('y', -badgeH / 2 + 2 + 3)
      .attr('text-anchor', 'middle')
      .attr('font-family', 'var(--font-mono)')
      .attr('font-size', 9)
      .attr('font-weight', 600)
      .attr('fill', color || 'var(--accent-cyan)')
      .text(text)
  }

  /**
   * 设置连线的流动动画（充放电状态）
   * direction: 'forward' | 'backward' | null(停止)
   */
  setLinkFlow(linkId, direction, color) {
    const sel = this.linksG
      .selectAll('g.topo-link')
      .filter((d) => d.id === linkId)
      .select('.topo-link-flow')
    if (!direction) {
      sel.attr('opacity', 0).style('animation', null)
      return
    }
    sel
      .attr('opacity', 0.9)
      .attr('stroke', color || 'var(--accent-cyan)')
      .style('animation', `flow-dash ${direction === 'backward' ? '1.2s' : '1.2s'} linear infinite`)
    if (direction === 'backward') {
      // 反向流动：用负 dashoffset
      sel.style('animation-direction', 'reverse')
    } else {
      sel.style('animation-direction', 'normal')
    }
  }

  // ============ 销毁 ============
  destroy() {
    if (this._resizeObserver) this._resizeObserver.disconnect()
    // 停止所有电池充放电动画
    if (this._batteryAnims) {
      Object.values(this._batteryAnims).forEach((anim) => {
        if (anim.rafId) cancelAnimationFrame(anim.rafId)
      })
      this._batteryAnims = {}
    }
    this.svg.remove()
    this._listeners = {}
  }
}
