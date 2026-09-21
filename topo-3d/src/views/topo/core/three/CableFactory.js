/**
 * CableFactory - 立体电缆/母线连接件工厂
 *
 * 职责：
 *  - 依据两端接线点生成"贴地直角走线"的立体电缆管道（CurvePath：折线 + 圆角倒角）
 *  - 生成同形态的流光管道（叠加一层加法混合的着色器管道，用于能量流动可视化）
 *  - 生成端口护套（两端接线端子处的小护套，强化"接线"观感）
 *  - 支持质量分级重建：静止时高分段，拖拽时低分段，保证大拓扑下拖拽依旧流畅
 *
 * 走线规范（编辑/预览模式统一）：
 *  - 电缆从设备底部侧面（CABLE_EXIT_HEIGHT 高度）引出，水平直行引出后贴地走线
 *  - 转角统一做圆角倒角（CORNER_RADIUS），避免生硬折角
 *
 * 线条样式（link.type）：
 *  - auto       默认。按两端相对位置自动选最优：轴向对齐走直线，斜向走直角折线（横行优先，
 *               段长更均衡时改纵行优先），等轴测视角下最整洁
 *  - straight   直线：A->B 贴地直连
 *  - curve      曲线：贴地平滑弧线（二次贝塞尔，控制点位于连线中垂线上）
 *  - orthogonal 折线：手工正交走线（水平段 + 90° 转角 + 水平段）
 */
import * as THREE from 'three';
import { MAT } from './materialLibrary.js';
import { createFlowMaterial } from './FlowAnimator.js';

/** 管道半径（与 strokeWidth 的映射关系） */
const RADIUS_MIN = 1.2;
const RADIUS_MAX = 8;

/** 质量分级：径向分段与长度分段 */
const QUALITY = {
    high: { tubular: 36, radial: 8 },
    low: { tubular: 14, radial: 6 }
};

/** 贴地走线高度：略高于地面，避免与地面网格 z-fighting */
const RUN_Y = 2.2;

/** 圆角倒角半径：贴地直角转弯处的过渡弧长 */
const CORNER_RADIUS = 34;

/** 等轴测横纵比：世界 X 位移在屏幕上的斜向拉伸系数（决定 auto 模式的段长均衡计算） */
const ISO_RATIO = 1;

/**
 * 依据连线样式计算管道半径。
 * 线宽以全局配置为准（每条连线历史 style.strokeWidth 只作样式记录，
 * 不再覆盖全局设置，保证"连线全局配置→线的粗细"对所有电缆生效）。
 * @param {Object} style 连线样式（仅兼容保留，读取时忽略）
 * @param {number} [fallbackWidth] 全局默认线宽
 * @returns {number} 半径
 */
function radiusOf(style, fallbackWidth) {
    const width = Number(fallbackWidth) || 2;
    return THREE.MathUtils.clamp(width * 1.35, RADIUS_MIN, RADIUS_MAX);
}

/**
 * 将折线点列转换为带圆角倒角的 CurvePath。
 * 每个中间顶点处：直段止于顶点前 r 处，二次贝塞尔弧越过顶点，再接下一段直线。
 * @param {THREE.Vector3[]} points 折线顶点（含首尾）
 * @param {number} radius 倒角半径
 * @returns {THREE.CurvePath}
 */
export function roundedPolylineCurve(points, radius) {
    const path = new THREE.CurvePath();
    // 去重相邻重复点
    const pts = points.filter((p, i) => i === 0 || p.distanceToSquared(points[i - 1]) > 1e-6);
    if (pts.length < 2) {
        const p0 = pts[0] || new THREE.Vector3();
        path.add(new THREE.LineCurve3(p0.clone(), (pts[1] || p0).clone()));
        return path;
    }
    let cursor = pts[0].clone();
    for (let i = 1; i < pts.length - 1; i += 1) {
        const prev = pts[i - 1];
        const curr = pts[i];
        const next = pts[i + 1];
        const inDir = curr.clone().sub(prev);
        const outDir = next.clone().sub(curr);
        const inLen = inDir.length();
        const outLen = outDir.length();
        if (inLen < 1e-4 || outLen < 1e-4) continue;
        inDir.divideScalar(inLen);
        outDir.divideScalar(outLen);
        // 倒角半径受两侧直段长度限制，避免弧段重叠
        const r = Math.min(radius, inLen * 0.45, outLen * 0.45);
        const p1 = curr.clone().addScaledVector(inDir, -r);
        const p2 = curr.clone().addScaledVector(outDir, r);
        if (cursor.distanceToSquared(p1) > 1e-6) {
            path.add(new THREE.LineCurve3(cursor.clone(), p1));
        }
        path.add(new THREE.QuadraticBezierCurve3(p1, curr.clone(), p2));
        cursor.copy(p2);
    }
    if (cursor.distanceToSquared(pts[pts.length - 1]) > 1e-6) {
        path.add(new THREE.LineCurve3(cursor.clone(), pts[pts.length - 1].clone()));
    }
    return path;
}

