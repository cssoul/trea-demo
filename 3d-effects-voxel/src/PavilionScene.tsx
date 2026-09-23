import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createHeritageMaterials } from "./heritage/materials";
import { HeritageBuilder } from "./heritage/builder";
import { buildPavilion, buildIsland } from "./heritage/pavilion";

export type DetailView = "overview" | "roof" | "finial";
type Props = { progress: number; view?: DetailView; onReady?: () => void };

/** Shared clock for the GPU wind sway on foliage (one uniform drives the whole island). */
const WIND_TIME = { value: 0 };

/** Wrap a material's existing construction shader with a subtle vertex wind sway. */
function addWind(mat: THREE.Material) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms, renderer: THREE.WebGLRenderer) => {
    prev.call(mat, shader, renderer);
    shader.uniforms.uWindTime = WIND_TIME;
    shader.vertexShader = "uniform float uWindTime;\n" + shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       float windPh = position.x * 0.28 + position.z * 0.22;
       float windSway = sin(uWindTime * 1.5 + windPh) * 0.6 + sin(uWindTime * 2.7 + windPh * 1.7) * 0.25;
       transformed.x += windSway * 0.07;
       transformed.z += windSway * 0.05;`,
    );
  };
  const prevKey = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : "") + "|wind";
  mat.needsUpdate = true;
}

export default function PavilionScene({ progress, view = "overview", onReady }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(progress), viewRef = useRef(view), readyRef = useRef(onReady);
  useEffect(() => { progressRef.current = progress; }, [progress]);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { readyRef.current = onReady; }, [onReady]);
  useEffect(() => {
    const mount = mountRef.current; if (!mount) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, .1, 700);
    camera.position.set(30, 21, 44);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, window.innerWidth < 700 ? 1.5 : 2));
    renderer.setClearColor(0xeef3f4, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    mount.appendChild(renderer.domElement);
    const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(room, .06); scene.environment = environment.texture; scene.environmentIntensity = .38;
    room.dispose(); pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xf3f7f2, 0x6f7a63, .78));
    const key = new THREE.DirectionalLight(0xfff3e0, 2.5); key.position.set(-26, 44, 34); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -19; key.shadow.camera.right = 19;
    key.shadow.camera.top = 22; key.shadow.camera.bottom = -14; key.shadow.camera.near = .5; key.shadow.camera.far = 140;
    key.target.position.set(0, 12, 0); key.shadow.normalBias = .025; key.shadow.bias = -.00015; key.shadow.radius = 3;
    scene.add(key, key.target);
    const fill = new THREE.DirectionalLight(0xe6eef0, .5); fill.position.set(26, 16, -12); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xfff4de, .7); rim.position.set(-14, 30, -26); scene.add(rim);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 10.5, 0); controls.enableDamping = true; controls.dampingFactor = .075;
    controls.enablePan = true; controls.minDistance = 12; controls.maxDistance = 120;
    controls.minPolarAngle = .35; controls.maxPolarAngle = Math.PI * .52;
    const materialKit = createHeritageMaterials(renderer), builder = new HeritageBuilder(materialKit.materials);
    buildIsland(builder); buildPavilion(builder); builder.finish(scene);
    addWind(materialKit.materials.moss);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const presets = {
      overview: { position: new THREE.Vector3(30, 21, 44), target: new THREE.Vector3(0, 10.5, 0) },
      roof: { position: new THREE.Vector3(15, 18.5, 21), target: new THREE.Vector3(0, 12.4, 0) },
      finial: { position: new THREE.Vector3(7.5, 23.5, 13.5), target: new THREE.Vector3(0, 22.6, 0) },
    };
    let lastView: DetailView = "overview", transition = false, raf = 0, lastNow = performance.now(), frames = 0, elapsed = 0;
    let needsFrame = true, lastProgress = -2, lastShadowProgress = -2, lastShadowTime = -Infinity;
    let renderedFrames = 0, shadowUpdates = 0;
    const interrupt = () => { transition = false; }; controls.addEventListener("start", interrupt);
    const resize = () => {
      const w = Math.max(1, mount.clientWidth), h = Math.max(1, mount.clientHeight);
      renderer.setSize(w, h, false); camera.aspect = w / h;
      camera.fov = camera.aspect < .58 ? 40 : 34; camera.updateProjectionMatrix();
      needsFrame = true;
    };
    const ro = new ResizeObserver(resize); ro.observe(mount); resize();
    builder.progress.value = progressRef.current;
    renderer.compile(scene, camera);
    const render = (now: number) => {
      const frameSeconds = (now - lastNow) / 1000;
      const dt = Math.min(frameSeconds, .1); lastNow = now;
      builder.progress.value = progressRef.current;
      if (!reducedMotion) { WIND_TIME.value = now / 1000; needsFrame = true; }
      if (lastView !== viewRef.current) { lastView = viewRef.current; transition = true; }
      if (transition) {
        const preset = presets[lastView], amount = reducedMotion ? 1 : 1 - Math.exp(-dt * 5);
        camera.position.lerp(preset.position, amount); controls.target.lerp(preset.target, amount);
        if (camera.position.distanceTo(preset.position) < .02) transition = false;
      }
      const cameraChanged = controls.update();
      const progressChanged = lastProgress !== progressRef.current;
      // Limit construction shadow work to 30 Hz. Final/rewound poses flush
      // immediately, and a paused intermediate pose flushes on the next tick.
      const shadowChanged = lastShadowProgress !== progressRef.current &&
        (now - lastShadowTime >= 1000 / 30 || progressRef.current === 0 || progressRef.current === 1);
      if (!document.hidden && (needsFrame || cameraChanged || transition || progressChanged || shadowChanged)) {
        if (shadowChanged) {
          renderer.shadowMap.needsUpdate = true;
          lastShadowProgress = progressRef.current; lastShadowTime = now; shadowUpdates++;
        }
        renderer.render(scene, camera); renderedFrames++;
        needsFrame = false; lastProgress = progressRef.current;
      }
      frames++; elapsed += frameSeconds;
      if (elapsed > .6) {
        mount.dataset.renderStats = JSON.stringify({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, pieces: builder.pieces, fps: Math.round(frames / elapsed), renderFps: Math.round(renderedFrames / elapsed), shadowUpdatesPerSecond: Math.round(shadowUpdates / elapsed), idle: renderedFrames === 0, dpr: renderer.getPixelRatio(), shadowLights: 1, postPasses: 0 });
        frames = 0; elapsed = 0; renderedFrames = 0; shadowUpdates = 0;
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render); readyRef.current?.();
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.removeEventListener("start", interrupt); controls.dispose();
      builder.dispose(); materialKit.dispose(); environment.dispose();
      key.shadow.map?.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, []);
  return <div ref={mountRef} className="three-scene" aria-label="可旋转的三维中国亭台营造动画" />;
}
