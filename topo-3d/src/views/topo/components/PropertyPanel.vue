<template>
  <div class="property-panel">
    <div class="panel-header">
      <span class="panel-title">属性配置</span>
      <span v-if="node" class="panel-tag mono">{{ node.type.toUpperCase() }}</span>
      <span v-else-if="link" class="panel-tag mono">LINK</span>
    </div>

    <div v-if="!node && !link" class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="1.2">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <path d="M9 9h6v6H9z"/>
      </svg>
      <div class="empty-text">未选中任何元素</div>
      <div class="empty-hint">点击画布上的节点或连线以编辑属性</div>
    </div>

    <!-- ============ 节点属性 ============ -->
    <div v-else-if="node" class="panel-body">
      <!-- 基本属性 -->
      <div class="prop-section">
        <div class="section-title">
          <span class="section-dot"></span>基本属性
        </div>
        <a-form layout="vertical" size="small" :colon="false">
          <a-form-item label="ID">
            <span class="prop-id mono">{{ node.id }}</span>
          </a-form-item>
          <a-form-item label="类型">
            <a-tag :color="typeColor">{{ typeLabel }}</a-tag>
          </a-form-item>
          <a-form-item v-if="!isBasicType" label="名称">
            <a-input v-model:value="form.text" @input="emitChange('text', form.text)" @change="emitChange('text', form.text)" placeholder="节点名称" />
          </a-form-item>
          <a-form-item v-if="node.type === 'text'" label="字号">
            <a-input-number v-model:value="form.fontSize" :min="8" :max="48" @change="emitStyle('fontSize', form.fontSize)" style="width: 100%" />
          </a-form-item>
          <div class="prop-row">
            <a-form-item label="X 坐标" style="flex:1">
              <a-input-number v-model:value="form.x" @change="emitChange('x', form.x)" style="width: 100%" />
            </a-form-item>
            <a-form-item label="Y 坐标" style="flex:1">
              <a-input-number v-model:value="form.y" @change="emitChange('y', form.y)" style="width: 100%" />
            </a-form-item>
          </div>
          <div class="prop-row">
            <a-form-item label="宽度" style="flex:1">
              <a-input-number v-model:value="form.width" :min="2" @change="emitChange('width', form.width)" style="width: 100%" />
            </a-form-item>
            <a-form-item label="高度" style="flex:1">
              <a-input-number v-model:value="form.height" :min="2" @change="emitChange('height', form.height)" style="width: 100%" />
            </a-form-item>
          </div>
          <a-form-item label="旋转角度">
            <div class="rotate-row">
              <a-slider
                v-model:value="form.rotate"
                :min="0"
                :max="359"
                :step="1"
                :tip-formatter="(v) => `${v}°`"
                @change="emitChange('rotate', form.rotate)"
                style="flex:1"
              />
              <span class="prop-rotate mono">{{ Math.round(form.rotate) }}°</span>
            </div>
          </a-form-item>
        </a-form>
      </div>

      <!-- 样式属性 -->
      <div v-if="hasStyle" class="prop-section">
        <div class="section-title">
          <span class="section-dot" style="background:var(--accent-amber)"></span>样式
        </div>
        <a-form layout="vertical" size="small" :colon="false">
          <a-form-item v-if="node.type === 'line' || node.type === 'busbar' || node.type === 'rect'" label="颜色">
            <div class="color-picker-row">
              <input type="color" v-model="form.color" @input="onColorChange" />
              <a-input v-model:value="form.color" @input="onColorChange" @change="onColorChange" />
            </div>
          </a-form-item>
          <a-form-item v-if="node.type === 'rect'" label="描边宽度">
            <a-input-number v-model:value="form.strokeWidth" :min="1" :max="20" @change="onStrokeWidthChange" style="width: 100%" />
          </a-form-item>
          <a-form-item v-if="node.type === 'rect'" label="线型">
            <a-select v-model:value="form.dashType" @change="onRectDashChange" style="width: 100%">
              <a-select-option value="solid">实线</a-select-option>
              <a-select-option value="dashed">虚线</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item v-if="node.type === 'text'" label="颜色">
            <div class="color-picker-row">
              <input type="color" v-model="form.textColor" @input="emitStyle('fill', form.textColor)" />
              <a-input v-model:value="form.textColor" @input="emitStyle('fill', form.textColor)" />
            </div>
          </a-form-item>
        </a-form>
      </div>

      <!-- 设备绑定 -->
      <div v-if="node.data && node.data.bindable" class="prop-section">
        <div class="section-title">
          <span class="section-dot" style="background:var(--accent-emerald)"></span>设备绑定
        </div>

        <div v-if="node.data.binding" class="binding-active">
          <div class="binding-card">
            <div class="binding-status">
              <span class="status-led"></span>已绑定
            </div>
            <div class="binding-name">{{ node.data.binding.deviceName }}</div>
            <div class="binding-id mono">{{ node.data.binding.deviceId }}</div>
          </div>
          <a-button size="small" block danger @click="$emit('unbind', node.id)">解除绑定</a-button>
        </div>

        <div v-else class="binding-form">
          <!-- 电池簇需要先选父级电池堆 -->
          <a-form v-if="node.type === 'cluster'" layout="vertical" size="small" :colon="false">
            <a-form-item label="所属电池堆">
              <a-select
                v-model:value="parentStackId"
                placeholder="请选择电池堆"
                @change="onParentStackChange"
              >
                <a-select-option v-for="s in stackDevices" :key="s.deviceId" :value="s.deviceId">
                  {{ s.deviceName }}
                </a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item label="电池簇">
              <a-select
                v-model:value="selectedDeviceId"
                placeholder="请先选择电池堆"
                :disabled="!parentStackId"
                @change="onDeviceSelect"
              >
                <a-select-option v-for="d in availableClusters" :key="d.deviceId" :value="d.deviceId">
                  {{ d.deviceName }}
                </a-select-option>
              </a-select>
            </a-form-item>
            <div v-if="!parentStackId" class="form-hint">电池簇必须归属于某个电池堆，请先选择父级电池堆</div>
            <a-button type="primary" size="small" block :disabled="!selectedDeviceId" @click="confirmBind">
              确认绑定
            </a-button>
          </a-form>

          <a-form v-else layout="vertical" size="small" :colon="false">
            <a-form-item label="关联设备">
              <a-select
                v-model:value="selectedDeviceId"
                placeholder="请选择设备"
                @change="onDeviceSelect"
              >
                <a-select-option v-for="d in availableDevices" :key="d.deviceId" :value="d.deviceId">
                  {{ d.deviceName }}
                </a-select-option>
              </a-select>
            </a-form-item>
            <div v-if="!availableDevices.length" class="form-hint">
              当前类型暂无可用设备（可能全部已被关联）
            </div>
            <a-button type="primary" size="small" block :disabled="!selectedDeviceId" @click="confirmBind">
              确认绑定
            </a-button>
          </a-form>
        </div>
      </div>
    </div>

    <!-- ============ 连线属性 ============ -->
    <div v-else class="panel-body">
      <div class="prop-section">
        <div class="section-title">
          <span class="section-dot"></span>连线属性
        </div>
        <a-form layout="vertical" size="small" :colon="false">
          <a-form-item label="ID">
            <span class="prop-id mono">{{ link.id }}</span>
          </a-form-item>
          <a-form-item label="线条样式">
            <a-select v-model:value="linkForm.type" @change="emitLinkChange('type', linkForm.type)" style="width: 100%">
              <a-select-option value="auto">自动（最优）</a-select-option>
              <a-select-option value="straight">直线</a-select-option>
              <a-select-option value="curve">曲线</a-select-option>
              <a-select-option value="orthogonal">折线</a-select-option>
            </a-select>
          </a-form-item>
          <div class="form-hint">自动：按两端位置智能选择直线或折线；可随时手动切换</div>
        </a-form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { NODE_TYPES, DEVICE_TYPE_LABELS } from '../config/nodeConfig'

