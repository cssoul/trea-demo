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
      .attr('stroke', (d) => (d.style && d.style.stroke) || '#666')
      .attr('stroke-width', (d) => (d.style && d.style.strokeWidth) || 2)
      .attr('stroke-dasharray', (d) => (d.style && d.style.dasharray) || null)

    merged
      .select('.topo-link-flow')
      .attr('d', (d) => this._linkPath(d))
      .attr('stroke', 'var(--accent-cyan)')
      .attr('stroke-width', (d) => (d.style && d.style.strokeWidth ? d.style.strokeWidth + 1 : 3))
      .attr('stroke-dasharray', '8 12')
      .attr('opacity', 0)

    // 选中态
    merged.classed('selected', (d) => d.id === this.selectedLinkId)
    merged
      .select('.topo-link-line')
      .attr('stroke', (d) => {
        if (d.id === this.selectedLinkId) return 'var(--accent-cyan)'
        return (d.style && d.style.stroke) || '#666'
      })
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

    // 选中框（底层）
    enter.append('rect').attr('class', 'topo-node-selection').attr('fill', 'none').attr('stroke', 'var(--accent-cyan)').attr('stroke-width', 1.5).attr('stroke-dasharray', '4 3').attr('opacity', 0)

    // 告警光环
    enter.append('rect').attr('class', 'topo-node-alarm').attr('fill', 'none').attr('stroke', 'var(--accent-danger)').attr('stroke-width', 2).attr('rx', 4).attr('opacity', 0)

    // 节点主内容容器
    const content = enter.append('g').attr('class', 'topo-node-content')

    // 不同类型节点的渲染
    content.each(function (d) {
      const g = d3.select(this)
      const canvas = this.__canvas_ref__
      // 由 _renderNodeContent 处理
      void canvas
    })

    // 文本标签
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

    // 缩放手柄（仅编辑模式）
    if (!this.readonly) {
      const handles = enter.append('g').attr('class', 'topo-node-handles').style('opacity', 0)
      ;['nw', 'ne', 'sw', 'se'].forEach((pos) => {
        handles
          .append('rect')
          .attr('class', `topo-handle topo-handle-${pos}`)
          .attr('width', 8)
          .attr('height', 8)
          .attr('fill', 'var(--bg-deep)')
          .attr('stroke', 'var(--accent-cyan)')
          .attr('stroke-width', 1.5)
          .style('cursor', this._handleCursor(pos))
      })
    }

    const merged = enter.merge(sel)

    // 更新位置/变换
    merged.attr('transform', (d) => `translate(${d.x}, ${d.y})`)

    // 渲染每个节点的内容
    merged.each((d, i, nodes) => {
      this._renderNodeContent(d3.select(nodes[i]).select('.topo-node-content'), d)
    })

    // 选中框
    merged
      .select('.topo-node-selection')
      .attr('x', (d) => -4)
      .attr('y', (d) => -4)
      .attr('width', (d) => d.width + 8)
      .attr('height', (d) => d.height + 8)
      .attr('rx', 4)
      .attr('opacity', (d) => (d.id === this.selectedNodeId ? 1 : 0))

    // 告警框
    merged
      .select('.topo-node-alarm')
      .attr('x', (d) => -2)
      .attr('y', (d) => -2)
      .attr('width', (d) => d.width + 4)
      .attr('height', (d) => d.height + 4)

    // 标签位置
    merged
      .select('.topo-node-label')
      .text((d) => d.text || '')
      .attr('x', (d) => d.width / 2)
      .attr('y', (d) => d.height + 16)

    // 缩放手柄
    if (!this.readonly) {
      merged
        .select('.topo-node-handles')
        .style('opacity', (d) => (d.id === this.selectedNodeId ? 1 : 0))
      merged.each((d, i, nodes) => {
        const g = d3.select(nodes[i]).select('.topo-node-handles')
        g.select('.topo-handle-nw').attr('x', -4).attr('y', -4)
        g.select('.topo-handle-ne').attr('x', d.width - 4).attr('y', -4)
        g.select('.topo-handle-sw').attr('x', -4).attr('y', d.height - 4)
        g.select('.topo-handle-se').attr('x', d.width - 4).attr('y', d.height - 4)
      })
    }

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
      if (!this.readonly) {
        merged.selectAll('.topo-handle').call(this._resizeBehavior())
      }
    } else {
      merged.on('click', (event, d) => {
        event.stopPropagation()
        this.emit('nodeClick', { node: d, event })
      })
    }

    // 连线模式下显示连接点
    merged.select('.topo-link-point').remove()
    if (this.linkMode) {
      merged
        .append('circle')
        .attr('class', 'topo-link-point')
        .attr('cx', (d) => d.width / 2)
        .attr('cy', (d) => d.height / 2)
        .attr('r', 6)
        .attr('fill', 'var(--accent-cyan)')
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5)
        .style('cursor', 'crosshair')
        .style('filter', 'drop-shadow(0 0 6px var(--accent-cyan-glow))')
        .style('opacity', (d) => (d.id === this.linkSourceId ? 1 : 0.6))
        .on('click', (event, d) => {
          event.stopPropagation()
          this._startLinkFrom(d.id)
        })
    }
  }

  _handleCursor(pos) {
    return { nw: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', se: 'nwse-resize' }[pos]
  }

  // ---- 单个节点内容渲染 ----
  _renderNodeContent(selection, node) {
    selection.selectAll('*').remove()
    const type = node.type

    if (type === 'busbar') {
      // 母线：渐变粗矩形
      const gradId = `busbar-grad-${node.id}`
      const defs = this.svg.select('defs')
      let grad = defs.select(`#${gradId}`)
      if (grad.empty()) {
        grad = defs
          .append('linearGradient')
          .attr('id', gradId)
          .attr('x1', '0')
          .attr('y1', '0')
          .attr('x2', '0')
          .attr('y2', '1')
        grad.append('stop').attr('offset', '0%').attr('stop-color', '#3d4a66')
        grad.append('stop').attr('offset', '50%').attr('stop-color', '#7a8aaa')
        grad.append('stop').attr('offset', '100%').attr('stop-color', '#1f2a40')
      }
      selection
        .append('rect')
        .attr('width', node.width)
        .attr('height', node.height)
        .attr('rx', 1)
        .attr('fill', `url(#${gradId})`)
        .attr('stroke', '#2d3b57')
        .attr('stroke-width', 0.5)
      // 高光
      selection
        .append('rect')
        .attr('y', node.height * 0.25)
        .attr('width', node.width)
        .attr('height', 1)
        .attr('fill', '#aabbdd')
        .attr('opacity', 0.5)
      return
    }

    if (type === 'line') {
      selection
        .append('rect')
        .attr('width', node.width)
        .attr('height', node.height)
        .attr('fill', (node.style && node.style.fill) || '#e70808')
        .attr('stroke', (node.style && node.style.stroke) || '#ed0707')
        .attr('stroke-width', (node.style && node.style.strokeWidth) || 1)
      return
    }

    if (type === 'text') {
      selection
        .append('text')
        .attr('x', node.width / 2)
        .attr('y', node.height / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', (node.style && node.style.fill) || 'var(--text-primary)')
        .attr('font-family', 'var(--font-display)')
        .attr('font-size', (node.style && node.style.fontSize) || 14)
        .attr('font-weight', 600)
        .text(node.text || '')
      return
    }

    // 设备类节点：image + 可选的 SOC 进度条（由 AnimationManager 控制）
    const config = NODE_TYPES[type]
    const icon = node.icon || (config && config.icon)
    if (icon) {
      const img = selection
        .append('image')
        .attr('href', icon)
        .attr('width', node.width)
        .attr('height', node.height)
        .attr('preserveAspectRatio', 'xMidYMid meet')

      // 旋转
      if (node.rotate) {
        img.attr('transform', `rotate(${node.rotate} ${node.width / 2} ${node.height / 2})`)
      }
      img.style('cursor', this.readonly ? 'pointer' : 'move')
    }

    // 设备数据徽章容器（右上角）
    selection.append('g').attr('class', 'topo-node-badge')
    // SOC 进度条容器（用于 stack/cluster）
    if (type === 'stack' || type === 'cluster') {
      selection
        .append('g')
        .attr('class', 'topo-soc-bar')
        .attr('transform', `translate(0, ${node.height + 2})`)
    }
  }

  // ============ 选择 ============
  _selectNode(id) {
    this.selectedNodeId = id
    this.selectedLinkId = null
    this._renderNodes()
    this._renderLinks()
    const node = this.getNode(id)
    this.emit('select', { type: 'node', node })
  }

  _selectLink(id) {
    this.selectedLinkId = id
    this.selectedNodeId = null
    this._renderNodes()
    this._renderLinks()
    const link = this.getLink(id)
    this.emit('select', { type: 'link', link })
  }

  clearSelection() {
    this.selectedNodeId = null
    this.selectedLinkId = null
    this._renderNodes()
    this._renderLinks()
    this.emit('select', { type: 'none' })
  }

  selectNode(id) {
    this._selectNode(id)
  }

  // ============ 节点拖拽 ============
  _nodeDragBehavior() {
    const self = this
    return d3
      .drag()
      .on('start', function (event, d) {
        if (self.linkMode) return // 连线模式下不拖拽节点
        d3.select(this).raise()
        self._dragStart = { x: d.x, y: d.y }
        self.emit('nodeDragStart', { node: d })
      })
      .on('drag', function (event, d) {
        if (self.linkMode) return
        d.x = event.x - d.width / 2
        d.y = event.y - d.height / 2
        d3.select(this).attr('transform', `translate(${d.x}, ${d.y})`)
        // 同步更新相连的连线
        self._updateLinksForNode(d.id)
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
          handle: d3.select(this).attr('class').split(' ').pop().replace('topo-handle-', '')
        }
      })
      .on('drag', function (event, d) {
        event.sourceEvent.stopPropagation()
        const s = self._resizeStart
        let { x, y, width, height } = s
        const dx = event.x - s.x - s.width / 2
        const dy = event.y - s.y - s.height / 2
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
      })
      .on('end', function (event, d) {
        event.sourceEvent.stopPropagation()
        self.emit('nodeResize', { node: d, start: self._resizeStart })
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
    this._renderNodes()
    this._updateLinksForNode(id)
  }

  // ============ 连线增删 ============
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
    this.emit('linkRemoved', { id })
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
   * 设置节点 SOC 进度条（stack/cluster）
   */
  setNodeSoc(nodeId, soc) {
    const node = this.getNode(nodeId)
    if (!node) return
    const sel = this.nodesG
      .selectAll('g.topo-node')
      .filter((d) => d.id === nodeId)
      .select('.topo-soc-bar')
    sel.selectAll('*').remove()
    if (soc == null) return
    const pct = Math.max(0, Math.min(100, soc))
    const barW = node.width
    const barH = 3
    // 背景
    sel
      .append('rect')
      .attr('width', barW)
      .attr('height', barH)
      .attr('rx', 1.5)
      .attr('fill', 'var(--bg-deep)')
      .attr('stroke', 'var(--border-line)')
      .attr('stroke-width', 0.5)
    // 填充
    const fillColor = pct > 50 ? 'var(--accent-emerald)' : pct > 20 ? 'var(--accent-amber)' : 'var(--accent-danger)'
    sel
      .append('rect')
      .attr('width', (barW * pct) / 100)
      .attr('height', barH)
      .attr('rx', 1.5)
      .attr('fill', fillColor)
      .style('filter', 'drop-shadow(0 0 3px currentColor)')
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
    this.svg.remove()
    this._listeners = {}
  }
}