/**
 * 直线：贴地直连。
 */
function straightPoints(from, to, dirA, dirB) {
    const fa = from.clone().setY(0);
    const fb = to.clone().setY(0);
    const da = (dirA ? dirA.clone() : fb.clone().sub(fa)).setY(0).normalize();
    const db = (dirB ? dirB.clone() : fa.clone().sub(fb)).setY(0).normalize();
    const span = fa.distanceTo(fb);
    const standoff = Math.min(Math.max(CORNER_RADIUS * 1.15, 26), span * 0.35);
    const y0 = Math.max(from.y, RUN_Y);
    const y1 = Math.max(to.y, RUN_Y);
    // 贴地主体：出线段 -> 直线 -> 入线段（圆角自然过渡出线方向）
    return [
        fa.clone().setY(y0),
        fa.clone().addScaledVector(da, standoff).setY(y0),
        fb.clone().addScaledVector(db, standoff).setY(y0),
        fb.clone().setY(y1)
    ];
}

/**
 * 折线（正交走线）：先沿引出方向直行，90° 转角后直行接入对端。
 * 转角点通过两条引出直线的交点求解；交点无效（相向对头）时走 U 形绕行。
 */
function orthogonalPoints(from, to, dirA, dirB) {
    const fa = from.clone().setY(0);
    const fb = to.clone().setY(0);
    const da = (dirA || fb.clone().sub(fa)).clone().setY(0).normalize();
    const db = (dirB || fa.clone().sub(fb)).clone().setY(0).normalize();
    const y0 = Math.max(from.y, RUN_Y);
    const y1 = Math.max(to.y, RUN_Y);
    const span = fa.distanceTo(fb);
    const standoff = Math.min(Math.max(CORNER_RADIUS * 1.15, 26), span * 0.35);
    const a = fa.clone().addScaledVector(da, standoff);
    const b = fb.clone().addScaledVector(db, standoff);

    const points = [fa.clone().setY(y0), a.clone().setY(y0)];

    // 求直线 (a + t*da) 与 (b + s*db) 的交点（即直角转角点）
    const cross = da.x * db.z - da.z * db.x;
    const wb = b.clone().sub(a);
    const t = Math.abs(cross) > 1e-6 ? (wb.x * db.z - wb.z * db.x) / cross : NaN;
    const s = Math.abs(cross) > 1e-6 ? (wb.x * da.z - wb.z * da.x) / cross : NaN;

    if (!Number.isFinite(t)) {
        // 平行引出：同向直连，或相向 U 形绕行
        if (da.dot(db) > 0) {
            points.push(b.clone().setY(y0));
        } else {
            const side = new THREE.Vector3(da.z, 0, -da.x);
            const sideSign = wb.dot(side) >= 0 ? 1 : -1;
            // 两条平行引出线之间的横向间距
            const lateral = Math.max(50, Math.abs(wb.x * da.z - wb.z * da.x));
            const ext = Math.max(40, span * 0.3);
            const p1 = a.clone().addScaledVector(da, ext);
            const p2 = p1.clone().addScaledVector(side, sideSign * lateral);
            const p3 = b.clone().addScaledVector(db, ext);
            points.push(p1.setY(y0), p2.setY(y0), p3.setY(y0));
        }
    } else if (t >= 0.5 && s >= 0.5) {
        // 存在有效前方交点：直行至交点，一次 90° 圆角转弯接入对端
        points.push(a.clone().addScaledVector(da, t).setY(y0));
    } else {
        // 交点在引出段后方（钝角）：直接连到对端走线点，由圆角自然过渡
        points.push(b.clone().setY(y0));
    }

    points.push(b.clone().setY(y1), fb.clone().setY(y1));
    return points;
}

