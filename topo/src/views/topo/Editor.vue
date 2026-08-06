<template>
  <div class="topo-editor" @drop="onDrop" @dragover.prevent>
    <Toolbar
      :can-undo="canUndo"
      :can-redo="canRedo"
      :link-mode="linkMode"
      :has-selection="!!selectedNode || !!selectedLink"
      :zoom="zoom"
      @undo="undo"
      @redo="redo"
      @toggle-link="toggleLinkMode"
      @delete="deleteSelected"
      @zoom-in="canvas && canvas.zoomIn()"
      @zoom-out="canvas && canvas.zoomOut()"
      @fit="canvas && canvas.fitView()"
      @save="save"
      @preview="goPreview"
    />

    <div class="editor-body">
      <!-- 左侧组件库 -->
      <aside class="editor-left" :class="{ collapsed: !leftOpen }">
        <button class="panel-toggle" @click="leftOpen = !leftOpen">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div v-show="leftOpen" class="left-inner">
          <ComponentPanel @add="addNodeByType" />
        </div>
      </aside>

      <!-- 中间画布 -->
      <main class="editor-center">
        <div ref="canvasRef" class="canvas-container"></div>

        <!-- 画布角标 -->
        <div class="canvas-corner top-left">
          <div class="corner-item">
            <span class="corner-label mono">NODES</span>
            <span class="corner-value mono">{{ canvas ? canvas.nodes.length : 0 }}</span>
          </div>
          <div class="corner-item">
            <span class="corner-label mono">LINKS</span>
            <span class="corner-value mono">{{ canvas ? canvas.links.length : 0 }}</span>
          </div>
        </div>

        <div class="canvas-corner top-right" v-if="linkMode">
          <div class="link-mode-hint">
            <span class="pulse-dot"></span>
            连线模式 · 点击节点选择源，拖动到目标节点建立连线
          </div>
        </div>

        <div class="canvas-corner bottom-right">
          <div class="mini-stats mono">
            <span class="stat-dot ok"></span>系统就绪
          </div>
        </div>
      </main>

      <!-- 右侧属性面板 -->
      <aside class="editor-right" :class="{ collapsed: !rightOpen }">
        <button class="panel-toggle right" @click="rightOpen = !rightOpen">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <div v-show="rightOpen" class="right-inner">
          <PropertyPanel
            :node="selectedNode"
            :link="selectedLink"
            :device-list="deviceList"
            :bound-device-ids="boundDeviceIds"
            @change="onNodeChange"
            @style-change="onStyleChange"
            @bind="onBindDevice"
            @unbind="onUnbindDevice"
            @link-change="onLinkChange"
          />
        </div>
      </aside>
    </div>

    <ContextMenu
      :visible="ctxMenu.visible"
      :x="ctxMenu.x"
      :y="ctxMenu.y"
      :node="ctxMenu.node"
      :has-clipboard="!!clipboard"
      @action="onContextAction"
      @close="ctxMenu.visible = false"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, computed, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import TopoCanvas from './core/TopoCanvas'
import DataBinder from './core/DataBinder'
import { createNode, createLink } from './config/nodeConfig'
import { topoGraphData } from './data/topoData'
import { deviceList } from './data/deviceData'
import Toolbar from './components/Toolbar.vue'
import ComponentPanel from './components/ComponentPanel.vue'
import PropertyPanel from './components/PropertyPanel.vue'
import ContextMenu from './components/ContextMenu.vue'

const router = useRouter()
const canvasRef = ref(null)
const canvas = ref(null)
const dataBinder = ref(null)

const selectedNode = ref(null)
const selectedLink = ref(null)
const linkMode = ref(false)
const zoom = ref(1)
const leftOpen = ref(true)
const rightOpen = ref(true)
const clipboard = ref(null)

const ctxMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  node: null
})

// 撤销/重做
const undoStack = ref([])
const redoStack = ref([])
// undoStack 栈顶代表当前状态，至少需 2 个快照（初始 + 操作后）才能撤销
const canUndo = computed(() => undoStack.value.length > 1)
const canRedo = computed(() => redoStack.value.length > 0)
const MAX_HISTORY = 50

const boundDeviceIds = computed(() => {
  if (!canvas.value) return []
  return canvas.value.nodes
    .filter((n) => n.data && n.data.binding)
    .map((n) => n.data.binding.deviceId)
})

