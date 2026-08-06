<template>
  <div class="topo-viewer">
    <!-- 顶部信息栏 -->
    <header class="viewer-header">
      <div class="header-left">
        <div class="brand-mark">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" stroke="var(--accent-cyan)" stroke-width="1.5" fill="rgba(1,239,182,0.08)"/>
            <path d="M12 2v20M3 7l9 5 9-5" stroke="var(--accent-cyan)" stroke-width="1" opacity="0.5"/>
          </svg>
        </div>
        <div>
          <div class="view-title">储能系统监控</div>
          <div class="view-subtitle mono">REAL-TIME TOPOLOGY</div>
        </div>
      </div>

      <div class="header-center">
        <div class="kpi-group">
          <div class="kpi">
            <span class="kpi-label mono">总功率</span>
            <span class="kpi-value mono" :class="totalPowerClass">{{ formatPower(totalPower) }}</span>
          </div>
          <div class="kpi-divider"></div>
          <div class="kpi">
            <span class="kpi-label mono">平均SOC</span>
            <span class="kpi-value mono">{{ avgSoc.toFixed(1) }}%</span>
          </div>
          <div class="kpi-divider"></div>
          <div class="kpi">
            <span class="kpi-label mono">在线设备</span>
            <span class="kpi-value mono">{{ onlineCount }}/{{ deviceCount }}</span>
          </div>
          <div class="kpi-divider"></div>
          <div class="kpi">
            <span class="kpi-label mono">告警</span>
            <span class="kpi-value mono" :class="{ danger: alarmCount > 0 }">{{ alarmCount }}</span>
          </div>
        </div>
      </div>

      <div class="header-right">
        <div class="status-indicator">
          <span class="status-dot live"></span>
          <span class="status-text mono">LIVE · {{ lastUpdate }}</span>
        </div>
        <a-button type="primary" @click="goEdit">
          <template #icon>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </template>
          编辑
        </a-button>
      </div>
    </header>

    <!-- 画布区域 -->
    <main class="viewer-canvas-wrap">
      <div ref="canvasRef" class="canvas-container"></div>

      <!-- 图例 -->
      <div class="legend">
        <div class="legend-title mono">图例</div>
        <div class="legend-item">
          <span class="legend-line charge"></span>
          <span>充电流动</span>
        </div>
        <div class="legend-item">
          <span class="legend-line discharge"></span>
          <span>放电流动</span>
        </div>
        <div class="legend-item">
          <span class="legend-bar"></span>
          <span>SOC 进度</span>
        </div>
        <div class="legend-item">
          <img class="legend-alarm" src="/imgs/alarm.png" alt="告警闪烁" />
          <span>告警闪烁</span>
        </div>
      </div>

      <!-- 角标 -->
      <div class="canvas-corner bottom-left">
        <button class="ctrl-btn" title="放大" @click="canvas && canvas.zoomIn()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </button>
        <button class="ctrl-btn" title="缩小" @click="canvas && canvas.zoomOut()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </button>
        <button class="ctrl-btn" title="自适应" @click="canvas && canvas.fitView()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V3h4M21 7V3h-4M3 17v4h4M21 17v4h-4"/><rect x="8" y="8" width="8" height="8" rx="1"/></svg>
        </button>
      </div>
    </main>

    <!-- 设备详情弹窗 -->
    <a-modal
      v-model:open="detailVisible"
      :title="null"
      :footer="null"
      :width="420"
      centered
      :bodyStyle="{ padding: 0 }"
      wrapClassName="device-detail-modal"
    >
      <div v-if="detailData" class="detail-content">
        <div class="detail-header" :class="{ alarm: detailData.alarm }">
          <div class="detail-icon-wrap">
            <img v-if="detailIcon" :src="detailIcon" />
          </div>
          <div class="detail-info">
            <div class="detail-name">{{ detailData.deviceName }}</div>
            <div class="detail-type mono">{{ detailData.deviceType.toUpperCase() }} · {{ detailData.deviceId }}</div>
          </div>
          <div class="detail-status" :class="detailData.status">
            <span class="status-dot"></span>
            {{ statusLabel }}
          </div>
        </div>

        <div class="detail-body">
          <div v-if="detailData.soc != null && detailData.deviceType !== 'pcs'" class="detail-row big">
            <span class="row-label">SOC 荷电量</span>
            <div class="soc-bar-wrap">
              <div class="soc-bar" :style="{ width: detailData.soc + '%' }" :class="socClass"></div>
              <span class="soc-text mono">{{ detailData.soc.toFixed(1) }}%</span>
            </div>
          </div>
          <div class="detail-grid">
            <div class="detail-cell">
              <span class="cell-label mono">功率</span>
              <span class="cell-value mono" :class="powerClass">{{ formatPower(detailData.power) }}</span>
            </div>
            <div v-if="detailData.voltage != null" class="detail-cell">
              <span class="cell-label mono">电压</span>
              <span class="cell-value mono">{{ detailData.voltage.toFixed(1) }}V</span>
            </div>
            <div v-if="detailData.current != null" class="detail-cell">
              <span class="cell-label mono">电流</span>
              <span class="cell-value mono">{{ detailData.current.toFixed(1) }}A</span>
            </div>
            <div v-if="detailData.temperature != null" class="detail-cell">
              <span class="cell-label mono">温度</span>
              <span class="cell-value mono" :class="{ danger: detailData.temperature > 45 }">{{ detailData.temperature.toFixed(1) }}°C</span>
            </div>
          </div>
          <div v-if="detailData.alarm" class="alarm-banner">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>设备告警：请及时检查</span>
          </div>
        </div>
      </div>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import TopoCanvas from './core/TopoCanvas'
