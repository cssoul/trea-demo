/**
 * linkStyleConfig - 连线全局样式配置（统一配置入口）
 *
 * 字段：
 *  - strokeWidth     连线粗细（px），全局生效，渲染管道半径按此映射
 *  - color           线缆默认颜色（基管材质色，同时作为新建连线的 stroke）
 *  - chargeColor     充电能量流光颜色（电流流向吸收功率设备）
 *  - dischargeColor  放电能量流光颜色（电流流向输出功率设备）
 *
 * 读写入口：
 *  - 编辑器工具栏"连线配置"弹窗 -> TopoScene.setLinkStyleConfig（即时应用并持久化）
 *  - 预览模式 TopoScene 构造时自动 loadLinkStyleConfig，编辑/预览两侧表现一致
 */

/** 默认连线样式（粗细 2px、默认黑、充电绿、放电橙黄） */
export const DEFAULT_LINK_STYLE = {
    strokeWidth: 2,
    color: '#000000',
    chargeColor: '#00c853',
    dischargeColor: '#ffb020'
};

/** 旧版放电色（历史默认值）：读取到已持久化的旧值时迁移为新默认 */
const LEGACY_DISCHARGE_COLOR = '#2f6bff';

const STORAGE_KEY = 'topo_link_style';

/**
 * 读取连线样式配置（localStorage 持久化，缺省字段回退默认值）。
 * @returns {Object} 完整配置
 */
export function loadLinkStyleConfig() {
    const merged = { ...DEFAULT_LINK_STYLE };
    try {
        if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const saved = JSON.parse(raw);
                Object.keys(merged).forEach((key) => {
                    if (saved && saved[key] != null) merged[key] = saved[key];
                });
            }
        }
    } catch (error) {
        console.warn('[linkStyleConfig] 读取配置失败，使用默认值', error);
    }
    // 迁移：此前版本默认放电色为蓝色，未自定义过的用户自动升级为橙黄
    if (merged.dischargeColor === LEGACY_DISCHARGE_COLOR) {
        merged.dischargeColor = DEFAULT_LINK_STYLE.dischargeColor;
    }
    return merged;
}

/**
 * 持久化连线样式配置。
 * @param {Object} cfg 配置
 */
export function saveLinkStyleConfig(cfg) {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
        }
    } catch (error) {
        console.warn('[linkStyleConfig] 保存配置失败', error);
    }
}

/**
 * 十六进制颜色字符串转整数（用于流光着色器 uniform）。
 * @param {string} hex 形如 '#00c853'
 * @param {number} fallback 解析失败时的回退值
 * @returns {number}
 */
export function hexToInt(hex, fallback) {
    const value = parseInt(String(hex || '').replace('#', ''), 16);
    return Number.isFinite(value) ? value : fallback;
}