const props = defineProps({
  node: { type: Object, default: null },
  link: { type: Object, default: null },
  deviceList: { type: Array, default: () => [] },
  boundDeviceIds: { type: Array, default: () => [] }
})
const emit = defineEmits(['change', 'style-change', 'bind', 'unbind', 'link-change'])

const parentStackId = ref(null)
const selectedDeviceId = ref(null)

const form = reactive({
  text: '',
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  rotate: 0,
  fontSize: 14,
  color: '#ffffff',
  strokeWidth: 1,
  textColor: '#ffffff',
  dashType: 'solid'
})

const linkForm = reactive({
  type: 'auto'
})

// 节点变化时同步表单（含画布拖拽/缩放/旋转的实时回写）
watch(
  () => props.node,
  (n) => {
    if (!n) return
    form.text = n.text || ''
    form.x = Math.round(n.x)
    form.y = Math.round(n.y)
    form.width = Math.round(n.width)
    form.height = Math.round(n.height)
    form.rotate = Math.round((n.rotate || 0) * 10) / 10
    form.fontSize = (n.style && n.style.fontSize) || 14
    form.color = (n.style && n.style.stroke) || '#ffffff'
    form.strokeWidth = (n.style && n.style.strokeWidth) || 1
    form.textColor = (n.style && n.style.fill) || '#ffffff'
    const dasharray = n.style && n.style.dasharray
    form.dashType = dasharray && dasharray !== '' ? 'dashed' : 'solid'
    parentStackId.value = null
    selectedDeviceId.value = null
  },
  { immediate: true, deep: true }
)