// ============ 生命周期 ============
onMounted(async () => {
  await nextTick()
  initCanvas()
  loadInitialData()
  bindCanvasEvents()
  bindKeyboard()
})

onBeforeUnmount(() => {
  if (canvas.value) canvas.value.destroy()
  window.removeEventListener('keydown', onKeydown)
})

function initCanvas() {
  canvas.value = new TopoCanvas(canvasRef.value, { mode: 'editor' })
  dataBinder.value = new DataBinder([], deviceList)
}

function loadInitialData() {
  // 尝试从 localStorage 读取，否则用模拟数据
  const saved = localStorage.getItem('topo_data')
  let data
  if (saved) {
    try {
      data = JSON.parse(saved)
    } catch (e) {
      data = null
    }
  }
  if (!data) {
    data = JSON.parse(JSON.stringify(topoGraphData))
  }
  canvas.value.setData(data)
  dataBinder.value.setNodes(canvas.value.nodes)
  dataBinder.value.setDeviceList(deviceList)
  clearHistory()
  pushHistory()
  // 自适应居中
  setTimeout(() => canvas.value && canvas.value.fitView(), 200)
}

function bindCanvasEvents() {
  canvas.value.on('select', ({ type, node, link }) => {
    selectedNode.value = type === 'node' ? node : null
    selectedLink.value = type === 'link' ? link : null
  })
  canvas.value.on('contextmenu', ({ event, node, x, y }) => {
    ctxMenu.visible = true
    ctxMenu.x = event.clientX
    ctxMenu.y = event.clientY
    ctxMenu.node = node
  })
  // 画布 → 面板：实时回写
  const syncSelected = (node) => {
    if (selectedNode.value && selectedNode.value.id === node.id) {
      selectedNode.value = { ...node }
    }
  }
  canvas.value.on('nodeDrag', ({ node }) => syncSelected(node))
  canvas.value.on('nodeResize', ({ node }) => syncSelected(node))
  canvas.value.on('nodeRotate', ({ node }) => syncSelected(node))
  // 操作结束：入栈
  canvas.value.on('nodeDragEnd', () => {
    pushHistory()
  })
  canvas.value.on('nodeResizeEnd', () => {
    pushHistory()
  })
  canvas.value.on('nodeRotateEnd', () => {
    pushHistory()
  })
  canvas.value.on('linkAdded', () => {
    pushHistory()
  })
  canvas.value.on('linkCurveEnd', () => {
    pushHistory()
  })
  canvas.value.on('zoom', ({ transform }) => {
    zoom.value = transform.k
  })
  canvas.value.on('linkModeChange', ({ enabled }) => {
    linkMode.value = enabled
  })
}

// ============ 撤销/重做 ============
function snapshot() {
  return JSON.parse(JSON.stringify(canvas.value.getData()))
}

function pushHistory() {
  undoStack.value.push(snapshot())
  if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift()
  redoStack.value = []
}

function clearHistory() {
  undoStack.value = []
  redoStack.value = []
}

function undo() {
  if (undoStack.value.length <= 1) return
  // 栈顶是当前状态：弹出后放入 redoStack
  const current = undoStack.value.pop()
  redoStack.value.push(current)
  // 新栈顶为操作前的状态，恢复它（深拷贝以免画布 mutate 污染历史快照）
  const prev = undoStack.value[undoStack.value.length - 1]
  canvas.value.setData(JSON.parse(JSON.stringify(prev)))
  dataBinder.value.setNodes(canvas.value.nodes)
  selectedNode.value = null
}

function redo() {
  if (!redoStack.value.length) return
  const next = redoStack.value.pop()
  undoStack.value.push(next)
  canvas.value.setData(JSON.parse(JSON.stringify(next)))
  dataBinder.value.setNodes(canvas.value.nodes)
  selectedNode.value = null
}

// ============ 节点操作 ============
function onDrop(event) {
  const type = event.dataTransfer.getData('topo/node-type')
  if (!type) return
  const rect = canvasRef.value.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  const canvasCoords = canvas.value.transform.invert([x, y])
  addNodeByType(type, canvasCoords[0] - 30, canvasCoords[1] - 30)
}

