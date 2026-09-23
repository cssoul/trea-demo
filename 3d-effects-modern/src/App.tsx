import { useCallback, useEffect, useRef, useState } from 'react';
import TowerScene, { type ViewId } from './TowerScene';
import { GLASS_FLOORS, floorsAt } from './structure/complex';
import { DEFAULT_TIME, TIMES, presetOf, type TimeId } from './structure/daylight';

const DURATION = 20;
/** Display-only labels. The real schedule lives in `structure/complex.ts` — when
 *  you retime a phase there, retime its label here too. */
const STAGES: [string, number][] = [
  ['场地与道路', .08],
  ['白色石材裙房', .33],
  ['中庭玻璃合拢', .47],
  ['塔楼逐层爬升', .70],
  ['石材塔楼收头', .75],
  ['店招与入口雨篷', .79],
  ['街道与绿化', .885],
  ['暖光依次点亮', 1],
];
const VIEWS: [ViewId, string][] = [
  ['overview', '全景'], ['street', '街景'], ['atrium', '中庭'], ['summit', '塔顶'],
];

export default function App() {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<ViewId>('overview');
  const [time, setTime] = useState<TimeId>(DEFAULT_TIME);
  const started = useRef(0);
  const onReady = useCallback(() => { started.current = performance.now(); setReady(true); }, []);

  useEffect(() => {
    if (!ready || !playing) return;
    let frame = 0;
    const tick = (now: number) => {
      const next = Math.min(1, (now - started.current) / (DURATION * 1000));
      setProgress(next);
      if (next === 1) setPlaying(false); else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ready, playing]);

  const seek = useCallback((p: number) => {
    const next = Math.max(0, Math.min(1, p));
    started.current = performance.now() - next * DURATION * 1000;
    setProgress(next);
  }, []);
  const replay = () => { setView('overview'); seek(0); setPlaying(true); };
  const toggle = () => { seek(progress === 1 ? 0 : progress); setPlaying(progress === 1 || !playing); };
  const detail = (v: ViewId) => { setView(v); if (v !== 'overview') { seek(1); setPlaying(false); } };

  const stage = STAGES.find(([, end]) => progress < end)?.[0] ?? '落成';
  const storeys = floorsAt(progress);
  const climbing = progress >= .32 && progress < .72;
  const hour = presetOf(time);

  return <main className="poster">
    <div className="tower-stage">
      <TowerScene progress={progress} view={view} time={time} onReady={onReady}/>

      {/* Floats over the scene. Doubles as the stage read-out — the old floating
          stage chip sat exactly where this card now lives. */}
      <aside className="brief">
        <p className="micro">GLASS · STONE · LIGHT<br/>藏品 〇二 / 城市商业综合体</p>
        <h2>石头围合，<br/>玻璃透光。</h2>
        <p className="accent">{hour.caption}</p>
        <blockquote>裙房逐层砌起，中庭在两者之间合拢。<br/>塔楼拔起，暖光自内而外点亮。</blockquote>
        <ul className="spec">
          <li><span>塔楼</span><b>{GLASS_FLOORS} 层 / 3.6 m</b></li>
          <li><span>幕墙</span><b>深蓝绿镀膜玻璃</b></li>
          <li><span>石材</span><b>白色花岗岩干挂</b></li>
        </ul>
        <div className="index">
          <b>01</b><i/><span>{stage}</span>
          <em>{climbing ? `${storeys}/${GLASS_FLOORS} 层` : `${Math.round(progress * 100)}%`}</em>
        </div>
      </aside>

      <div className="controls">
        <div className="control-group">
          <span className="group-label">时间</span>
          <div className="group-row" role="group" aria-label="一天四时">
            {TIMES.map((t) => (
              <button key={t.id} disabled={!ready} aria-pressed={time === t.id}
                onClick={() => setTime(t.id)}>{t.label}</button>
            ))}
          </div>
        </div>
        <div className="control-group">
          <span className="group-label">视角</span>
          <div className="group-row" role="group" aria-label="观赏视角">
            {VIEWS.map(([id, label]) => (
              <button key={id} disabled={!ready} aria-pressed={view === id}
                onClick={() => detail(id)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="control-group">
          <div className="group-row">
            <button disabled={!ready} onClick={replay}>重新建造 ↺</button>
          </div>
        </div>
      </div>

      <div className="orbit-hint">拖动环视 · 滚轮近观</div>

      <div className="transport">
        <button className="play" disabled={!ready} onClick={toggle} aria-label={playing ? '暂停' : '播放'}>{playing ? 'Ⅱ' : '▶'}</button>
        <div className="timeline">
          <span style={{ width: `${progress * 100}%` }}/>
          <input aria-label="施工进度" disabled={!ready} type="range" min="0" max="1000"
            value={Math.round(progress * 1000)} onChange={(e) => seek(Number(e.target.value) / 1000)}/>
        </div>
        <time>{(progress * DURATION).toFixed(1)} / {DURATION} S</time>
      </div>

      {!ready && <div className="scene-loading">起吊 · 建造中</div>}
    </div>
  </main>;
}