import AnimationManager from './core/AnimationManager'
import { topoGraphData } from './data/topoData'
import { getRealtimeData } from './data/realtimeData'
import { NODE_TYPES, DEVICE_TYPE_LABELS } from './config/nodeConfig'

const router = useRouter()
const canvasRef = ref(null)
const canvas = ref(null)
const animManager = ref(null)

const realtimeData = ref({})
const lastUpdate = ref('--:--:--')
const detailVisible = ref(false)
const detailNode = ref(null)
const detailData = ref(null)

// ============ KPI 计算 ============
const deviceEntries = computed(() => Object.values(realtimeData.value))

const deviceCount = computed(() => deviceEntries.value.length)

const onlineCount = computed(() => deviceEntries.value.filter((d) => d.status !== 'offline').length)

const alarmCount = computed(() => deviceEntries.value.filter((d) => d.alarm).length)

const totalPower = computed(() => deviceEntries.value.reduce((s, d) => s + (d.power || 0), 0))

const totalPowerClass = computed(() => {
  if (totalPower.value > 0) return 'charge'
  if (totalPower.value < 0) return 'discharge'
  return ''
})

const avgSoc = computed(() => {
  const socDevices = deviceEntries.value.filter((d) => d.soc != null && d.soc > 0)
  if (!socDevices.length) return 0
  return socDevices.reduce((s, d) => s + d.soc, 0) / socDevices.length
})

// ============ 详情弹窗 ============
const detailIcon = computed(() => {
  if (!detailNode.value) return null
  const t = detailNode.value.type
  return (NODE_TYPES[t] && NODE_TYPES[t].icon) || detailNode.value.icon
})

const statusLabel = computed(() => {
  if (!detailData.value) return ''
  const map = { charging: '充电中', discharging: '放电中', idle: '待机', offline: '离线' }
  return map[detailData.value.status] || detailData.value.status
})

const socClass = computed(() => {
  if (!detailData.value) return ''
  const s = detailData.value.soc
  if (s > 50) return 'high'
  if (s > 20) return 'mid'
  return 'low'
})

const powerClass = computed(() => {
  if (!detailData.value) return ''
  if (detailData.value.power > 0) return 'charge'
  if (detailData.value.power < 0) return 'discharge'
  return ''
})

function formatPower(p) {
  if (p == null) return '--'
  const sign = p > 0 ? '+' : ''
  return `${sign}${p.toFixed(1)} kW`
}

// ============ 生命周期 ============
onMounted(async () => {
  await nextTick()
  initCanvas()
  loadData()
  startPolling()
})

onBeforeUnmount(() => {
  if (animManager.value) animManager.value.stop()
  if (canvas.value) canvas.value.destroy()
})