// 连线变化时同步表单
watch(
  () => props.link,
  (l) => {
    if (!l) return
    // 旧数据无 type（或为已废弃的语义）时回退 auto 自动选型
    linkForm.type = l.type || 'auto'
  },
  { immediate: true, deep: true }
)

const typeLabel = computed(() => {
  if (!props.node) return ''
  return DEVICE_TYPE_LABELS[props.node.type] || props.node.type
})

const typeColor = computed(() => {
  if (!props.node) return ''
  const t = props.node.type
  if (t === 'stack' || t === 'cluster') return 'cyan'
  if (t === 'pcs' || t === 'pinvt') return 'purple'
  if (t === 'pv') return 'orange'
  if (t === 'breaker' || t === 'line') return 'red'
  return 'blue'
})

const hasStyle = computed(() => {
  return props.node && ['line', 'text', 'busbar', 'rect'].includes(props.node.type)
})

// 基础类型（直线/母线/矩形框）无名称，右侧面板不显示名称输入框
const isBasicType = computed(() => {
  return props.node && ['line', 'busbar', 'rect'].includes(props.node.type)
})

const stackDevices = computed(() => {
  const result = []
  const walk = (list) => {
    list.forEach((d) => {
      if (d.deviceType === 'stack') result.push(d)
      if (d.childList) walk(d.childList)
    })
  }
  walk(props.deviceList)
  return result
})

const availableDevices = computed(() => {
  if (!props.node) return []
  const deviceType = props.node.data.deviceType
  const bound = new Set(props.boundDeviceIds)
  // 当前节点已绑定的允许出现
  const currentBinding = props.node.data.binding
  const result = []
  const walk = (list) => {
    list.forEach((d) => {
      if (d.deviceType === deviceType) {
        if (!bound.has(d.deviceId) || (currentBinding && currentBinding.deviceId === d.deviceId)) {
          result.push(d)
        }
      }
      if (d.childList) walk(d.childList)
    })
  }
  walk(props.deviceList)
  return result
})

const availableClusters = computed(() => {
  if (!parentStackId.value) return []
  const bound = new Set(props.boundDeviceIds)
  const currentBinding = props.node && props.node.data.binding
  const result = []
  const walk = (list) => {
    list.forEach((d) => {
      if (d.deviceType === 'stack' && d.deviceId === parentStackId.value && d.childList) {
        d.childList.forEach((c) => {
          if (!bound.has(c.deviceId) || (currentBinding && currentBinding.deviceId === c.deviceId)) {
            result.push(c)
          }
        })
      }
      if (d.childList) walk(d.childList)
    })
  }
  walk(props.deviceList)
  return result
})

