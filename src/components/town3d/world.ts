import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { buildCity, DEST_DOOR, DEST_LABEL, findPath, N, roadNeighbors, ZONE_DOOR, type Dest, type Pt } from "@/lib/agents/city";
import { ZONE_LABEL, type Zone } from "@/lib/agents/town";
import type { AgentView } from "@/lib/agents/types";
import { KIND_COLOR } from "@/components/town3d/kinds";

export type Pick = { type: "agent"; id: string } | { type: "zone"; zone: Zone } | { type: "dest"; dest: Dest };
export type Signals = {
  overdue: number;
  queued: number;
  working: number;
  openTasks: number;
  leadsToday: number | null;
};

const S = 2;
const FLOOR = 0.55;
const HALF = ((N - 1) / 2) * S;
const SPEED = 2.4;
const CYAN = "#22e1ff";
const VIOLET = "#9b7bff";
const MAGENTA = "#ff4fd8";

const STATUS_RING: Record<AgentView["status"], string> = {
  WORKING: VIOLET,
  BLOCKED: "#ff4d5e",
  IDLE: CYAN,
  OFFLINE: "#5b6275",
};

function cellToWorld(p: Pt) {
  return new THREE.Vector3(p.c * S - HALF, 0, p.r * S - HALF);
}

function rand(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d")!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function windowTextures(seed: number, wall: string, litChance: number) {
  const r = rand(seed);
  const cols = 4;
  const rows = 8;
  const palette = ["#7fe9ff", "#b49bff", "#ff8fe6", "#ffd28a"];
  const lit = Array.from({ length: cols * rows }, () => (r() < litChance ? palette[Math.floor(r() * palette.length)] : null));
  const map = canvasTexture(128, 256, (ctx) => {
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, 128, 256);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        ctx.fillStyle = "#0d1120";
        ctx.fillRect(10 + x * 29, 8 + y * 31, 20, 18);
      }
    }
  });
  const emissive = canvasTexture(128, 256, (ctx) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 128, 256);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const color = lit[y * cols + x];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(10 + x * 29, 8 + y * 31, 20, 18);
      }
    }
  });
  for (const t of [map, emissive]) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  return { map, emissive };
}

function glowTexture() {
  return canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
}

function skyTexture() {
  return canvasTexture(16, 512, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, "#03040b");
    g.addColorStop(0.55, "#0a0b1f");
    g.addColorStop(0.85, "#1a0f33");
    g.addColorStop(1, "#2a1240");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 512);
  });
}

