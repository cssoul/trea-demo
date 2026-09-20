/**
 * CableFactory 走线曲线几何验证（Node 环境，不依赖浏览器）
 * 验证点：
 *  1. 曲线全程 y 坐标 <= max(y0, y1)（贴地走线，不得再出现高空拱桥）
 *  2. 曲线连续（采样点间距有限）
 *  3. 转角均为圆角（相邻采样点方向变化平缓，无 180° 突变）
 *  4. 端点与出线点重合
 * 覆盖样式：auto（自动选型）/ straight（直线）/ curve（曲线）/ orthogonal（折线）
 */
import * as THREE from 'three';
import { createCableCurve } from '../src/views/topo/core/three/CableFactory.js';

let failures = 0;
function check(name, cond, detail) {
    if (cond) {
        console.log(`PASS  ${name}`);
    } else {
        failures += 1;
        console.error(`FAIL  ${name}${detail ? ' -> ' + detail : ''}`);
    }
}

function sampleCurve(curve, n = 400) {
    const pts = [];
    for (let i = 0; i <= n; i += 1) pts.push(curve.getPointAt(i / n));
    return pts;
}

function runCase(name, from, to, type, dirA, dirB) {
    const curve = createCableCurve(from, to, type, dirA, dirB);
    const pts = sampleCurve(curve);

    // 1. 端点校验
    check(`${name}: 端点=出线点`, pts[0].distanceTo(from) < 1e-3, `start=${pts[0].toArray()} expect=${from.toArray()}`);
    check(`${name}: 终点=对端出线点`, pts[pts.length - 1].distanceTo(to) < 1e-3, `end=${pts[pts.length - 1].toArray()} expect=${to.toArray()}`);

    // 2. 贴地校验：曲线高度不应超过两端出线高度的较大值 + 容差
    const maxY = Math.max(from.y, to.y);
    let peak = -Infinity;
    pts.forEach((p) => (peak = Math.max(peak, p.y)));
    check(`${name}: 无高空拱桥 (peak=${peak.toFixed(1)} <= ${maxY + 0.5})`, peak <= maxY + 0.5);

    // 3. 连续性：采样点间距有限（不出现跳变）
    let maxGap = 0;
    for (let i = 1; i < pts.length; i += 1) maxGap = Math.max(maxGap, pts[i].distanceTo(pts[i - 1]));
    const span = from.distanceTo(to);
    check(`${name}: 路径连续 (maxGap=${maxGap.toFixed(1)})`, maxGap < Math.max(40, span * 0.2));

    // 4. 方向突变校验（圆角倒角效果：相邻段夹角不应接近 180° 反折）
    let maxTurn = 0;
    for (let i = 2; i < pts.length; i += 1) {
        const d1 = pts[i - 1].clone().sub(pts[i - 2]);
        const d2 = pts[i].clone().sub(pts[i - 1]);
        if (d1.length() < 1e-6 || d2.length() < 1e-6) continue;
        const angle = d1.normalize().angleTo(d2.normalize());
        maxTurn = Math.max(maxTurn, angle);
    }
    check(`${name}: 圆角无反折 (maxTurn=${((maxTurn * 180) / Math.PI).toFixed(1)}° < 75°)`, maxTurn < (75 * Math.PI) / 180);

    console.log(`      -> type=${type}, 子曲线 ${curve.curves ? curve.curves.length : '-'} 段`);
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const styles = ['auto', 'straight', 'curve', 'orthogonal'];

// 场景 A：斜向连接（auto 应选折线，其余样式逐一验证）
styles.forEach((s) => runCase(`斜向/${s}`, V(0, 4, 0), V(300, 4, 220), s, V(1, 0, 0), V(0, 0, -1)));

// 场景 B：同轴直线（auto 应选直线）
styles.forEach((s) => runCase(`同轴/${s}`, V(0, 4, 0), V(300, 4, 0), s, V(1, 0, 0), V(-1, 0, 0)));

// 场景 C：相向对头（auto/orthogonal 走 U 形绕行）
runCase('对头/auto', V(0, 4, 0), V(60, 4, 0), 'auto', V(1, 0, 0), V(-1, 0, 0));
runCase('对头/orthogonal', V(0, 4, 0), V(60, 4, 0), 'orthogonal', V(1, 0, 0), V(-1, 0, 0));
runCase('对头/curve', V(0, 4, 0), V(60, 4, 0), 'curve', V(1, 0, 0), V(-1, 0, 0));

// 场景 D：短距连线（standoff 限幅，防自交）
styles.forEach((s) => runCase(`短距/${s}`, V(0, 4, 0), V(70, 4, 40), s, V(1, 0, 0), V(0, 0, -1)));

// 场景 E：缺省方向
runCase('缺省方向/auto', V(0, 4, 0), V(280, 4, 160), 'auto');
runCase('缺省方向/curve', V(0, 4, 0), V(280, 4, 160), 'curve');

// 场景 F：负坐标象限
styles.forEach((s) => runCase(`负象限/${s}`, V(-500, 4, -300), V(-900, 4, -80), s, V(-1, 0, 0), V(0, 0, 1)));

console.log(failures === 0 ? '\n全部用例通过 ✓' : `\n存在 ${failures} 个失败用例 ✗`);
process.exit(failures === 0 ? 0 : 1);