function addNodeByType(type, x, y) {
  if (x == null || y == null) {
    // 默认放在画布中心
    const rect = canvasRef.value.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    const p = canvas.value.transform.invert([cx, cy])
    x = p[0] - 30
    y = p[1] - 30
  }
  const node = createNode(type, x, y)
  canvas.value.addNode(node)
  dataBinder.value.setNodes(canvas.value.nodes)
  pushHistory()
  message.success(`已添加 ${node.text}`)
}

function deleteSelected() {
  if (selectedNode.value) {
    canvas.value.removeNode(selectedNode.value.id)
    selectedNode.value = null
    dataBinder.value.setNodes(canvas.value.nodes)
    pushHistory()
  } else if (selectedLink.value) {
    canvas.value.removeLink(selectedLink.value.id)
    selectedLink.value = null
    pushHistory()
  }
}

function onNodeChange({ nodeId, key, value }) {
  canvas.value.updateNode(nodeId, { [key]: value })
  const n = canvas.value.getNode(nodeId)
  if (n) selectedNode.value = { ...n }
  pushHistory()
}

function onStyleChange({ nodeId, key, value }) {
  const node = canvas.value.getNode(nodeId)
  if (!node) return
  const newStyle = { ...node.style, [key]: value }
  canvas.value.updateNode(nodeId, { style: newStyle })
  const n = canvas.value.getNode(nodeId)
  if (n) selectedNode.value = { ...n }
  pushHistory()
}

// ============ 连线属性 ============
function onLinkChange({ linkId, key, value }) {
  if (key === 'style') {
    canvas.value.updateLink(linkId, { style: value })
  } else {
    canvas.value.updateLink(linkId, { [key]: value })
  }
  const l = canvas.value.getLink(linkId)
  if (l) selectedLink.value = { ...l }
  pushHistory()
}

// ============ 设备绑定 ============
function onBindDevice({ nodeId, device }) {
  dataBinder.value.bind(nodeId, device)
  canvas.value.updateNode(nodeId, { text: device.deviceName, data: canvas.value.getNode(nodeId).data })
  const n = canvas.value.getNode(nodeId)
  if (n) selectedNode.value = { ...n }
  pushHistory()
  message.success(`已绑定设备：${device.deviceName}`)
}

function onUnbindDevice(nodeId) {
  dataBinder.value.unbind(nodeId)
  canvas.value.updateNode(nodeId, { data: canvas.value.getNode(nodeId).data })
  const n = canvas.value.getNode(nodeId)
  if (n) selectedNode.value = { ...n }
  pushHistory()
  message.success('已解除绑定')
}

// ============ 连线模式 ============
function toggleLinkMode() {
  linkMode.value = !linkMode.value
  canvas.value.setLinkMode(linkMode.value)
  if (linkMode.value) {
    message.info('连线模式已开启')
  }
}

// ============ 保存/预览 ============
function save() {
  const data = canvas.value.getData()
  localStorage.setItem('topo_data', JSON.stringify(data))
  pushHistory()
  message.success('拓扑图已保存')
}

function goPreview() {
  save()
  router.push('/topo/viewer')
}

// ============ 右键菜单操作 ============
function onContextAction(action) {
  const node = ctxMenu.node
  ctxMenu.visible = false
  if (!node) return
  if (action === 'delete') {
    canvas.value.removeNode(node.id)
    selectedNode.value = null
    dataBinder.value.setNodes(canvas.value.nodes)
    pushHistory()
  } else if (action === 'copy') {
    clipboard.value = JSON.parse(JSON.stringify(node))
    message.success('已复制')
  } else if (action === 'paste') {
    if (!clipboard.value) return
    const n = JSON.parse(JSON.stringify(clipboard.value))
    n.id = `node_${Date.now()}${Math.floor(Math.random() * 1000)}`
    n.x += 30
    n.y += 30
    n.text = n.text + ' (副本)'
    if (n.data) n.data.binding = null
    canvas.value.addNode(n)
    dataBinder.value.setNodes(canvas.value.nodes)
    pushHistory()
  } else if (action === 'duplicate') {
    const n = JSON.parse(JSON.stringify(node))
    n.id = `node_${Date.now()}${Math.floor(Math.random() * 1000)}`
    n.x += 30
    n.y += 30
    n.text = n.text + ' (副本)'
    if (n.data) n.data.binding = null
    canvas.value.addNode(n)
    dataBinder.value.setNodes(canvas.value.nodes)
    pushHistory()
  } else if (action === 'bring-front') {
    node.zIndex = Date.now()
    canvas.value.render()
    pushHistory()
  } else if (action === 'send-back') {
    node.zIndex = -1
    canvas.value.render()
    pushHistory()
  }
}