/**
 * 自动选型：按两端相对位置选择最优走线。
 *  - 引出方向基本对齐（夹角 < 30°）：直线，最短最干净
 *  - 其余：直角折线；等轴测下"先横后纵"与"先纵后横"视觉段长更均衡的一侧优先
 */
function autoPoints(from, to, dirA, dirB) {
    const fa = from.clone().setY(0);
    const fb = to.clone().setY(0);
    const direct = fb.clone().sub(fa);
    const da = (dirA || direct.clone()).setY(0).normalize();
    if (da.dot(direct.clone().normalize()) > Math.cos(THREE.MathUtils.degToRad(30))) {
        return straightPoints(from, to, dirA, dirB);
    }
    return orthogonalPoints(from, to, dirA, dirB);
}

/**
 * 曲线：贴地平滑弧线。控制点取连线中点沿中垂线方向外推（外推量随水平距离自适应），
 * 渲染时由 roundedPolylineCurve 采样为平滑曲线，整体仍贴地、不遮设备。
 */
function curvePoints(from, to, dirA, dirB) {
    const fa = from.clone().setY(0);
    const fb = to.clone().setY(0);
    const direct = fb.clone().sub(fa);
    const span = direct.length();
    const y0 = Math.max(from.y, RUN_Y);
    const y1 = Math.max(to.y, RUN_Y);
    const mid = fa.clone().addScaledVector(direct, 0.5);
    // 中垂线方向：取引出方向中更接近垂直于连线的一侧，保证弧线背离直线路径外拱
    const da = (dirA || direct.clone()).clone().setY(0).normalize();
    const db = (dirB || direct.clone().negate()).clone().setY(0).normalize();
    const perp = new THREE.Vector3(-direct.z, 0, direct.x).normalize();
    // 弧线凸向：与两端引出方向的平均横向分量一致（弧从设备侧面"绕出"而非迎面拱起）
    const lateral = da.clone().add(db).dot(perp);
    const sign = lateral >= 0 ? 1 : -1;
    const bow = Math.min(120, Math.max(30, span * 0.18));
    const control = mid.clone().addScaledVector(perp, sign * bow);

    const standoff = Math.min(Math.max(CORNER_RADIUS * 1.15, 26), span * 0.3);
    return [
        fa.clone().setY(y0),
        fa.clone().addScaledVector(da, standoff).setY(y0),
        control.setY(y0),
        fb.clone().addScaledVector(db, standoff).setY(y0),
        fb.clone().setY(y1)
    ];
}

/**
 * 构建两点之间的贴地走线曲线。
 * @param {THREE.Vector3} from 起点出线点（世界坐标，含出线高度）
 * @param {THREE.Vector3} to 终点出线点（世界坐标，含出线高度）
 * @param {'auto'|'straight'|'orthogonal'|'curve'} [type='auto'] 线条样式
 * @param {THREE.Vector3} [dirA] 起点水平引出方向（缺省时取 to - from）
 * @param {THREE.Vector3} [dirB] 终点水平引出方向（缺省时取 from - to）
 * @returns {THREE.CurvePath} 贴地走线曲线
 */
export function createCableCurve(from, to, type = 'auto', dirA = null, dirB = null) {
    let points;
    switch (type) {
        case 'straight':
            points = straightPoints(from, to, dirA, dirB);
            break;
        case 'curve':
            points = curvePoints(from, to, dirA, dirB);
            break;
        case 'orthogonal':
            points = orthogonalPoints(from, to, dirA, dirB);
            break;
        case 'auto':
        default:
            points = autoPoints(from, to, dirA, dirB);
            break;
    }
    return roundedPolylineCurve(points, CORNER_RADIUS);
}

/**
 * 生成端口护套（沿曲线切线方向的短圆柱，模拟电缆接头）。
 * @param {THREE.Vector3} point 端口位置
 * @param {THREE.Vector3} tangent 切线方向
 * @param {number} radius 管道半径
 * @returns {THREE.Mesh}
 */