function initCanvas() {
  canvas.value = new TopoCanvas(canvasRef.value, { mode: 'viewer' })
  animManager.value = new AnimationManager(canvas.value, {
    pollInterval: 2500,
    dataFetcher: async () => {
      return getRealtimeData()
    }
  })

  canvas.value.on('nodeClick', ({ node }) => {
    if (!node.data || !node.data.binding) return
    const data = realtimeData.value[node.data.binding.deviceId]
    if (data) {
      detailNode.value = node
      detailData.value = data
      detailVisible.value = true
    }
  })
}

function loadData() {
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
  // 居中显示
  setTimeout(() => canvas.value && canvas.value.fitView(80), 200)
}

function startPolling() {
  // 立即拉取一次
  const data = getRealtimeData()
  realtimeData.value = data
  lastUpdate.value = formatTime(new Date())
  animManager.value.applyDeviceData(data)
  // 启动轮询
  animManager.value.start()
  // 更新时间戳
  setInterval(() => {
    lastUpdate.value = formatTime(new Date())
    realtimeData.value = { ...getRealtimeDataBuffer() }
  }, 2500)
}

let buffer = {}
function getRealtimeDataBuffer() {
  buffer = getRealtimeData()
  lastUpdate.value = formatTime(new Date())
  animManager.value && animManager.value.applyDeviceData(buffer)
  return buffer
}

function formatTime(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function goEdit() {
  router.push('/topo/editor')
}
</script>

<style scoped>
.topo-viewer {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-void);
  overflow: hidden;
}

.viewer-header {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: linear-gradient(180deg, var(--bg-surface) 0%, var(--bg-panel) 100%);
  border-bottom: 1px solid var(--border-line);
  position: relative;
  z-index: 10;
  flex-shrink: 0;
}

.viewer-header::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent-cyan-dim) 30%, var(--accent-cyan-dim) 70%, transparent);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-mark {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(1, 239, 182, 0.08);
  border: 1px solid var(--accent-cyan-dim);
  border-radius: var(--radius-md);
  filter: drop-shadow(0 0 8px rgba(1, 239, 182, 0.3));
}

.view-title {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.04em;
}

.view-subtitle {
  font-size: 9px;
  color: var(--text-dim);
  letter-spacing: 0.2em;
  margin-top: 2px;
}

.header-center {
  display: flex;
  align-items: center;
}

.kpi-group {
  display: flex;
  align-items: center;
  padding: 8px 20px;
  background: var(--bg-deep);
  border: 1px solid var(--border-line);
  border-radius: var(--radius-lg);
  gap: 16px;
}

.kpi {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.kpi-label {
  font-size: 9px;
  color: var(--text-dim);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.kpi-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1;
}

.kpi-value.charge {
  color: var(--accent-cyan);
  text-shadow: 0 0 8px var(--accent-cyan-glow);
}
.kpi-value.discharge {
  color: var(--accent-amber);
  text-shadow: 0 0 8px var(--accent-amber-glow);
}
.kpi-value.danger {
  color: var(--accent-danger);
  text-shadow: 0 0 8px var(--accent-danger-glow);
  animation: pulse-glow 1s infinite;
}

.kpi-divider {
  width: 1px;
  height: 24px;
  background: var(--border-line);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(16, 217, 122, 0.08);
  border: 1px solid rgba(16, 217, 122, 0.3);
  border-radius: var(--radius-md);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-emerald);
}
.status-dot.live {
  box-shadow: 0 0 8px var(--accent-emerald-glow);
  animation: pulse-glow 1.5s infinite;
}

.status-text {
  font-size: 11px;
  color: var(--accent-emerald);
  letter-spacing: 0.08em;
}

.viewer-canvas-wrap {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: var(--bg-deep);
}

.canvas-container {
  width: 100%;
  height: 100%;
}

.canvas-container :deep(.topo-svg) {
  background: var(--bg-deep);
}

.legend {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 4;
  padding: 12px 14px;
  background: rgba(2, 22, 51, 0.88);
  border: 1px solid var(--border-line);
  border-radius: var(--radius-md);
  backdrop-filter: blur(8px);
  pointer-events: none;
}

.legend-title {
  font-size: 9px;
  color: var(--text-dim);
  letter-spacing: 0.15em;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.legend-item:last-child {
  margin-bottom: 0;
}

.legend-line {
  width: 22px;
  height: 2px;
  border-radius: 1px;
}
.legend-line.charge {
  background: var(--accent-cyan);
  box-shadow: 0 0 6px var(--accent-cyan-glow);
}
.legend-line.discharge {
  background: var(--accent-amber);
  box-shadow: 0 0 6px var(--accent-amber-glow);
}

.legend-bar {
  width: 22px;
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--accent-danger) 0%, var(--accent-amber) 50%, var(--accent-emerald) 100%);
}