// ============ 键盘快捷键 ============
function bindKeyboard() {
  window.addEventListener('keydown', onKeydown)
}

function onKeydown(e) {
  const isMod = e.ctrlKey || e.metaKey
  if (isMod && e.key === 'z' && !e.shiftKey) {
    e.preventDefault()
    undo()
  } else if (isMod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault()
    redo()
  } else if (isMod && e.key === 's') {
    e.preventDefault()
    save()
  } else if (isMod && e.key === 'c' && selectedNode.value) {
    clipboard.value = JSON.parse(JSON.stringify(selectedNode.value))
    message.success('已复制')
  } else if (isMod && e.key === 'v' && clipboard.value) {
    onContextAction('paste')
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && (selectedNode.value || selectedLink.value)) {
    // 避免在输入框中删除
    const tag = e.target && e.target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    e.preventDefault()
    deleteSelected()
  } else if (e.key === 'Escape') {
    if (linkMode.value) toggleLinkMode()
    canvas.value && canvas.value.clearSelection()
  }
}
</script>

<style scoped>
.topo-editor {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-void);
  overflow: hidden;
}

.editor-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

.editor-left,
.editor-right {
  position: relative;
  flex-shrink: 0;
  transition: width 0.25s ease;
  z-index: 5;
}

.editor-left {
  width: 220px;
}
.editor-left.collapsed {
  width: 0;
}

.editor-right {
  width: 280px;
}
.editor-right.collapsed {
  width: 0;
}

.left-inner,
.right-inner {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.editor-left.collapsed .left-inner,
.editor-right.collapsed .right-inner {
  display: none;
}

.panel-toggle {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  width: 20px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.15s;
}

.panel-toggle:hover {
  color: var(--accent-cyan);
  border-color: var(--accent-cyan-dim);
}

.editor-left .panel-toggle {
  right: -10px;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.editor-right .panel-toggle {
  left: -10px;
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
}

.editor-center {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: var(--bg-deep);
}

.canvas-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.canvas-container :deep(.topo-svg) {
  background: var(--bg-deep);
}

.canvas-corner {
  position: absolute;
  z-index: 4;
  pointer-events: none;
  display: flex;
  gap: 12px;
}

.canvas-corner.top-left {
  top: 12px;
  left: 12px;
}
.canvas-corner.top-right {
  top: 12px;
  right: 12px;
}
.canvas-corner.bottom-right {
  bottom: 12px;
  right: 12px;
}

.corner-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 10px;
  background: rgba(2, 22, 51, 0.85);
  border: 1px solid var(--border-line);
  border-radius: var(--radius-sm);
  backdrop-filter: blur(8px);
}

.corner-label {
  font-size: 8px;
  color: var(--text-dim);
  letter-spacing: 0.15em;
}

.corner-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent-cyan);
  line-height: 1;
}

.link-mode-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: rgba(1, 239, 182, 0.12);
  border: 1px solid var(--accent-cyan);
  border-radius: var(--radius-md);
  color: var(--accent-cyan);
  font-size: 12px;
  backdrop-filter: blur(8px);
  box-shadow: 0 0 16px rgba(1, 239, 182, 0.2);
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-cyan);
  animation: pulse-glow 1s infinite;
  box-shadow: 0 0 8px var(--accent-cyan);
}

.mini-stats {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: rgba(2, 22, 51, 0.85);
  border: 1px solid var(--border-line);
  border-radius: var(--radius-sm);
  font-size: 11px;
  color: var(--text-tertiary);
  backdrop-filter: blur(8px);
}

.stat-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.stat-dot.ok {
  background: var(--accent-emerald);
  box-shadow: 0 0 6px var(--accent-emerald-glow);
}

@media (max-width: 900px) {
  .editor-left {
    width: 180px;
  }
  .editor-right {
    width: 240px;
  }
}

@media (max-width: 640px) {
  .editor-left,
  .editor-right {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 20;
    box-shadow: var(--shadow-panel);
  }
  .editor-left {
    left: 0;
    width: 200px;
  }
  .editor-right {
    right: 0;
    width: 240px;
  }
}
</style>