function createSleeve(point, tangent, radius) {
    const length = radius * 2.6;
    const geo = new THREE.CylinderGeometry(radius * 1.5, radius * 1.15, length, 8);
    geo.userData.shared = false;
    const mesh = new THREE.Mesh(geo, MAT.darkPlastic);
    mesh.position.copy(point);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent.clone().normalize());
    mesh.castShadow = true;
    return mesh;
}

/**
 * 创建一条立体电缆（含基管、流光管与两端护套）。
 * @param {Object} options 参数
 * @param {number} options.radius 管道半径
 * @param {boolean} [options.noBase=false] 是否不渲染基管（用于连线模式下的临时引导线）
 * @returns {Object} 电缆对象
 */
export function createCable(options = {}) {
    const radius = options.radius || 2.6;
    const group = new THREE.Group();
    group.name = 'topoCable';
    // 基管与流光管在重建几何体时整体替换
    const baseMesh = new THREE.Mesh(new THREE.BufferGeometry(), MAT.cable);
    baseMesh.castShadow = false;
    baseMesh.receiveShadow = false;
    baseMesh.visible = !options.noBase;
    const flowMaterial = createFlowMaterial();
    const flowMesh = new THREE.Mesh(new THREE.BufferGeometry(), flowMaterial);
    flowMesh.renderOrder = 5;
    group.add(baseMesh, flowMesh);

    const sleeveMeshes = [];
    const cable = {
        group,
        baseMesh,
        flowMesh,
        flowMaterial,
        radius,
        curve: null,
        /** 当前几何体精度 */
        quality: 'high',
        /**
         * 重建电缆几何体。
         * @param {THREE.Vector3} from 起点世界坐标
         * @param {THREE.Vector3} to 终点世界坐标
         * @param {'high'|'low'} [quality='high'] 精度
         * @param {'auto'|'straight'|'orthogonal'|'curve'} [curveType='auto'] 线条样式
         * @param {THREE.Vector3} [dirA] 起点引出方向
         * @param {THREE.Vector3} [dirB] 终点引出方向
         */
        update(from, to, quality = 'high', curveType = 'auto', dirA = null, dirB = null) {
            const curve = createCableCurve(from, to, curveType, dirA, dirB);
            this.curve = curve;
            this.quality = quality;
            const seg = QUALITY[quality] || QUALITY.high;
            // 释放旧几何体（TubeGeometry 为一次性几何体，非共享缓存）
            baseMesh.geometry.dispose();
            flowMesh.geometry.dispose();
            baseMesh.geometry = new THREE.TubeGeometry(curve, seg.tubular, this.radius, seg.radial, false);
            flowMesh.geometry = new THREE.TubeGeometry(curve, seg.tubular, this.radius * 1.35, seg.radial, false);
            this._syncSleeves(curve);
        },
        /**
         * 同步两端护套位置与朝向。
         * @param {THREE.CurvePath} curve 电缆曲线
         */
        _syncSleeves(curve) {
            const start = curve.getPointAt(0);
            const end = curve.getPointAt(1);
            const startTangent = curve.getTangentAt(0);
            const endTangent = curve.getTangentAt(1);
            while (sleeveMeshes.length < 2) {
                const sleeve = createSleeve(start, startTangent, this.radius);
                group.add(sleeve);
                sleeveMeshes.push(sleeve);
            }
            sleeveMeshes[0].position.copy(start);
            sleeveMeshes[0].quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), startTangent.normalize());
            sleeveMeshes[1].position.copy(end);
            sleeveMeshes[1].quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), endTangent.normalize());
        },
        /** 释放几何体与材质 */
        dispose() {
            baseMesh.geometry.dispose();
            flowMesh.geometry.dispose();
            flowMaterial.dispose();
            sleeveMeshes.forEach((sleeve) => sleeve.geometry.dispose());
            sleeveMeshes.length = 0;
        }
    };
    return cable;
}

/**
 * 计算连线的管道半径（供外部预览使用）。
 * @param {Object} link 连线数据
 * @param {number} [fallbackWidth] 全局默认线宽（连线未显式设置时使用）
 * @returns {number}
 */
export function getCableRadius(link, fallbackWidth) {
    return radiusOf(link && link.style, fallbackWidth);
}
