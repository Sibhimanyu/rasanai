// Rasan Studio: a local preview for the character, its motions and scenes.
// Time is quantised to the scene's fps so what you scrub is exactly what Remotion renders.

import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type * as THREE from 'three';
import { SceneView } from '../scene/SceneView';
import { SCENES, motionShowcase } from '../scene/scenes/showcase';
import { MOTIONS, MOTION_NAMES } from '../motions';
import { LIGHTING } from '../stage/lighting';
import type { SceneDef } from '../scene/types';

type CamPreset = 'scene' | 'front' | 'reference' | 'threeQuarter' | 'side' | 'back' | 'top';
const CAMS: Record<Exclude<CamPreset, 'scene'>, { az: number; el: number; d: number; label: string }> = {
  front: { az: 0, el: 0.03, d: 9.5, label: 'Front' },
  reference: { az: -0.16, el: 0.03, d: 9.5, label: 'Reference' },
  threeQuarter: { az: 0.75, el: 0.08, d: 9.5, label: '¾' },
  side: { az: Math.PI / 2, el: 0.03, d: 9.5, label: 'Side' },
  back: { az: Math.PI, el: 0.05, d: 9.5, label: 'Back' },
  top: { az: 0.3, el: 0.75, d: 9.5, label: 'High' },
};
const TARGET: [number, number, number] = [0, 1.12, 0];

const BACKGROUNDS: Record<string, string> = {
  Studio: 'radial-gradient(110% 85% at 50% 38%, #fbf8f3 0%, #efe9e0 58%, #ddd5c9 100%)',
  Warm: 'radial-gradient(110% 85% at 50% 38%, #fff3df 0%, #f4dfbf 60%, #e2c89f 100%)',
  Cool: 'radial-gradient(110% 85% at 50% 38%, #f3f6fb 0%, #dfe6ef 60%, #c7d1de 100%)',
  Dusk: 'radial-gradient(110% 85% at 50% 38%, #3a3d4a 0%, #262832 60%, #17181e 100%)',
  Grey: '#bdbab5',
  Green: '#00b140',
};

const query = new URLSearchParams(location.search);
const CAPTURE = query.has('capture');

function sceneFor(key: string): SceneDef {
  return SCENES[key] ?? motionShowcase(key.replace(/^motion:/, ''));
}

function Perf({ onStats }: { onStats: (s: { fps: number; calls: number; tris: number }) => void }) {
  const gl = useThree((s) => s.gl);
  const acc = useRef({ n: 0, t: performance.now() });
  useEffect(() => { gl.info.autoReset = false; }, [gl]);
  useFrame(() => {
    // totals of the previous frame (all passes: shadows, contact shadows, main), then reset
    const a = acc.current;
    a.n++;
    const now = performance.now();
    if (now - a.t > 500) {
      onStats({ fps: Math.round((a.n * 1000) / (now - a.t)), calls: gl.info.render.calls, tris: gl.info.render.triangles });
      a.n = 0;
      a.t = now;
    }
    gl.info.reset();
  });
  return null;
}

function OrbitRig({ preset, controls }: { preset: CamPreset; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    if (preset === 'scene') return;
    const c = CAMS[preset];
    camera.position.set(
      TARGET[0] + Math.sin(c.az) * Math.cos(c.el) * c.d,
      TARGET[1] + Math.sin(c.el) * c.d,
      TARGET[2] + Math.cos(c.az) * Math.cos(c.el) * c.d,
    );
    (camera as THREE.PerspectiveCamera).fov = 22;
    camera.updateProjectionMatrix();
    controls.current?.target.set(...TARGET);
    controls.current?.update();
  }, [preset, camera, controls]);
  return null;
}