function circuitTexture() {
  const tex = canvasTexture(256, 64, (ctx) => {
    ctx.fillStyle = "#070a14";
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = "rgba(34,225,255,0.55)";
    ctx.lineWidth = 1.5;
    const r = rand(9);
    for (let i = 0; i < 18; i++) {
      const x = r() * 256;
      const y = 8 + r() * 48;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 20 + r() * 40, y);
      ctx.lineTo(x + 30 + r() * 40, y + (r() - 0.5) * 20);
      ctx.stroke();
      ctx.fillStyle = "rgba(155,123,255,0.9)";
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    ctx.fillStyle = "rgba(34,225,255,0.8)";
    ctx.fillRect(0, 0, 256, 2);
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  return tex;
}

type HoloSign = { sprite: THREE.Sprite; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; title: string; accent: string; value: string };

type AgentActor = {
  view: AgentView;
  group: THREE.Group;
  body: THREE.Mesh;
  visor: THREE.Mesh;
  ring: THREE.Mesh;
  beam: THREE.Mesh;
  route: THREE.Line;
  labelEl: HTMLButtonElement;
  cell: Pt;
  path: Pt[];
  targetKey: string;
  offset: THREE.Vector3;
  wanderAt: number;
  phase: number;
};

type Vehicle = { mesh: THREE.Group; curve: THREE.CatmullRomCurve3; u: number; speed: number };
type Hoverable = { mat: THREE.MeshStandardMaterial; base: THREE.Color };

export class TownWorld {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private labels: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private controls: OrbitControls;
  private clock = new THREE.Clock();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pickables: THREE.Object3D[] = [];
  private actors = new Map<string, AgentActor>();
  private glow = glowTexture();
  private disposables: { dispose: () => void }[] = [];
  private frame = 0;
  private resizeObs: ResizeObserver;
  private hovered: Hoverable[] = [];
  private selection: Pick | null = null;
  private selectionMarker: THREE.Group;
  private beacon?: THREE.Mesh;
  private beaconGlow?: THREE.Sprite;
  private dish?: THREE.Object3D;
  private antennaLight?: THREE.Sprite;
  private hourHands: THREE.Object3D[] = [];
  private minuteHands: THREE.Object3D[] = [];
  private smoke: { mesh: THREE.Mesh; life: number }[] = [];
  private smokeOrigin = new THREE.Vector3();
  private fountainJet?: THREE.Mesh;
  private crates: THREE.Mesh[] = [];
  private vehicles: Vehicle[] = [];
  private animated: THREE.Object3D[] = [];
  private stars?: THREE.Points;
  private dust?: THREE.Points;
  private holos = new Map<string, HoloSign>();
  private signals: Signals = { overdue: 0, queued: 0, working: 0, openTasks: 0, leadsToday: null };
  private buildingAnchors = new Map<string, THREE.Vector3>();
  private downAt = { x: 0, y: 0 };
  private reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private intro = 0;
  private baseZoom = 1;
  private lowPower = false;
  private perfFrames = 0;
  private perfTime = 0;

  constructor(
    private container: HTMLElement,
    private onPick: (pick: Pick | null) => void
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.style.position = "absolute";
    this.labels.domElement.style.inset = "0";
    this.labels.domElement.style.pointerEvents = "none";
    this.labels.domElement.style.zIndex = "0";
    container.appendChild(this.labels.domElement);

    const sky = skyTexture();
    this.disposables.push(sky);
    this.scene.background = sky;
    this.scene.fog = new THREE.FogExp2("#0a0b1f", 0.012);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 400);
    this.camera.position.set(28, 26, 28);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minPolarAngle = 0.55;
    this.controls.maxPolarAngle = 1.15;
    this.controls.minZoom = 0.4;
    this.controls.maxZoom = 3;
    this.controls.screenSpacePanning = false;
    this.controls.autoRotate = !this.reduced;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.addEventListener("start", () => {
      this.controls.autoRotate = false;
      if (this.intro < 1) {
        this.intro = 1;
        this.camera.zoom = this.baseZoom;
        this.camera.updateProjectionMatrix();
      }
    });
    this.controls.addEventListener("change", () => {
      const t = this.controls.target;
      t.x = THREE.MathUtils.clamp(t.x, -HALF, HALF);
      t.z = THREE.MathUtils.clamp(t.z, -HALF, HALF);
      t.y = 0;
    });

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.62);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.selectionMarker = this.buildSelectionMarker();
    this.scene.add(this.selectionMarker);

    this.buildLights();
    this.buildSky();
    this.buildGround();
    this.buildCityBlocks();
    this.buildStreetlights();
    this.buildVehicles();

    const el = this.renderer.domElement;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", this.handleDown);
    el.addEventListener("pointerup", this.handleUp);
    el.addEventListener("pointermove", this.handleMove);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    if (this.reduced) this.intro = 1;
    this.resize();
    this.loop();
  }

  setAgents(agents: AgentView[]) {
    const seen = new Set<string>();
    for (const view of agents) {
      seen.add(view.id);
      let actor = this.actors.get(view.id);
      if (!actor) {
        actor = this.createActor(view);
        this.actors.set(view.id, actor);
      }
      actor.view = view;
      const { key, door } = this.targetFor(view);
      if (actor.targetKey !== key) {
        actor.targetKey = key;
        actor.path = findPath(actor.cell, door);
        this.updateRoute(actor);
      }
      this.styleActor(actor);
    }
    for (const [id, actor] of this.actors) {
      if (seen.has(id)) continue;
      this.scene.remove(actor.group, actor.route);
      actor.labelEl.remove();
      this.actors.delete(id);
    }
  }

  setSignals(signals: Signals) {
    this.signals = signals;
    const count = Math.min(6, signals.queued);
    this.crates.forEach((c, i) => (c.visible = i < count));
    this.drawHolo("tasks", signals.overdue > 0 ? `${signals.overdue} LATE` : `${signals.openTasks} OPEN`, signals.overdue > 0 ? "#ffb347" : CYAN);
    this.drawHolo("metrics", signals.leadsToday === null ? "OFFLINE" : `${signals.leadsToday} LEADS`, signals.leadsToday === null ? "#6b7280" : VIOLET);
    this.drawHolo("inbox", `${signals.queued} QUEUED`, "#ffb347");
    this.drawHolo("workshop", `${signals.working} ACTIVE`, signals.working > 0 ? MAGENTA : VIOLET);
  }

  setSelected(pick: Pick | null) {
    this.selection = pick;
    for (const actor of this.actors.values()) this.styleActor(actor);
    if (pick && pick.type !== "agent") {
      const key = pick.type === "zone" ? `zone:${pick.zone}` : `dest:${pick.dest}`;
      const anchor = this.buildingAnchors.get(key);
      if (anchor) {
        this.selectionMarker.position.set(anchor.x, 0.12, anchor.z);
        this.selectionMarker.visible = true;
        return;
      }
    }
    this.selectionMarker.visible = false;
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObs.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.handleDown);
    el.removeEventListener("pointerup", this.handleUp);
    el.removeEventListener("pointermove", this.handleMove);
    this.controls.dispose();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    this.disposables.forEach((d) => d.dispose());
    this.holos.forEach((h) => h.tex.dispose());
    this.glow.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    el.remove();
    this.labels.domElement.remove();
  }

  // ── scene construction ──────────────────────────────────────────

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight("#5d6cff", "#0a0b16", 0.6));
    const moon = new THREE.DirectionalLight("#8fa2ff", 0.9);
    moon.position.set(-18, 30, 12);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const sc = moon.shadow.camera;
    sc.left = -18;
    sc.right = 18;
    sc.top = 18;
    sc.bottom = -18;
    sc.near = 1;
    sc.far = 80;
    moon.shadow.bias = -0.0008;
    this.scene.add(moon);
    const rimA = new THREE.DirectionalLight(VIOLET, 0.9);
    rimA.position.set(20, 10, -20);
    this.scene.add(rimA);
    const rimB = new THREE.DirectionalLight(CYAN, 0.5);
    rimB.position.set(-20, 6, 20);
    this.scene.add(rimB);
  }

  private buildSky() {
    const r = rand(77);
    const count = 900;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = r() * Math.PI * 2;
      const phi = Math.acos(r() * 0.9);
      const radius = 70 + r() * 30;
      pos[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
      pos[i * 3 + 1] = Math.cos(phi) * radius - 10;
      pos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: "#cfd8ff", size: 0.35, sizeAttenuation: true, transparent: true, opacity: 0.85, map: this.glow, depthWrite: false, fog: false })
    );
    this.scene.add(this.stars);

    const motes = 220;
    const mpos = new Float32Array(motes * 3);
    for (let i = 0; i < motes; i++) {
      mpos[i * 3] = (r() - 0.5) * N * S;
      mpos[i * 3 + 1] = 0.5 + r() * 10;
      mpos[i * 3 + 2] = (r() - 0.5) * N * S;
    }
    const mgeo = new THREE.BufferGeometry();
    mgeo.setAttribute("position", new THREE.BufferAttribute(mpos, 3));
    this.dust = new THREE.Points(
      mgeo,
      new THREE.PointsMaterial({ color: CYAN, size: 0.12, transparent: true, opacity: 0.6, map: this.glow, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.scene.add(this.dust);
  }

  private neon<T extends THREE.Mesh>(mesh: T, color: string, opacity = 0.55): T {
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 20), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    mesh.add(edges);
    return mesh;
  }

  private animate(obj: THREE.Object3D, kind: "spin" | "orbit" | "blink" | "hover") {
    obj.userData.anim = kind;
    this.animated.push(obj);
    return obj;
  }

  private buildGround() {
    const size = N * S + 1.2;
    const circuit = circuitTexture();
    this.disposables.push(circuit);
    const sideMat = new THREE.MeshStandardMaterial({ map: circuit, emissiveMap: circuit, emissive: "#ffffff", emissiveIntensity: 0.8 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(size, 1.6, size), [
      sideMat,
      sideMat,
      new THREE.MeshStandardMaterial({ color: "#0b0e1a", roughness: 0.6, metalness: 0.3 }),
      new THREE.MeshStandardMaterial({ color: "#04050a" }),
      sideMat,
      sideMat,
    ]);
    slab.position.y = -0.8;
    slab.receiveShadow = true;
    this.scene.add(slab);

    const edge = new THREE.Mesh(new THREE.BoxGeometry(size + 0.1, 0.05, size + 0.1), new THREE.MeshBasicMaterial({ color: CYAN }));
    edge.position.y = -0.04;
    this.scene.add(edge);

    const under = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.glow, color: VIOLET, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    under.scale.set(size * 2.4, size * 1.3, 1);
    under.position.set(0, -4, 0);
    this.scene.add(under);

    const dashGeo = new THREE.PlaneGeometry(0.55, 0.06);
    const dashMat = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.75 });
    const zebraGeo = new THREE.PlaneGeometry(0.1, 0.7);
    const dashes: THREE.Matrix4[] = [];
    const zebras: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion();
    for (let c = 0; c < N; c++) {
      for (let r = 0; r < N; r++) {
        const vRoad = c % 4 === 0;
        const hRoad = r % 4 === 0;
        if (!vRoad && !hRoad) continue;
        const p = cellToWorld({ c, r });
        if (vRoad && hRoad) {
          for (const [dx, dz, rot] of [
            [0, -0.75, 0],
            [0, 0.75, 0],
            [-0.75, 0, Math.PI / 2],
            [0.75, 0, Math.PI / 2],
          ] as const) {
            for (let k = -2; k <= 2; k++) {
              const off = k * 0.28;
              q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, rot));
              zebras.push(
                new THREE.Matrix4().compose(new THREE.Vector3(p.x + dx + (rot ? 0 : off), 0.012, p.z + dz + (rot ? off : 0)), q, new THREE.Vector3(1, 0.42, 1))
              );
            }
          }
          continue;
        }
        q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, vRoad ? Math.PI / 2 : 0));
        dashes.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0.012, p.z), q, new THREE.Vector3(1, 1, 1)));
      }
    }
    const dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length);
    dashes.forEach((mm, i) => dashMesh.setMatrixAt(i, mm));
    this.scene.add(dashMesh);
    const zebraMesh = new THREE.InstancedMesh(zebraGeo, new THREE.MeshBasicMaterial({ color: "#c9d6ff", transparent: true, opacity: 0.35 }), zebras.length);
    zebras.forEach((mm, i) => zebraMesh.setMatrixAt(i, mm));
    this.scene.add(zebraMesh);
  }

  private buildCityBlocks() {
    const city = buildCity();
    const r = rand(7);
    const walls = ["#1b2033", "#20263b", "#261f3b", "#182833", "#262a42", "#1e1b30"];
    const variants = walls.map((w, i) => windowTextures(100 + i, w, 0.5));
    variants.forEach((v) => this.disposables.push(v.map, v.emissive));
    const roofMats = ["#141826", "#191d2d", "#11141f"].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.4 }));
    const sidewalk = new THREE.MeshStandardMaterial({ color: "#121626", roughness: 0.5, metalness: 0.35 });
    const grass = new THREE.MeshStandardMaterial({ color: "#0f3a2e", emissive: "#0b5c43", emissiveIntensity: 0.25 });
    const edgeColors = [CYAN, VIOLET, MAGENTA, CYAN];

    for (let c = 0; c < N; c++) {
      for (let rr = 0; rr < N; rr++) {
        const cell = city[c][rr];
        if (cell.kind === "road") continue;
        const p = cellToWorld({ c, r: rr });
        const lot = new THREE.Mesh(new THREE.BoxGeometry(S, 0.14, S), cell.kind === "park" ? grass : sidewalk);
        lot.position.set(p.x, 0.07, p.z);
        lot.receiveShadow = true;
        this.scene.add(lot);

        if (cell.kind === "park") {
          if (c === 6 && rr === 6) this.buildFountain(p);
          else this.buildTrees(p, r);
          continue;
        }
        if (cell.zone) {
          this.buildZoneLandmark(cell.zone, p);
          continue;
        }
        if (cell.dest) {
          this.buildDestLandmark(cell.dest, p);
          continue;
        }

        const v = variants[Math.floor(r() * variants.length)];
        const floors = cell.floors + 1 + Math.floor(r() * 4);
        const w = 1.25 + r() * 0.4;
        const d = 1.25 + r() * 0.4;
        const h = floors * FLOOR;
        const map = v.map.clone();
        const em = v.emissive.clone();
        map.repeat.set(1, floors / 8);
        em.repeat.set(1, floors / 8);
        map.needsUpdate = true;
        em.needsUpdate = true;
        this.disposables.push(map, em);
        const side = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: "#ffffff", emissiveIntensity: 1.2, roughness: 0.4, metalness: 0.5 });
        const roof = roofMats[Math.floor(r() * roofMats.length)];
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, side, side]);
        b.position.set(p.x, 0.14 + h / 2, p.z);
        b.castShadow = true;
        b.receiveShadow = true;
        this.neon(b, edgeColors[Math.floor(r() * edgeColors.length)], 0.35 + r() * 0.3);
        this.scene.add(b);
        this.addRooftop(p, 0.14 + h, w, d, r);
      }
    }
  }

  private addRooftop(p: THREE.Vector3, top: number, w: number, d: number, r: () => number) {
    const roll = r();
    if (roll < 0.3) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.9, 6), new THREE.MeshStandardMaterial({ color: "#8892a8", metalness: 0.8 }));
      mast.position.set(p.x + (r() - 0.5) * w * 0.4, top + 0.45, p.z + (r() - 0.5) * d * 0.4);
      this.scene.add(mast);
      const tip = this.sprite(r() < 0.5 ? "#ff4d5e" : CYAN, 0.55, 0.95);
      tip.position.set(mast.position.x, top + 0.92, mast.position.z);
      this.scene.add(this.animate(tip, "blink"));
    } else if (roll < 0.6) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.min(w, d) * 0.32, 0.025, 8, 32), new THREE.MeshBasicMaterial({ color: r() < 0.5 ? CYAN : MAGENTA }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(p.x, top + 0.18, p.z);
      this.scene.add(this.animate(ring, "orbit"));
    } else if (roll < 0.85) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.7, 0.04, d * 0.5),
        new THREE.MeshStandardMaterial({ color: "#1e2f66", emissive: "#2244aa", emissiveIntensity: 0.4, metalness: 0.7, roughness: 0.25 })
      );
      panel.position.set(p.x, top + 0.06, p.z);
      panel.rotation.x = -0.15;
      this.scene.add(panel);
    }
  }

  private buildTrees(p: THREE.Vector3, r: () => number) {
    const trunkMat = new THREE.MeshStandardMaterial({ color: "#2b2238" });
    const leafColors = ["#13c79a", "#1fe0b0", "#0fa884"];
    const count = 2 + Math.floor(r() * 2);
    for (let i = 0; i < count; i++) {
      const x = p.x + (r() - 0.5) * 1.3;
      const z = p.z + (r() - 0.5) * 1.3;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.4, 6), trunkMat);
      trunk.position.set(x, 0.34, z);
      this.scene.add(trunk);
      const color = leafColors[i % leafColors.length];
      const crown = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.26 + r() * 0.12, 0),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4, flatShading: true })
      );
      crown.position.set(x, 0.72, z);
      crown.castShadow = true;
      this.scene.add(crown);
    }
  }

  private buildFountain(p: THREE.Vector3) {
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.22, 32), new THREE.MeshStandardMaterial({ color: "#1a1f33", metalness: 0.6, roughness: 0.3 }));
    basin.position.set(p.x, 0.25, p.z);
    this.scene.add(this.neon(basin, CYAN, 0.7));
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 0.05, 32),
      new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 0.9, transparent: true, opacity: 0.85 })
    );
    water.position.set(p.x, 0.36, p.z);
    this.scene.add(water);
    const holo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.35, 1.6, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    holo.position.set(p.x, 1.2, p.z);
    this.scene.add(holo);
    this.fountainJet = holo;
    const glow = this.sprite(CYAN, 3.2, 0.5);
    glow.position.set(p.x, 0.7, p.z);
    this.scene.add(glow);
  }

  private holoSign(key: string, title: string, accent: string, at: THREE.Vector3) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sprite.scale.set(2.4, 1.2, 1);
    sprite.position.copy(at);
    sprite.userData.baseY = at.y;
    this.scene.add(this.animate(sprite, "hover"));
    const sign: HoloSign = { sprite, ctx, tex, title, accent, value: "" };
    this.holos.set(key, sign);
    this.paintHolo(sign);
  }

  private drawHolo(key: string, value: string, accent: string) {
    const sign = this.holos.get(key);
    if (!sign || (sign.value === value && sign.accent === accent)) return;
    sign.value = value;
    sign.accent = accent;
    this.paintHolo(sign);
  }

  private paintHolo(sign: HoloSign) {
    const { ctx } = sign;
    ctx.clearRect(0, 0, 256, 128);
    ctx.fillStyle = "rgba(10, 14, 30, 0.35)";
    ctx.fillRect(8, 16, 240, 96);
    ctx.strokeStyle = sign.accent;
    ctx.lineWidth = 3;
    const corner = 18;
    for (const [x, y, dx, dy] of [
      [8, 16, 1, 1],
      [248, 16, -1, 1],
      [8, 112, 1, -1],
      [248, 112, -1, -1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x, y + dy * corner);
      ctx.lineTo(x, y);
      ctx.lineTo(x + dx * corner, y);
      ctx.stroke();
    }
    ctx.fillStyle = sign.accent;
    ctx.font = "600 16px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(sign.title.toUpperCase(), 128, 46);
    ctx.font = "800 34px ui-monospace, monospace";
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = sign.accent;
    ctx.shadowBlur = 16;
    ctx.fillText(sign.value || "···", 128, 90);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    for (let y = 16; y < 112; y += 4) ctx.fillRect(8, y, 240, 1);
    sign.tex.needsUpdate = true;
  }

  private registerPick(obj: THREE.Object3D, pick: Pick, anchor: THREE.Vector3, labelText: string, accent: string) {
    obj.traverse((child) => {
      child.userData.pick = pick;
    });
    this.pickables.push(obj);
    const key = pick.type === "zone" ? `zone:${pick.zone}` : pick.type === "dest" ? `dest:${pick.dest}` : "";
    this.buildingAnchors.set(key, anchor.clone());

    const el = document.createElement("button");
    el.type = "button";
    el.className = "town-label";
    el.style.setProperty("--accent", accent);
    el.textContent = labelText;
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      this.onPick(pick);
    });
    const label = new CSS2DObject(el);
    label.position.copy(anchor);
    this.scene.add(label);
  }

  private stdMat(color: string, extra: THREE.MeshStandardMaterialParameters = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.45, ...extra });
  }

  private add(mesh: THREE.Mesh, group: THREE.Group, x: number, y: number, z: number, edge?: string) {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (edge) this.neon(mesh, edge, 0.8);
    group.add(mesh);
    return mesh;
  }

  private sprite(color: string, scale: number, opacity = 0.8) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.set(scale, scale, 1);
    return s;
  }

  private buildZoneLandmark(zone: Zone, p: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(p);
    this.scene.add(g);
    let top = 2;
    let accent = "#ffb347";

    if (zone === "INBOX") {
      this.add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 1.5), this.stdMat("#2a1d2e")), g, 0, 0.59, 0, accent);
      const roofShape = new THREE.Shape();
      roofShape.moveTo(-0.95, 0);
      roofShape.lineTo(0, 0.45);
      roofShape.lineTo(0.95, 0);
      roofShape.lineTo(-0.95, 0);
      const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 1.6, bevelEnabled: false }), this.stdMat("#1a1f30"));
      roof.position.set(0, 1.04, -0.8);
      g.add(this.neon(roof, accent, 0.7));
      for (const x of [-0.5, 0, 0.5]) {
        this.add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.04), this.stdMat("#111", { emissive: accent, emissiveIntensity: 0.9 })), g, x, 0.4, 0.76);
      }
      const crateMat = this.stdMat("#3a2a18", { emissive: "#ff9a3d", emissiveIntensity: 0.5 });
      for (let i = 0; i < 6; i++) {
        const crate = this.add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), crateMat), g, -0.75 + (i % 3) * 0.3, 0.27 + Math.floor(i / 3) * 0.27, 0.95, accent);
        crate.visible = false;
        this.crates.push(crate);
      }
      top = 1.9;
      this.holoSign("inbox", "inbox", accent, new THREE.Vector3(p.x, top + 1.5, p.z));
    } else if (zone === "WORKSHOP") {
      accent = MAGENTA;
      this.add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 1.6), this.stdMat("#1e2034")), g, 0, 0.69, 0, accent);
      for (let i = 0; i < 3; i++) {
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 1.5), this.stdMat("#2a1d3d", { emissive: VIOLET, emissiveIntensity: 0.6 }));
        tooth.rotation.z = 0.35;
        this.add(tooth, g, -0.6 + i * 0.6, 1.36, 0, MAGENTA);
      }
      this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.6, 16), this.stdMat("#251a2e")), g, 0.6, 2.0, -0.45, MAGENTA);
      this.smokeOrigin.set(p.x + 0.6, 2.85, p.z - 0.45);
      for (let i = 0; i < 12; i++) {
        const puff = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 8, 8),
          new THREE.MeshBasicMaterial({ color: MAGENTA, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
        );
        puff.position.copy(this.smokeOrigin);
        this.scene.add(puff);
        this.smoke.push({ mesh: puff, life: i / 12 });
      }
      top = 3.1;
      this.holoSign("workshop", "workshop", accent, new THREE.Vector3(p.x, top + 1.5, p.z));
    } else if (zone === "DESK") {
      accent = "#ff4d5e";
      this.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.4, 1.4), this.stdMat("#221a26")), g, 0, 0.84, 0, accent);
      const awning = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.45), this.stdMat("#3a1420", { emissive: accent, emissiveIntensity: 0.7 }));
      awning.rotation.x = 0.35;
      this.add(awning, g, 0, 0.95, 0.85);
      this.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.04), this.stdMat("#111", { emissive: "#ff6b7a", emissiveIntensity: 2 })), g, 0, 1.3, 0.72);
      top = 2.3;
    }

    this.registerPick(g, { type: "zone", zone }, new THREE.Vector3(p.x, top + 0.4, p.z), ZONE_LABEL[zone], accent);
  }

  private buildDestLandmark(dest: Dest, p: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(p);
    this.scene.add(g);
    let top = 3;
    let accent = CYAN;

    if (dest === "tasks") {
      const glass = this.stdMat("#0d2a40", { metalness: 0.9, roughness: 0.08, emissive: "#0a3a5a", emissiveIntensity: 0.8 });
      this.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 5.2, 1.4), glass), g, 0, 2.74, 0, CYAN);
      this.add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, 1.0), glass), g, 0, 6.04, 0, CYAN);
      this.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), glass), g, 0, 7.04, 0, VIOLET);
      for (let y = 0.6; y < 5.2; y += 0.55) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.03, 1.42), new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.6 }));
        stripe.position.set(0, 0.14 + y, 0);
        g.add(stripe);
      }
      for (let i = 0; i < 3; i++) {
        const halo = new THREE.Mesh(new THREE.TorusGeometry(1.0 + i * 0.12, 0.02, 8, 64), new THREE.MeshBasicMaterial({ color: i === 1 ? VIOLET : CYAN }));
        halo.rotation.x = Math.PI / 2 + (i - 1) * 0.12;
        halo.position.set(0, 3 + i * 1.2, 0);
        g.add(this.animate(halo, "orbit"));
      }
      this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.2, 8), this.stdMat("#c9ced8", { metalness: 1 })), g, 0, 7.94, 0);
      this.beacon = this.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), new THREE.MeshBasicMaterial({ color: CYAN })), g, 0, 8.6, 0);
      this.beaconGlow = this.sprite(CYAN, 2.4, 0.9);
      this.beaconGlow.position.set(0, 8.6, 0);
      g.add(this.beaconGlow);
      top = 9.1;
      this.holoSign("tasks", "task tower", accent, new THREE.Vector3(p.x, top + 1.5, p.z));
    } else if (dest === "calendar") {
      accent = "#2dd4bf";
      const shell = this.stdMat("#1b2232");
      this.add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.2, 1.6), shell), g, 0, 0.24, 0, accent);
      this.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.2), shell), g, 0, 0.89, -0.1, accent);
      for (const x of [-0.6, -0.2, 0.2, 0.6]) {
        this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 12), this.stdMat("#0e1220", { emissive: accent, emissiveIntensity: 0.7 })), g, x, 0.89, 0.62);
      }
      this.add(new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.5, 0.75), shell), g, 0, 2.2, -0.2, accent);
      const crystal = this.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.4), this.stdMat("#0e2a2a", { emissive: accent, emissiveIntensity: 0.8 })), g, 0, 3.4, -0.2, accent);
      this.animate(crystal, "spin");
      for (const face of [
        { pos: new THREE.Vector3(0, 2.4, 0.18), rotY: 0 },
        { pos: new THREE.Vector3(0.38, 2.4, -0.2), rotY: Math.PI / 2 },
      ]) {
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.28, 48), new THREE.MeshBasicMaterial({ color: "#0b1a1d" }));
        disc.position.copy(face.pos);
        disc.rotation.y = face.rotY;
        g.add(disc);
        const rim = new THREE.Mesh(new THREE.RingGeometry(0.27, 0.3, 48), new THREE.MeshBasicMaterial({ color: accent }));
        rim.position.copy(face.pos);
        rim.rotation.y = face.rotY;
        rim.translateZ(0.002);
        g.add(rim);
        const pivot = new THREE.Object3D();
        pivot.position.copy(face.pos);
        pivot.rotation.y = face.rotY;
        const hh = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.15), new THREE.MeshBasicMaterial({ color: accent }));
        hh.position.set(0, 0.075, 0.01);
        const handH = new THREE.Object3D();
        handH.add(hh);
        const mh = new THREE.Mesh(new THREE.PlaneGeometry(0.025, 0.22), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
        mh.position.set(0, 0.11, 0.012);
        const handM = new THREE.Object3D();
        handM.add(mh);
        pivot.add(handH, handM);
        g.add(pivot);
        this.hourHands.push(handH);
        this.minuteHands.push(handM);
      }
      top = 4.0;
    } else if (dest === "people") {
      accent = "#60a5fa";
      const glass = this.stdMat("#2b5c9a", { metalness: 0.8, roughness: 0.06, transparent: true, opacity: 0.75, emissive: "#1d4f87", emissiveIntensity: 0.9 });
      this.add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.5), this.stdMat("#121726")), g, 0, 0.39, 0, accent);
      this.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 1.3), glass), g, 0, 1.94, 0, accent);
      for (let y = 0.9; y < 3.2; y += 0.45) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.04, 1.32), new THREE.MeshBasicMaterial({ color: "#9fd0ff", transparent: true, opacity: 0.65 }));
        band.position.set(0, y, 0);
        g.add(band);
      }
      this.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 1.4), this.stdMat("#121726")), g, 0, 3.3, 0, accent);
      top = 3.8;
    } else {
      accent = VIOLET;
      this.add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.5), this.stdMat("#1a1830")), g, 0, 0.74, 0, accent);
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: "#2a1f5a", emissive: VIOLET, emissiveIntensity: 0.5, wireframe: true })
      );
      this.add(dome, g, -0.3, 1.34, 0.1);
      const dishPivot = new THREE.Object3D();
      dishPivot.position.set(0.45, 1.5, -0.3);
      const dish = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 24, 12, 0, Math.PI * 2, 0, Math.PI / 3),
        this.stdMat("#2b2160", { side: THREE.DoubleSide, emissive: VIOLET, emissiveIntensity: 0.6 })
      );
      dish.rotation.x = -Math.PI / 2 + 0.5;
      dishPivot.add(dish);
      g.add(dishPivot);
      this.dish = dishPivot;
      this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.4, 6), this.stdMat("#c9ced8", { metalness: 1 })), g, 0.6, 2.0, 0.5);
      this.antennaLight = this.sprite("#ff4d5e", 0.9, 0.9);
      this.antennaLight.position.set(0.6, 2.75, 0.5);
      g.add(this.antennaLight);
      top = 3.1;
      this.holoSign("metrics", "metrics lab", accent, new THREE.Vector3(p.x, top + 1.5, p.z));
    }

    this.registerPick(g, { type: "dest", dest }, new THREE.Vector3(p.x, top + 0.3, p.z), DEST_LABEL[dest], accent);
  }

  private buildStreetlights() {
    const poleMat = this.stdMat("#2a3045", { metalness: 0.8 });
    for (let c = 0; c <= 12; c += 4) {
      for (let r = 0; r <= 12; r += 4) {
        const p = cellToWorld({ c, r });
        const x = p.x + 0.85;
        const z = p.z + 0.85;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.2, 6), poleMat);
        pole.position.set(x, 0.6, z);
        this.scene.add(pole);
        const color = (c + r) % 8 === 0 ? CYAN : VIOLET;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshBasicMaterial({ color }));
        bulb.position.set(x, 1.22, z);
        this.scene.add(bulb);
        const pool = new THREE.Mesh(
          new THREE.CircleGeometry(0.9, 24),
          new THREE.MeshBasicMaterial({ map: this.glow, color, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending })
        );
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(x, 0.02, z);
        this.scene.add(pool);
      }
    }
  }

  private buildVehicles() {
    const H = HALF + 2.5;
    const lanes: THREE.Vector3[][] = [
      [new THREE.Vector3(-H, 6, -H), new THREE.Vector3(H, 6.5, -H), new THREE.Vector3(H, 7, H), new THREE.Vector3(-H, 6.5, H)],
      [new THREE.Vector3(-H + 3, 8.5, H - 3), new THREE.Vector3(H - 3, 9, H - 3), new THREE.Vector3(H - 3, 8.5, -H + 3), new THREE.Vector3(-H + 3, 9, -H + 3)],
      [new THREE.Vector3(0, 5, -H - 2), new THREE.Vector3(H + 2, 5.5, 0), new THREE.Vector3(0, 6, H + 2), new THREE.Vector3(-H - 2, 5.5, 0)],
    ];
    const colors = [CYAN, MAGENTA, VIOLET, "#ffb347"];
    lanes.forEach((pts, i) => {
      const curve = new THREE.CatmullRomCurve3(pts, true, "catmullrom", 0.6);
      const rail = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(160)),
        new THREE.LineDashedMaterial({ color: "#3b4cff", dashSize: 0.4, gapSize: 0.6, transparent: true, opacity: 0.25 })
      );
      rail.computeLineDistances();
      this.scene.add(rail);
      for (let k = 0; k < 4; k++) {
        const color = colors[(i + k) % colors.length];
        const car = new THREE.Group();
        const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.42, 4, 8), new THREE.MeshStandardMaterial({ color: "#1a1d2e", metalness: 0.8, roughness: 0.2 }));
        hull.rotation.x = Math.PI / 2;
        car.add(hull);
        const light = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.5), new THREE.MeshBasicMaterial({ color }));
        light.position.y = -0.1;
        car.add(light);
        car.add(this.sprite(color, 1.1, 0.7));
        const trail = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0, 0.08, 1.6, 8, 1, true),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        trail.rotation.x = -Math.PI / 2;
        trail.position.z = -1.0;
        car.add(trail);
        this.scene.add(car);
        this.vehicles.push({ mesh: car, curve, u: (k / 4 + i * 0.07) % 1, speed: 0.025 + (k % 2) * 0.012 });
      }
    });
  }

  private buildSelectionMarker() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.25, 1.42, 64),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.95, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.3, 12, 48, 1, true),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.08, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    column.position.y = 6;
    g.add(column);
    g.visible = false;
    return g;
  }

  // ── agents ──────────────────────────────────────────────────────

  private targetFor(view: AgentView): { key: string; door: Pt } {
    if (view.status === "WORKING" && view.currentTaskId) return { key: "dest:tasks", door: DEST_DOOR.tasks };
    return { key: `zone:${view.zone}`, door: ZONE_DOOR[view.zone] };
  }

  private createActor(view: AgentView): AgentActor {
    const color = KIND_COLOR[view.kind];
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.2, 0.32, 6, 12),
      new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.6, emissive: color, emissiveIntensity: 0.45, transparent: true })
    );
    body.position.y = 0.42;
    body.castShadow = true;
    group.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.3), new THREE.MeshStandardMaterial({ color: "#d9e1f2", roughness: 0.2, metalness: 0.5, transparent: true }));
    head.position.y = 0.84;
    head.castShadow = true;
    group.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.02), new THREE.MeshBasicMaterial({ color: CYAN }));
    visor.position.set(0, 0.86, 0.16);
    group.add(visor);
    const antenna = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshBasicMaterial({ color }));
    antenna.position.y = 1.06;
    group.add(antenna);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.42, 32),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    group.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.32, 7, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: VIOLET, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    beam.position.y = 4.4;
    beam.visible = false;
    group.add(beam);
    const halo = this.sprite(color, 1.2, 0.45);
    halo.position.y = 0.5;
    group.add(halo);

    const pick: Pick = { type: "agent", id: view.id };
    group.traverse((c) => (c.userData.pick = pick));
    this.pickables.push(group);

    const labelEl = document.createElement("button");
    labelEl.type = "button";
    labelEl.className = "agent-label";
    labelEl.addEventListener("pointerdown", (e) => e.stopPropagation());
    labelEl.addEventListener("click", (e) => {
      e.stopPropagation();
      this.onPick(pick);
    });
    const label = new CSS2DObject(labelEl);
    group.add(label);

    const h = hashString(view.id);
    label.position.set(0, 1.45 + (h % 3) * 0.32, 0);
    const offset = new THREE.Vector3(((h % 7) - 3) * 0.22, 0, (((h >> 3) % 7) - 3) * 0.22);
    const { key, door } = this.targetFor(view);
    const start = { ...door };
    group.position.copy(cellToWorld(start)).add(offset);
    this.scene.add(group);

    const route = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({ color, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.9 })
    );
    route.visible = false;
    this.scene.add(route);

    return { view, group, body, visor, ring, beam, route, labelEl, cell: start, path: [], targetKey: key, offset, wanderAt: 0, phase: (h % 100) / 16 };
  }

  private updateRoute(actor: AgentActor) {
    if (actor.path.length < 1 || actor.targetKey === "zone:PARK") {
      actor.route.visible = false;
      return;
    }
    const pts = [actor.group.position.clone(), ...actor.path.map((p) => cellToWorld(p).add(actor.offset))].map((v) => new THREE.Vector3(v.x, 0.06, v.z));
    actor.route.geometry.dispose();
    actor.route.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    actor.route.computeLineDistances();
    actor.route.visible = true;
  }

  private styleActor(actor: AgentActor) {
    const v = actor.view;
    const selected = this.selection?.type === "agent" && this.selection.id === v.id;
    const ringMat = actor.ring.material as THREE.MeshBasicMaterial;
    ringMat.color.set(selected ? "#ffffff" : STATUS_RING[v.status]);
    ringMat.opacity = selected ? 1 : v.status === "IDLE" ? 0.45 : 0.9;
    const offline = v.status === "OFFLINE";
    actor.group.traverse((c) => {
      const mat = (c as THREE.Mesh).material as THREE.Material | undefined;
      if (mat && c !== actor.ring && c !== actor.beam && !(c instanceof THREE.Sprite)) mat.opacity = offline ? 0.35 : 1;
    });
    actor.beam.visible = v.status === "WORKING";
    (actor.visor.material as THREE.MeshBasicMaterial).color.set(v.status === "BLOCKED" ? "#ff4d5e" : v.status === "WORKING" ? "#d8c8ff" : CYAN);
    actor.labelEl.replaceChildren();
    actor.labelEl.dataset.status = v.status.toLowerCase();
    actor.labelEl.dataset.selected = selected ? "true" : "false";
    const dot = document.createElement("span");
    dot.className = "agent-label-dot";
    dot.style.background = KIND_COLOR[v.kind];
    const name = document.createElement("span");
    name.textContent = v.name;
    const state = document.createElement("span");
    state.className = "agent-label-state";
    state.textContent =
      v.status === "WORKING" ? (v.currentTaskId ? "on a task" : "working") : v.status === "BLOCKED" ? "stuck" : v.status === "OFFLINE" ? "offline" : ZONE_LABEL[v.zone].toLowerCase();
    actor.labelEl.append(dot, name, state);
  }

  private stepActor(actor: AgentActor, dt: number, t: number) {
    const g = actor.group;
    if (!actor.path.length && actor.targetKey === "zone:PARK" && t > actor.wanderAt) {
      const door = ZONE_DOOR.PARK;
      const options = roadNeighbors(actor.cell).filter((q) => Math.abs(q.c - door.c) + Math.abs(q.r - door.r) <= 4);
      if (options.length) actor.path.push(options[Math.floor(Math.random() * options.length)]);
      actor.wanderAt = t + 1.5 + Math.random() * 3;
    }

    let moving = false;
    if (actor.path.length) {
      const goal = cellToWorld(actor.path[0]).add(actor.offset);
      const delta = goal.clone().sub(g.position);
      delta.y = 0;
      const stepLen = SPEED * dt;
      if (delta.length() <= stepLen) {
        g.position.x = goal.x;
        g.position.z = goal.z;
        actor.cell = actor.path.shift()!;
        this.updateRoute(actor);
      } else {
        delta.normalize();
        g.position.x += delta.x * stepLen;
        g.position.z += delta.z * stepLen;
        const yaw = Math.atan2(delta.x, delta.z);
        g.rotation.y += Math.atan2(Math.sin(yaw - g.rotation.y), Math.cos(yaw - g.rotation.y)) * 0.25;
      }
      moving = true;
    }

    const working = actor.view.status === "WORKING";
    g.position.y = moving ? Math.abs(Math.sin(t * 10 + actor.phase)) * 0.08 : working ? 0.15 + Math.sin(t * 3 + actor.phase) * 0.08 : Math.sin(t * 2 + actor.phase) * 0.02;
    actor.body.rotation.z = moving ? Math.sin(t * 10 + actor.phase) * 0.08 : 0;
    const pulse = 1 + (working ? Math.sin(t * 5 + actor.phase) * 0.18 : 0);
    actor.ring.scale.set(pulse, pulse, pulse);
    if (working) {
      actor.ring.rotation.z += dt * 2;
      (actor.beam.material as THREE.MeshBasicMaterial).opacity = 0.22 + Math.abs(Math.sin(t * 4 + actor.phase)) * 0.2;
      actor.beam.rotation.y += dt;
    }
    if (actor.route.visible) (actor.route.material as THREE.LineDashedMaterial).opacity = 0.6 + Math.sin(t * 6) * 0.3;
  }

  // ── interaction ─────────────────────────────────────────────────

  private pickAt(clientX: number, clientY: number): Pick | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    for (const hit of this.raycaster.intersectObjects(this.pickables, true)) {
      const pick = hit.object.userData.pick as Pick | undefined;
      if (pick) return pick;
    }
    return null;
  }

  private handleDown = (e: PointerEvent) => {
    this.downAt = { x: e.clientX, y: e.clientY };
  };

  private handleUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 6) return;
    this.onPick(this.pickAt(e.clientX, e.clientY));
  };

  private handleMove = (e: PointerEvent) => {
    if (e.buttons) return;
    const pick = this.pickAt(e.clientX, e.clientY);
    this.renderer.domElement.style.cursor = pick ? "pointer" : "grab";
    for (const h of this.hovered) h.mat.emissive.copy(h.base);
    this.hovered = [];
    if (!pick || pick.type === "agent") return;
    const target = this.pickables.find((o) => JSON.stringify(o.userData.pick) === JSON.stringify(pick));
    target?.traverse((c) => {
      const mat = (c as THREE.Mesh).material;
      if (!(mat instanceof THREE.MeshStandardMaterial)) return;
      this.hovered.push({ mat, base: mat.emissive.clone() });
      mat.emissive.offsetHSL(0, 0, 0.15);
    });
  };

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.labels.setSize(w, h);
    const view = 17;
    const aspect = w / h;
    this.camera.left = -view * aspect;
    this.camera.right = view * aspect;
    this.camera.top = view;
    this.camera.bottom = -view;
    this.baseZoom = Math.min(0.82 * aspect, 1.26);
    if (this.intro >= 1) this.camera.zoom = this.baseZoom;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    const motion = this.reduced ? 0.2 : 1;

    if (this.intro < 1) {
      this.intro = Math.min(1, this.intro + dt / 2.4);
      const e = 1 - Math.pow(1 - this.intro, 3);
      this.camera.zoom = this.baseZoom * (0.45 + 0.55 * e);
      const angle = Math.PI / 4 + (1 - e) * 1.4;
      const r = Math.hypot(28, 28);
      this.camera.position.set(Math.cos(angle) * r, 26 + (1 - e) * 18, Math.sin(angle) * r);
      this.camera.updateProjectionMatrix();
    }

    for (const actor of this.actors.values()) this.stepActor(actor, dt, t);

    for (const v of this.vehicles) {
      v.u = (v.u + v.speed * dt * motion) % 1;
      const p = v.curve.getPointAt(v.u);
      v.mesh.position.copy(p);
      v.mesh.lookAt(p.clone().add(v.curve.getTangentAt(v.u)));
    }
    if (this.stars) this.stars.rotation.y = t * 0.005;
    if (this.dust) this.dust.rotation.y = t * 0.02 * motion;

    for (const obj of this.animated) {
      switch (obj.userData.anim) {
        case "spin":
          obj.rotation.y += dt * 0.8 * motion;
          break;
        case "orbit":
          obj.rotation.z += dt * 0.6 * motion;
          break;
        case "blink":
          (obj as THREE.Sprite).material.opacity = Math.sin(t * 2.5 + obj.position.x * 3) > 0.3 ? 0.95 : 0.2;
          break;
        case "hover":
          obj.position.y = obj.userData.baseY + Math.sin(t * 1.5 + obj.position.x) * 0.12 * motion;
          break;
      }
    }

    if (this.beacon && this.beaconGlow) {
      const alert = this.signals.overdue > 0;
      const color = alert ? "#ffb347" : CYAN;
      (this.beacon.material as THREE.MeshBasicMaterial).color.set(color);
      this.beaconGlow.material.color.set(color);
      const s = 2 + Math.sin(t * (alert ? 6 : 2.5)) * 0.7;
      this.beaconGlow.scale.set(s, s, 1);
    }
    if (this.dish) this.dish.rotation.y = t * 0.6 * motion;
    if (this.antennaLight) this.antennaLight.material.opacity = Math.sin(t * 3) > 0.2 ? 0.95 : 0.15;
    if (this.fountainJet) {
      this.fountainJet.rotation.y = t * 0.8;
      (this.fountainJet.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(t * 3) * 0.1;
    }
    if (this.hourHands.length) {
      const now = new Date();
      const minutes = now.getMinutes() + now.getSeconds() / 60;
      const hours = (now.getHours() % 12) + minutes / 60;
      for (const h of this.hourHands) h.rotation.z = -(hours / 12) * Math.PI * 2;
      for (const m of this.minuteHands) m.rotation.z = -(minutes / 60) * Math.PI * 2;
    }
    const smokeRate = this.signals.working > 0 ? 0.55 : 0.18;
    for (const puff of this.smoke) {
      puff.life += dt * smokeRate;
      if (puff.life > 1) puff.life -= 1;
      const l = puff.life;
      puff.mesh.position.set(this.smokeOrigin.x + Math.sin(l * 6 + t) * 0.15, this.smokeOrigin.y + l * 2.4, this.smokeOrigin.z);
      const s = 0.5 + l * 1.6;
      puff.mesh.scale.set(s, s, s);
      (puff.mesh.material as THREE.MeshBasicMaterial).opacity = (this.signals.working > 0 ? 0.45 : 0.18) * Math.sin(l * Math.PI);
    }
    if (this.selectionMarker.visible) {
      const s = 1 + Math.sin(t * 4) * 0.05;
      this.selectionMarker.scale.set(s, 1, s);
      this.selectionMarker.rotation.y += dt * 0.5;
    }

    if (!this.lowPower && this.perfFrames < 120) {
      this.perfFrames++;
      this.perfTime += dt;
      if (this.perfFrames === 120 && this.perfTime / 120 > 1 / 28) this.enterLowPower();
    }

    this.controls.update();
    if (this.lowPower) this.renderer.render(this.scene, this.camera);
    else this.composer.render();
    this.labels.render(this.scene, this.camera);
  };

  private enterLowPower() {
    this.lowPower = true;
    this.renderer.shadowMap.enabled = false;
    this.renderer.setPixelRatio(1);
    this.scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material;
      if (mat && !Array.isArray(mat)) mat.needsUpdate = true;
    });
    this.resize();
  }
}