function onParentStackChange() {
  selectedDeviceId.value = null
}

function onDeviceSelect() {}

function confirmBind() {
  if (!selectedDeviceId.value) return
  let device = null
  const walk = (list) => {
    list.forEach((d) => {
      if (d.deviceId === selectedDeviceId.value) device = d
      if (d.childList) walk(d.childList)
    })
  }
  walk(props.deviceList)
  if (device) {
    emit('bind', { nodeId: props.node.id, device })
    selectedDeviceId.value = null
    parentStackId.value = null
  }
}

function emitChange(key, value) {
  emit('change', { nodeId: props.node.id, key, value })
}
function emitStyle(key, value) {
  emit('style-change', { nodeId: props.node.id, key, value })
}
// line/busbar 颜色：写入 style.stroke（画布渲染时读取此字段）
function onColorChange() {
  emitStyle('stroke', form.color)
  // 矩形框无填充，只设置描边颜色
  if (props.node && props.node.type !== 'rect') {
    emitStyle('fill', form.color)
  }
}
// 矩形框描边宽度
function onStrokeWidthChange() {
  emitStyle('strokeWidth', form.strokeWidth)
}
// 矩形框线型（实线/虚线）
function onRectDashChange() {
  emitStyle('dasharray', form.dashType === 'dashed' ? '6,4' : '')
}

// 连线
function emitLinkChange(key, value) {
  emit('link-change', { linkId: props.link.id, key, value })
}
function emitLinkStyle(patch) {
  emit('link-change', { linkId: props.link.id, key: 'style', value: patch })
}
</script>

<style scoped>
.property-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-panel);
  border-left: 1px solid var(--border-line);
}

.panel-header {
  padding: 14px 16px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-line);
}

.panel-tag {
  font-size: 9px;
  padding: 2px 6px;
  background: rgba(1, 239, 182, 0.12);
  border: 1px solid var(--accent-cyan-dim);
  border-radius: 3px;
  color: var(--accent-cyan);
  letter-spacing: 0.1em;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  color: var(--text-dim);
}

.empty-text {
  font-family: var(--font-display);
  font-size: 13px;
  color: var(--text-tertiary);
}

.empty-hint {
  font-size: 11px;
  color: var(--text-dim);
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0 20px;
}

.prop-section {
  padding: 0 16px;
  margin-bottom: 8px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0 8px;
  font-family: var(--font-display);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-tertiary);
}

.section-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent-cyan);
  box-shadow: 0 0 6px var(--accent-cyan-glow);
}

.prop-id {
  font-size: 11px;
  color: var(--text-tertiary);
  word-break: break-all;
}

.prop-rotate {
  display: inline-block;
  padding: 4px 10px;
  color: var(--accent-cyan);
  font-size: 14px;
  font-weight: 600;
  min-width: 52px;
  text-align: right;
}

.rotate-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.prop-row {
  display: flex;
  gap: 8px;
}

.color-picker-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.color-picker-row input[type='color'] {
  width: 32px;
  height: 28px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--bg-deep);
  cursor: pointer;
  padding: 2px;
}

.binding-active {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.binding-card {
  padding: 12px;
  background: rgba(4, 206, 158, 0.06);
  border: 1px solid rgba(4, 206, 158, 0.3);
  border-radius: var(--radius-md);
}

.binding-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent-emerald);
  font-family: var(--font-display);
  font-weight: 600;
  margin-bottom: 6px;
}

.status-led {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-emerald);
  box-shadow: 0 0 6px var(--accent-emerald-glow);
  animation: pulse-glow 1.5s infinite;
}

.binding-name {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
  margin-bottom: 4px;
}

.binding-id {
  font-size: 10px;
  color: var(--text-tertiary);
}

.binding-form {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-hint {
  font-size: 11px;
  color: var(--accent-amber);
  padding: 6px 8px;
  background: rgba(255, 176, 32, 0.08);
  border-radius: var(--radius-sm);
  border-left: 2px solid var(--accent-amber);
}
</style>