export function App() {
  const [sceneKey, setSceneKey] = useState(query.get('scene') ?? 'rasan-demo');
  const scene = useMemo(() => sceneFor(sceneKey), [sceneKey]);
  const total = Math.round(scene.duration * scene.fps);
  const [frame, setFrame] = useState(Math.round(Number(query.get('t') ?? 0) * scene.fps));
  const [playing, setPlaying] = useState(!CAPTURE && !query.has('t'));
  const [speed, setSpeed] = useState(1);
  const [cam, setCam] = useState<CamPreset>((query.get('cam') as CamPreset) ?? 'scene');
  const [lighting, setLighting] = useState(query.get('light') ?? 'studio');
  const [bg, setBg] = useState(query.get('bg') ?? 'Studio');
  const [wire, setWire] = useState(query.has('wire'));
  const [ref, setRef] = useState<'off' | 'side' | 'overlay'>((query.get('ref') as 'off') ?? 'off');
  const [refOpacity, setRefOpacity] = useState(0.5);
  const [portrait, setPortrait] = useState(query.has('portrait'));
  const [stats, setStats] = useState({ fps: 0, calls: 0, tris: 0 });
  const controls = useRef<OrbitControlsImpl>(null);

  // playback clock, quantised to frames
  const clock = useRef({ last: 0, acc: 0 });
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    clock.current.last = performance.now();
    const tick = (now: number) => {
      const c = clock.current;
      c.acc += ((now - c.last) / 1000) * speed * scene.fps;
      c.last = now;
      if (c.acc >= 1) {
        const step = Math.floor(c.acc);
        c.acc -= step;
        setFrame((f) => (f + step) % total);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, scene.fps, total]);

  useEffect(() => setFrame((f) => Math.min(f, total - 1)), [total]);

  // keyboard: space play/pause, arrows step
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'SELECT') return;
      if (e.code === 'Space') { e.preventDefault(); setPlaying((p) => !p); }
      if (e.code === 'ArrowRight') setFrame((f) => Math.min(total - 1, f + 1));
      if (e.code === 'ArrowLeft') setFrame((f) => Math.max(0, f - 1));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [total]);

  // headless capture hooks
  useEffect(() => {
    (window as any).setStudio = (o: { frame?: number; cam?: CamPreset; scene?: string }) => {
      if (o.scene) setSceneKey(o.scene);
      if (o.cam) setCam(o.cam);
      if (o.frame != null) setFrame(o.frame);
    };
  }, []);

  const time = frame / scene.fps;
  const onCreated = useCallback(() => setTimeout(() => ((window as any).__ready = true), 400), []);

  const viewport = (
    <div className={`viewport ${portrait ? 'portrait' : ''}`} style={{ background: BACKGROUNDS[bg] ?? bg }}>
      <Canvas
        shadows
        dpr={CAPTURE ? 1 : [1, 2]}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        camera={{ fov: 22, position: [0, 1.4, 9.5] }}
        onCreated={onCreated}
      >
        <SceneView scene={scene} time={time} portrait={portrait} driveCamera={cam === 'scene'} wireframe={wire} lighting={lighting} />
        <OrbitRig preset={cam} controls={controls} />
        <OrbitControls ref={controls} makeDefault enabled={cam !== 'scene'} target={TARGET} enableDamping={false} minDistance={2.5} maxDistance={30} />
        {!CAPTURE && <Perf onStats={setStats} />}
      </Canvas>
      {ref === 'overlay' && <img className="ref-overlay" src="/reference/rasan.png" style={{ opacity: refOpacity }} alt="" />}
      {CAPTURE ? null : (
        <div className="hud">
          {stats.fps} fps · {stats.calls} draws · {(stats.tris / 1000).toFixed(0)}k tris · {cam === 'scene' ? 'scene camera' : 'orbit'}
        </div>
      )}
    </div>
  );

  if (CAPTURE) return <div className="capture">{viewport}</div>;

  return (
    <div className="studio">
      <main>
        <div className="stage-row">
          {viewport}
          {ref === 'side' && (
            <div className="ref-side">
              <img src="/reference/rasan.png" alt="Rasan reference" />
              <span>Reference</span>
            </div>
          )}
        </div>
        <div className="transport">
          <button className="play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <input
            className="scrub"
            type="range"
            min={0}
            max={total - 1}
            value={frame}
            onChange={(e) => { setPlaying(false); setFrame(Number(e.target.value)); }}
          />
          <span className="tc">
            {time.toFixed(2)}s · f{frame.toString().padStart(3, '0')}/{total - 1}
          </span>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Speed">
            {[0.1, 0.25, 0.5, 1, 1.5, 2].map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
        </div>
      </main>

      <aside>
        <h1>Rasan Studio</h1>

        <section>
          <label>Animation</label>
          <select value={sceneKey} onChange={(e) => { setSceneKey(e.target.value); setFrame(0); setPlaying(true); }}>
            <optgroup label="Scenes">
              {Object.values(SCENES).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </optgroup>
            <optgroup label="Motions">
              {MOTION_NAMES.filter((n) => !n.startsWith('expr.')).map((n) => <option key={n} value={`motion:${n}`}>{n}</option>)}
            </optgroup>
            <optgroup label="Expressions">
              {MOTION_NAMES.filter((n) => n.startsWith('expr.')).map((n) => <option key={n} value={`motion:${n}`}>{n.slice(5)}</option>)}
            </optgroup>
          </select>
          <p className="hint">{sceneKey.startsWith('motion:') ? MOTIONS[sceneKey.slice(7)]?.description : `${scene.duration}s at ${scene.fps} fps`}</p>
        </section>

        <section>
          <label>Camera</label>
          <div className="seg">
            <button className={cam === 'scene' ? 'on' : ''} onClick={() => setCam('scene')}>Scene</button>
            {(Object.keys(CAMS) as (keyof typeof CAMS)[]).map((k) => (
              <button key={k} className={cam === k ? 'on' : ''} onClick={() => setCam(k)}>{CAMS[k].label}</button>
            ))}
          </div>
          <p className="hint">Presets switch to orbit: drag to rotate, scroll to zoom, right-drag to pan.</p>
        </section>

        <section>
          <label>Reference</label>
          <div className="seg">
            {(['off', 'side', 'overlay'] as const).map((r) => (
              <button key={r} className={ref === r ? 'on' : ''} onClick={() => { setRef(r); if (r !== 'off' && cam === 'scene') setCam('reference'); }}>{r}</button>
            ))}
          </div>
          {ref === 'overlay' && (
            <input type="range" min={0} max={1} step={0.05} value={refOpacity} onChange={(e) => setRefOpacity(Number(e.target.value))} aria-label="Overlay opacity" />
          )}
        </section>

        <section>
          <label>Lighting</label>
          <div className="seg">
            {Object.keys(LIGHTING).map((l) => (
              <button key={l} className={lighting === l ? 'on' : ''} onClick={() => setLighting(l)}>{l}</button>
            ))}
          </div>
        </section>

        <section>
          <label>Background</label>
          <div className="swatches">
            {Object.entries(BACKGROUNDS).map(([name, css]) => (
              <button key={name} title={name} className={bg === name ? 'on' : ''} style={{ background: css }} onClick={() => setBg(name)} />
            ))}
            <input type="color" aria-label="Custom background" onChange={(e) => setBg(e.target.value)} />
          </div>
        </section>

        <section className="toggles">
          <label className="check"><input type="checkbox" checked={wire} onChange={(e) => setWire(e.target.checked)} /> Wireframe</label>
          <label className="check"><input type="checkbox" checked={portrait} onChange={(e) => setPortrait(e.target.checked)} /> Portrait 9:16</label>
        </section>

        <footer>
          Space play/pause · ←/→ step a frame<br />
          Render: <code>npm run render</code>
        </footer>
      </aside>
    </div>
  );
}