.legend-alarm {
  width: 20px;
  height: 20px;
  object-fit: contain;
  animation: blink-alarm 0.8s infinite;
}

.canvas-corner.bottom-left {
  position: absolute;
  bottom: 16px;
  left: 16px;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ctrl-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(2, 22, 51, 0.88);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  backdrop-filter: blur(8px);
}

.ctrl-btn:hover {
  color: var(--accent-cyan);
  border-color: var(--accent-cyan-dim);
  box-shadow: 0 0 10px rgba(1, 239, 182, 0.2);
}

/* ============ 详情弹窗 ============ */
.detail-content {
  background: var(--bg-surface);
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  background: linear-gradient(135deg, rgba(1, 239, 182, 0.08) 0%, transparent 100%);
  border-bottom: 1px solid var(--border-line);
}

.detail-header.alarm {
  background: linear-gradient(135deg, rgba(255, 56, 96, 0.12) 0%, transparent 100%);
}

.detail-icon-wrap {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-deep);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.detail-icon-wrap img {
  max-width: 100%;
  max-height: 100%;
  filter: drop-shadow(0 0 6px rgba(1, 239, 182, 0.3));
}

.detail-info {
  flex: 1;
}

.detail-name {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.detail-type {
  font-size: 10px;
  color: var(--text-tertiary);
  letter-spacing: 0.1em;
}

.detail-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: 0.05em;
  background: var(--bg-elevated);
  color: var(--text-tertiary);
}

.detail-status .status-dot {
  width: 6px;
  height: 6px;
}

.detail-status.charging {
  color: var(--accent-cyan);
  background: rgba(1, 239, 182, 0.12);
}
.detail-status.charging .status-dot {
  background: var(--accent-cyan);
  box-shadow: 0 0 6px var(--accent-cyan-glow);
}
.detail-status.discharging {
  color: var(--accent-amber);
  background: rgba(255, 176, 32, 0.12);
}
.detail-status.discharging .status-dot {
  background: var(--accent-amber);
  box-shadow: 0 0 6px var(--accent-amber-glow);
}
.detail-status.idle .status-dot {
  background: var(--text-dim);
}

.detail-body {
  padding: 18px 20px;
}

.detail-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.detail-row.big .row-label {
  width: 80px;
  font-size: 12px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.soc-bar-wrap {
  flex: 1;
  position: relative;
  height: 22px;
  background: var(--bg-deep);
  border: 1px solid var(--border-line);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.soc-bar {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  border-radius: var(--radius-sm);
  transition: width 0.6s ease;
}

.soc-bar.high {
  background: linear-gradient(90deg, var(--accent-emerald) 0%, #00ff88 100%);
  box-shadow: 0 0 10px var(--accent-emerald-glow);
}
.soc-bar.mid {
  background: linear-gradient(90deg, var(--accent-amber) 0%, #ffd060 100%);
  box-shadow: 0 0 10px var(--accent-amber-glow);
}
.soc-bar.low {
  background: linear-gradient(90deg, var(--accent-danger) 0%, #ff6080 100%);
  box-shadow: 0 0 10px var(--accent-danger-glow);
}

.soc-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
  z-index: 1;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.detail-cell {
  padding: 12px;
  background: var(--bg-deep);
  border: 1px solid var(--border-line);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cell-label {
  font-size: 9px;
  color: var(--text-dim);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.cell-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.cell-value.charge {
  color: var(--accent-cyan);
}
.cell-value.discharge {
  color: var(--accent-amber);
}
.cell-value.danger {
  color: var(--accent-danger);
}

.alarm-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding: 10px 14px;
  background: rgba(255, 56, 96, 0.1);
  border: 1px solid var(--accent-danger);
  border-radius: var(--radius-md);
  color: var(--accent-danger);
  font-size: 12px;
  animation: pulse-glow 1.5s infinite;
}

@media (max-width: 900px) {
  .header-center {
    display: none;
  }
  .legend {
    display: none;
  }
}
</style>
