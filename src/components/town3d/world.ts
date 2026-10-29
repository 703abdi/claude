import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { buildCity, DEST_LABEL, findPath, N, roadNeighbors, ZONE_DOOR, type Dest, type Pt } from "@/lib/agents/city";
import { ZONE_LABEL, type Zone } from "@/lib/agents/town";
import type { AgentView } from "@/lib/agents/types";
import { KIND_COLOR } from "@/components/town3d/kinds";

export type Pick = { type: "agent"; id: string } | { type: "zone"; zone: Zone } | { type: "dest"; dest: Dest };
export type Signals = { overdue: number; queued: number; working: number };

const S = 2;
const FLOOR = 0.55;
const HALF = ((N - 1) / 2) * S;
const SPEED = 2.4;


const STATUS_RING: Record<AgentView["status"], string> = {
  WORKING: "#a78bfa",
  BLOCKED: "#ef4444",
  IDLE: "#2dd4bf",
  OFFLINE: "#6b7280",
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
  return h;
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
  const lit: boolean[] = Array.from({ length: cols * rows }, () => r() < litChance);
  const warm: boolean[] = lit.map(() => r() < 0.75);
  const map = canvasTexture(128, 256, (ctx) => {
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, 128, 256);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        ctx.fillStyle = "#1b2233";
        ctx.fillRect(10 + x * 29, 8 + y * 31, 20, 20);
      }
    }
  });
  const emissive = canvasTexture(128, 256, (ctx) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 128, 256);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (!lit[i]) continue;
        ctx.fillStyle = warm[i] ? "#ffcf86" : "#9fd8ff";
        ctx.fillRect(10 + x * 29, 8 + y * 31, 20, 20);
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

type AgentActor = {
  view: AgentView;
  group: THREE.Group;
  body: THREE.Mesh;
  visor: THREE.Mesh;
  ring: THREE.Mesh;
  label: CSS2DObject;
  labelEl: HTMLButtonElement;
  cell: Pt;
  path: Pt[];
  target: Zone;
  offset: THREE.Vector3;
  wanderAt: number;
  phase: number;
};

type Hoverable = { mesh: THREE.Mesh; base: THREE.Color };

export class TownWorld {
  private renderer: THREE.WebGLRenderer;
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
  private selectionMarker: THREE.Mesh;
  private beacon!: THREE.Mesh;
  private beaconGlow!: THREE.Sprite;
  private dish!: THREE.Object3D;
  private antennaLight!: THREE.Sprite;
  private hourHand!: THREE.Object3D[];
  private minuteHand!: THREE.Object3D[];
  private smoke: { mesh: THREE.Mesh; life: number }[] = [];
  private fountainWater!: THREE.Mesh;
  private crates: THREE.Mesh[] = [];
  private signals: Signals = { overdue: 0, queued: 0, working: 0 };
  private buildingAnchors = new Map<string, THREE.Vector3>();
  private downAt = { x: 0, y: 0 };

  constructor(
    private container: HTMLElement,
    private onPick: (pick: Pick | null) => void
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.style.position = "absolute";
    this.labels.domElement.style.inset = "0";
    this.labels.domElement.style.pointerEvents = "none";
    container.appendChild(this.labels.domElement);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 400);
    this.camera.position.set(28, 26, 28);
    this.camera.zoom = 1;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minPolarAngle = 0.55;
    this.controls.maxPolarAngle = 1.15;
    this.controls.minZoom = 0.4;
    this.controls.maxZoom = 3;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = false;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.addEventListener("start", () => {
      this.controls.autoRotate = false;
    });
    this.controls.addEventListener("change", () => {
      const t = this.controls.target;
      t.x = THREE.MathUtils.clamp(t.x, -HALF, HALF);
      t.z = THREE.MathUtils.clamp(t.z, -HALF, HALF);
      t.y = 0;
    });

    this.selectionMarker = new THREE.Mesh(
      new THREE.RingGeometry(1.25, 1.45, 48),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    this.selectionMarker.rotation.x = -Math.PI / 2;
    this.selectionMarker.visible = false;
    this.scene.add(this.selectionMarker);

    this.buildLights();
    this.buildGround();
    this.buildCityBlocks();
    this.buildStreetlights();

    const el = this.renderer.domElement;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", this.handleDown);
    el.addEventListener("pointerup", this.handleUp);
    el.addEventListener("pointermove", this.handleMove);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
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
      if (actor.target !== view.zone) {
        actor.target = view.zone;
        actor.path = findPath(actor.cell, ZONE_DOOR[view.zone]);
      }
      this.styleActor(actor);
    }
    for (const [id, actor] of this.actors) {
      if (seen.has(id)) continue;
      this.scene.remove(actor.group);
      actor.labelEl.remove();
      this.actors.delete(id);
    }
  }

  setSignals(signals: Signals) {
    this.signals = signals;
    const count = Math.min(6, signals.queued);
    this.crates.forEach((c, i) => (c.visible = i < count));
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
    this.glow.dispose();
    this.renderer.dispose();
    el.remove();
    this.labels.domElement.remove();
  }

  // ── scene construction ──────────────────────────────────────────

  private buildLights() {
    const hour = new Date().getHours();
    const night = hour < 6 || hour >= 19;
    const dusk = !night && (hour >= 17 || hour < 8);
    this.scene.fog = new THREE.Fog(night ? "#0a0d18" : "#141a2c", 60, 120);

    const hemi = new THREE.HemisphereLight(night ? "#5b6aa8" : "#a9c1ff", night ? "#0b0e16" : "#2a2438", night ? 0.55 : 0.9);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(night ? "#8fa2ff" : dusk ? "#ffb27a" : "#fff1dc", night ? 0.55 : 1.6);
    sun.position.set(-18, 30, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -18;
    sc.right = 18;
    sc.top = 18;
    sc.bottom = -18;
    sc.near = 1;
    sc.far = 80;
    sun.shadow.bias = -0.0008;
    this.scene.add(sun);

    const rim = new THREE.DirectionalLight("#7c6df2", night ? 0.7 : 0.35);
    rim.position.set(20, 10, -20);
    this.scene.add(rim);
  }

  private buildGround() {
    const size = N * S + 1.2;
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(size, 1.6, size),
      [
        new THREE.MeshStandardMaterial({ color: "#151a28" }),
        new THREE.MeshStandardMaterial({ color: "#151a28" }),
        new THREE.MeshStandardMaterial({ color: "#252b3b", roughness: 0.95 }),
        new THREE.MeshStandardMaterial({ color: "#0c0f17" }),
        new THREE.MeshStandardMaterial({ color: "#1b2131" }),
        new THREE.MeshStandardMaterial({ color: "#1b2131" }),
      ]
    );
    slab.position.y = -0.8;
    slab.receiveShadow = true;
    this.scene.add(slab);

    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(size + 0.06, 0.06, size + 0.06),
      new THREE.MeshBasicMaterial({ color: "#7c6df2", transparent: true, opacity: 0.55 })
    );
    edge.position.y = 0.0;
    this.scene.add(edge);

    const under = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: "#7c6df2", transparent: true, opacity: 0.25, depthWrite: false }));
    under.scale.set(size * 2.2, size * 1.2, 1);
    under.position.set(0, -3, 0);
    this.scene.add(under);

    const dashGeo = new THREE.PlaneGeometry(0.55, 0.08);
    const dashMat = new THREE.MeshBasicMaterial({ color: "#c8cbd6", transparent: true, opacity: 0.55 });
    const dashes: THREE.Matrix4[] = [];
    const zebraGeo = new THREE.PlaneGeometry(0.12, 0.7);
    const zebras: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
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
              const x = p.x + dx + (rot ? 0 : off);
              const z = p.z + dz + (rot ? off : 0);
              q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, rot));
              zebras.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.012, z), q, new THREE.Vector3(1, 0.42, 1)));
            }
          }
          continue;
        }
        q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, vRoad ? Math.PI / 2 : 0));
        m.compose(new THREE.Vector3(p.x, 0.012, p.z), q, new THREE.Vector3(1, 1, 1));
        dashes.push(m.clone());
      }
    }
    const dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length);
    dashes.forEach((mm, i) => dashMesh.setMatrixAt(i, mm));
    this.scene.add(dashMesh);
    const zebraMesh = new THREE.InstancedMesh(zebraGeo, new THREE.MeshBasicMaterial({ color: "#d8dbe4", transparent: true, opacity: 0.5 }), zebras.length);
    zebras.forEach((mm, i) => zebraMesh.setMatrixAt(i, mm));
    this.scene.add(zebraMesh);
  }

  private buildCityBlocks() {
    const city = buildCity();
    const r = rand(7);
    const hour = new Date().getHours();
    const litChance = hour < 6 || hour >= 18 ? 0.55 : 0.25;
    const walls = ["#d8d2c4", "#c9b597", "#9fb0c6", "#c98e74", "#b8bfcc", "#8e9bb3"];
    const variants = walls.map((w, i) => windowTextures(100 + i, w, litChance));
    variants.forEach((v) => this.disposables.push(v.map, v.emissive));
    const roofMats = ["#3a3f4d", "#4a4f5c", "#33384a"].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));

    const sidewalk = new THREE.MeshStandardMaterial({ color: "#3b4152", roughness: 0.9 });
    const grass = new THREE.MeshStandardMaterial({ color: "#2f6b45", roughness: 1 });

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
        const floors = cell.floors + 1 + Math.floor(r() * 3);
        const w = 1.3 + r() * 0.35;
        const d = 1.3 + r() * 0.35;
        const h = floors * FLOOR;
        const map = v.map.clone();
        const em = v.emissive.clone();
        map.repeat.set(1, floors / 8);
        em.repeat.set(1, floors / 8);
        map.needsUpdate = true;
        em.needsUpdate = true;
        this.disposables.push(map, em);
        const side = new THREE.MeshStandardMaterial({
          map,
          emissiveMap: em,
          emissive: "#ffffff",
          emissiveIntensity: 0.9,
          roughness: 0.75,
        });
        const roof = roofMats[Math.floor(r() * roofMats.length)];
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, side, side]);
        b.position.set(p.x, 0.14 + h / 2, p.z);
        b.castShadow = true;
        b.receiveShadow = true;
        this.scene.add(b);
        this.addRooftop(p, 0.14 + h, w, d, r);
      }
    }
  }

  private addRooftop(p: THREE.Vector3, top: number, w: number, d: number, r: () => number) {
    const roll = r();
    if (roll < 0.35) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.35, 12), new THREE.MeshStandardMaterial({ color: "#8a6f55" }));
      tank.position.set(p.x + (r() - 0.5) * w * 0.5, top + 0.3, p.z + (r() - 0.5) * d * 0.5);
      tank.castShadow = true;
      this.scene.add(tank);
    } else if (roll < 0.75) {
      for (let i = 0; i < 2; i++) {
        const ac = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.24), new THREE.MeshStandardMaterial({ color: "#aab0bd" }));
        ac.position.set(p.x + (r() - 0.5) * w * 0.6, top + 0.08, p.z + (r() - 0.5) * d * 0.6);
        ac.castShadow = true;
        this.scene.add(ac);
      }
    } else {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.04, d * 0.5), new THREE.MeshStandardMaterial({ color: "#2a3a66", metalness: 0.6, roughness: 0.3 }));
      panel.position.set(p.x, top + 0.06, p.z);
      panel.rotation.x = -0.15;
      this.scene.add(panel);
    }
  }

  private buildTrees(p: THREE.Vector3, r: () => number) {
    const trunkMat = new THREE.MeshStandardMaterial({ color: "#5a3f2a" });
    const leafMats = ["#2f8a4a", "#3aa35a", "#267a40"].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
    const count = 2 + Math.floor(r() * 2);
    for (let i = 0; i < count; i++) {
      const x = p.x + (r() - 0.5) * 1.3;
      const z = p.z + (r() - 0.5) * 1.3;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.4, 6), trunkMat);
      trunk.position.set(x, 0.34, z);
      trunk.castShadow = true;
      this.scene.add(trunk);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 + r() * 0.12, 0), leafMats[i % leafMats.length]);
      crown.position.set(x, 0.72, z);
      crown.castShadow = true;
      this.scene.add(crown);
    }
  }

  private buildFountain(p: THREE.Vector3) {
    const stone = new THREE.MeshStandardMaterial({ color: "#c9c4b6" });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.22, 24), stone);
    basin.position.set(p.x, 0.25, p.z);
    basin.castShadow = true;
    this.scene.add(basin);
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 0.05, 24),
      new THREE.MeshStandardMaterial({ color: "#3fc6e0", emissive: "#2dd4bf", emissiveIntensity: 0.5, transparent: true, opacity: 0.85 })
    );
    water.position.set(p.x, 0.36, p.z);
    this.scene.add(water);
    const jet = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.7, 12),
      new THREE.MeshStandardMaterial({ color: "#bff3ff", emissive: "#7fe3f5", emissiveIntensity: 0.6, transparent: true, opacity: 0.7 })
    );
    jet.position.set(p.x, 0.72, p.z);
    this.scene.add(jet);
    this.fountainWater = jet;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: "#2dd4bf", transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(3, 3, 1);
    glow.position.set(p.x, 0.6, p.z);
    this.scene.add(glow);
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
    return new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
  }

  private add(mesh: THREE.Mesh, group: THREE.Group, x: number, y: number, z: number) {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  private sprite(color: string, scale: number, opacity = 0.8) {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    s.scale.set(scale, scale, 1);
    return s;
  }

  private buildZoneLandmark(zone: Zone, p: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(p);
    this.scene.add(g);
    let top = 2;
    let accent = "#f5a623";

    if (zone === "INBOX") {
      accent = "#f5a623";
      this.add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 1.5), this.stdMat("#9a5a43")), g, 0, 0.59, 0);
      const roofShape = new THREE.Shape();
      roofShape.moveTo(-0.95, 0);
      roofShape.lineTo(0, 0.45);
      roofShape.lineTo(0.95, 0);
      roofShape.lineTo(-0.95, 0);
      const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 1.6, bevelEnabled: false }), this.stdMat("#4b5263"));
      roof.position.set(0, 1.04, -0.8);
      roof.castShadow = true;
      g.add(roof);
      for (const x of [-0.5, 0, 0.5]) {
        this.add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.04), this.stdMat("#c9ced8", { metalness: 0.4 })), g, x, 0.4, 0.76);
      }
      const lamp = this.sprite("#ffb347", 1.4, 0.9);
      lamp.position.set(0, 1.0, 0.85);
      g.add(lamp);
      const crateMat = this.stdMat("#b98a4e");
      for (let i = 0; i < 6; i++) {
        const crate = this.add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), crateMat), g, -0.75 + (i % 3) * 0.3, 0.27 + Math.floor(i / 3) * 0.27, 0.95);
        crate.position.z = 0.9 + 0.05;
        crate.visible = false;
        this.crates.push(crate);
      }
      top = 1.9;
    } else if (zone === "WORKSHOP") {
      accent = "#a78bfa";
      this.add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 1.6), this.stdMat("#58647d")), g, 0, 0.69, 0);
      for (let i = 0; i < 3; i++) {
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 1.5), this.stdMat("#7c6df2", { emissive: "#7c6df2", emissiveIntensity: 0.25 }));
        tooth.rotation.z = 0.35;
        this.add(tooth, g, -0.6 + i * 0.6, 1.36, 0);
      }
      this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.6, 12), this.stdMat("#8e5b4a")), g, 0.6, 2.0, -0.45);
      for (let i = 0; i < 10; i++) {
        const puff = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 8, 8),
          new THREE.MeshStandardMaterial({ color: "#c7cad3", transparent: true, opacity: 0.0, depthWrite: false })
        );
        puff.position.set(p.x + 0.6, 2.8, p.z - 0.45);
        this.scene.add(puff);
        this.smoke.push({ mesh: puff, life: i / 10 });
      }
      const glow = this.sprite("#a78bfa", 2.2, 0.5);
      glow.position.set(0, 0.8, 0.9);
      g.add(glow);
      top = 3.1;
    } else if (zone === "DESK") {
      accent = "#ef4444";
      this.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.4, 1.4), this.stdMat("#e4ddd0")), g, 0, 0.84, 0);
      const awning = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.45), this.stdMat("#e2504a", { emissive: "#e2504a", emissiveIntensity: 0.2 }));
      awning.rotation.x = 0.35;
      this.add(awning, g, 0, 0.95, 0.85);
      const sign = this.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.04), this.stdMat("#111", { emissive: "#ff6b6b", emissiveIntensity: 1.4 })), g, 0, 1.3, 0.72);
      sign.castShadow = false;
      top = 2.3;
    }

    this.registerPick(g, { type: "zone", zone }, new THREE.Vector3(p.x, top + 0.4, p.z), ZONE_LABEL[zone], accent);
  }

  private buildDestLandmark(dest: Dest, p: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(p);
    this.scene.add(g);
    let top = 3;
    let accent = "#2dd4bf";

    if (dest === "tasks") {
      accent = "#f5a623";
      const glass = this.stdMat("#3f6f8f", { metalness: 0.5, roughness: 0.2, emissive: "#16324a", emissiveIntensity: 0.6 });
      this.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 5.2, 1.4), glass), g, 0, 2.74, 0);
      this.add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, 1.0), glass), g, 0, 6.04, 0);
      this.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), glass), g, 0, 7.04, 0);
      for (let y = 0.6; y < 5.2; y += 0.55) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.03, 1.42), new THREE.MeshBasicMaterial({ color: "#7fd4ff", transparent: true, opacity: 0.35 }));
        stripe.position.set(0, 0.14 + y, 0);
        g.add(stripe);
      }
      this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.2, 8), this.stdMat("#c9ced8", { metalness: 0.8 })), g, 0, 7.94, 0);
      this.beacon = this.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), new THREE.MeshBasicMaterial({ color: "#2dd4bf" })), g, 0, 8.6, 0);
      this.beaconGlow = this.sprite("#2dd4bf", 2.2, 0.9);
      this.beaconGlow.position.set(0, 8.6, 0);
      g.add(this.beaconGlow);
      top = 9.1;
    } else if (dest === "calendar") {
      accent = "#2dd4bf";
      const marble = this.stdMat("#ece6d8");
      this.add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.2, 1.6), marble), g, 0, 0.24, 0);
      this.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.2), marble), g, 0, 0.89, -0.1);
      for (const x of [-0.6, -0.2, 0.2, 0.6]) {
        this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 10), marble), g, x, 0.89, 0.62);
      }
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.7, 3), this.stdMat("#d8cfbd"));
      ped.rotation.z = Math.PI / 2;
      ped.rotation.y = Math.PI / 2;
      ped.scale.set(1, 1, 0.5);
      this.add(ped, g, 0, 1.66, 0.1);
      this.add(new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.3, 0.75), marble), g, 0, 2.6, -0.2);
      this.add(new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.6, 4), this.stdMat("#2f8f86")), g, 0, 3.55, -0.2).rotation.y = Math.PI / 4;
      this.hourHand = [];
      this.minuteHand = [];
      for (const face of [
        { pos: new THREE.Vector3(0, 2.75, 0.18), rotY: 0 },
        { pos: new THREE.Vector3(0.38, 2.75, -0.2), rotY: Math.PI / 2 },
      ]) {
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.28, 32), new THREE.MeshStandardMaterial({ color: "#fffaf0", emissive: "#ffe8b0", emissiveIntensity: 0.7 }));
        disc.position.copy(face.pos);
        disc.rotation.y = face.rotY;
        g.add(disc);
        const handMat = new THREE.MeshBasicMaterial({ color: "#1c2030" });
        const pivotH = new THREE.Object3D();
        pivotH.position.copy(face.pos);
        pivotH.rotation.y = face.rotY;
        const hh = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.15), handMat);
        hh.position.set(0, 0.075, 0.01);
        const handH = new THREE.Object3D();
        handH.add(hh);
        pivotH.add(handH);
        const mh = new THREE.Mesh(new THREE.PlaneGeometry(0.025, 0.22), handMat);
        mh.position.set(0, 0.11, 0.012);
        const handM = new THREE.Object3D();
        handM.add(mh);
        pivotH.add(handM);
        g.add(pivotH);
        this.hourHand.push(handH);
        this.minuteHand.push(handM);
      }
      top = 4.1;
    } else if (dest === "people") {
      accent = "#60a5fa";
      const glass = this.stdMat("#7fb6e8", { metalness: 0.6, roughness: 0.12, transparent: true, opacity: 0.82, emissive: "#1d4f87", emissiveIntensity: 0.5 });
      this.add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.5), this.stdMat("#2f3646")), g, 0, 0.39, 0);
      this.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 1.3), glass), g, 0, 1.94, 0);
      for (let y = 0.9; y < 3.2; y += 0.45) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.05, 1.32), new THREE.MeshBasicMaterial({ color: "#e8f3ff", transparent: true, opacity: 0.4 }));
        band.position.set(0, y, 0);
        g.add(band);
      }
      this.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 1.4), this.stdMat("#20283a")), g, 0, 3.3, 0);
      const glow = this.sprite("#60a5fa", 2.4, 0.45);
      glow.position.set(0, 1.8, 0.8);
      g.add(glow);
      top = 3.8;
    } else {
      accent = "#a78bfa";
      const white = this.stdMat("#e9edf3");
      this.add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.5), white), g, 0, 0.74, 0);
      this.add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.stdMat("#cfd6e3", { metalness: 0.3 })), g, -0.3, 1.34, 0.1);
      const dishPivot = new THREE.Object3D();
      dishPivot.position.set(0.45, 1.5, -0.3);
      const dish = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 24, 12, 0, Math.PI * 2, 0, Math.PI / 3),
        this.stdMat("#8b7cf6", { side: THREE.DoubleSide, emissive: "#5b4ad6", emissiveIntensity: 0.35, metalness: 0.4 })
      );
      dish.rotation.x = -Math.PI / 2 + 0.5;
      dish.castShadow = true;
      dishPivot.add(dish);
      g.add(dishPivot);
      this.dish = dishPivot;
      this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.4, 6), this.stdMat("#c9ced8")), g, 0.6, 2.0, 0.5);
      this.antennaLight = this.sprite("#ff4d4d", 0.8, 0.9);
      this.antennaLight.position.set(0.6, 2.75, 0.5);
      g.add(this.antennaLight);
      top = 3.1;
    }

    this.registerPick(g, { type: "dest", dest }, new THREE.Vector3(p.x, top + 0.3, p.z), DEST_LABEL[dest], accent);
  }

  private buildStreetlights() {
    const poleMat = this.stdMat("#3b4152", { metalness: 0.6 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: "#ffe2a8" });
    const hour = new Date().getHours();
    const strength = hour < 6 || hour >= 18 ? 0.95 : 0.45;
    for (let c = 0; c <= 12; c += 4) {
      for (let r = 0; r <= 12; r += 4) {
        const p = cellToWorld({ c, r });
        const x = p.x + 0.85;
        const z = p.z + 0.85;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.2, 6), poleMat);
        pole.position.set(x, 0.6, z);
        pole.castShadow = true;
        this.scene.add(pole);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), bulbMat);
        bulb.position.set(x, 1.22, z);
        this.scene.add(bulb);
        const glow = this.sprite("#ffcf86", 1.6, strength);
        glow.position.set(x, 1.22, z);
        this.scene.add(glow);
        const pool = new THREE.Mesh(
          new THREE.CircleGeometry(0.9, 24),
          new THREE.MeshBasicMaterial({ map: this.glow, color: "#ffcf86", transparent: true, opacity: strength * 0.35, depthWrite: false, blending: THREE.AdditiveBlending })
        );
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(x, 0.02, z);
        this.scene.add(pool);
      }
    }
  }

  // ── agents ──────────────────────────────────────────────────────

  private createActor(view: AgentView): AgentActor {
    const color = KIND_COLOR[view.kind];
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.2, emissive: color, emissiveIntensity: 0.15, transparent: true });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.32, 6, 12), bodyMat);
    body.position.y = 0.42;
    body.castShadow = true;
    group.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.3), new THREE.MeshStandardMaterial({ color: "#e9ecf3", roughness: 0.35, transparent: true }));
    head.position.y = 0.84;
    head.castShadow = true;
    group.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.02), new THREE.MeshBasicMaterial({ color: "#7fe3f5" }));
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
    const halo = this.sprite(color, 1.2, 0.35);
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
    label.position.set(0, 1.45, 0);
    group.add(label);

    const h = Math.abs(hashString(view.id));
    const offset = new THREE.Vector3(((h % 7) - 3) * 0.22, 0, (((h >> 3) % 7) - 3) * 0.22);
    label.position.y = 1.45 + (h % 3) * 0.32;
    const start = { ...ZONE_DOOR[view.zone] };
    group.position.copy(cellToWorld(start)).add(offset);
    this.scene.add(group);

    return {
      view,
      group,
      body,
      visor,
      ring,
      label,
      labelEl,
      cell: start,
      path: [],
      target: view.zone,
      offset,
      wanderAt: 0,
      phase: (h % 100) / 16,
    };
  }

  private styleActor(actor: AgentActor) {
    const v = actor.view;
    const selected = this.selection?.type === "agent" && this.selection.id === v.id;
    const ringMat = actor.ring.material as THREE.MeshBasicMaterial;
    ringMat.color.set(selected ? "#ffffff" : STATUS_RING[v.status]);
    ringMat.opacity = selected ? 1 : v.status === "IDLE" ? 0.35 : 0.85;
    const offline = v.status === "OFFLINE";
    actor.group.traverse((c) => {
      const mat = (c as THREE.Mesh).material as THREE.Material | undefined;
      if (mat && "opacity" in mat && c !== actor.ring) {
        mat.opacity = offline ? 0.35 : 1;
      }
    });
    (actor.visor.material as THREE.MeshBasicMaterial).color.set(
      v.status === "BLOCKED" ? "#ff5a5a" : v.status === "WORKING" ? "#c4b5fd" : "#7fe3f5"
    );
    const zoneName = ZONE_LABEL[v.zone];
    actor.labelEl.innerHTML = "";
    actor.labelEl.dataset.status = v.status.toLowerCase();
    actor.labelEl.dataset.selected = selected ? "true" : "false";
    const dot = document.createElement("span");
    dot.className = "agent-label-dot";
    dot.style.background = KIND_COLOR[v.kind];
    const name = document.createElement("span");
    name.textContent = v.name;
    const state = document.createElement("span");
    state.className = "agent-label-state";
    state.textContent = v.status === "WORKING" ? "working" : v.status === "BLOCKED" ? "stuck" : v.status === "OFFLINE" ? "offline" : zoneName.toLowerCase();
    actor.labelEl.append(dot, name, state);
  }

  private stepActor(actor: AgentActor, dt: number, t: number) {
    const g = actor.group;
    if (!actor.path.length && actor.target === "PARK" && t > actor.wanderAt) {
      const door = ZONE_DOOR.PARK;
      const options = roadNeighbors(actor.cell).filter((q) => Math.abs(q.c - door.c) + Math.abs(q.r - door.r) <= 4);
      if (options.length) actor.path.push(options[Math.floor(Math.random() * options.length)]);
      actor.wanderAt = t + 1.5 + Math.random() * 3;
    }

    let moving = false;
    if (actor.path.length) {
      const next = actor.path[0];
      const goal = cellToWorld(next).add(actor.offset);
      const delta = goal.clone().sub(g.position);
      delta.y = 0;
      const dist = delta.length();
      const stepLen = SPEED * dt;
      if (dist <= stepLen) {
        g.position.x = goal.x;
        g.position.z = goal.z;
        actor.cell = next;
        actor.path.shift();
      } else {
        delta.normalize();
        g.position.x += delta.x * stepLen;
        g.position.z += delta.z * stepLen;
        const yaw = Math.atan2(delta.x, delta.z);
        const diff = Math.atan2(Math.sin(yaw - g.rotation.y), Math.cos(yaw - g.rotation.y));
        g.rotation.y += diff * 0.25;
      }
      moving = true;
    }

    const working = actor.view.status === "WORKING";
    const bob = moving ? Math.abs(Math.sin(t * 10 + actor.phase)) * 0.08 : working ? Math.abs(Math.sin(t * 6 + actor.phase)) * 0.12 : Math.sin(t * 2 + actor.phase) * 0.02;
    g.position.y = bob;
    actor.body.rotation.z = moving ? Math.sin(t * 10 + actor.phase) * 0.08 : 0;
    const pulse = 1 + (working ? Math.sin(t * 5 + actor.phase) * 0.18 : 0);
    actor.ring.scale.set(pulse, pulse, pulse);
    if (working) actor.ring.rotation.z += dt * 2;
  }

  // ── interaction ─────────────────────────────────────────────────

  private pickAt(clientX: number, clientY: number): Pick | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, true);
    for (const hit of hits) {
      const pick = hit.object.userData.pick as Pick | undefined;
      if (pick) return pick;
    }
    return null;
  }

  private handleDown = (e: PointerEvent) => {
    this.downAt = { x: e.clientX, y: e.clientY };
  };

  private handleUp = (e: PointerEvent) => {
    const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
    if (moved > 6) return;
    this.onPick(this.pickAt(e.clientX, e.clientY));
  };

  private handleMove = (e: PointerEvent) => {
    if (e.buttons) return;
    const pick = this.pickAt(e.clientX, e.clientY);
    this.renderer.domElement.style.cursor = pick ? "pointer" : "grab";
    for (const h of this.hovered) (h.mesh.material as THREE.MeshStandardMaterial).emissive?.copy(h.base);
    this.hovered = [];
    if (!pick || pick.type === "agent") return;
    const target = this.pickables.find((o) => o.userData.pick === pick || (o.userData.pick && JSON.stringify(o.userData.pick) === JSON.stringify(pick)));
    target?.traverse((c) => {
      const mesh = c as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
      if (!mat || !("emissive" in mat) || Array.isArray(mat)) return;
      this.hovered.push({ mesh, base: mat.emissive.clone() });
      mat.emissive.offsetHSL(0, 0, 0.12);
    });
  };

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    const view = 17;
    const aspect = w / h;
    this.camera.left = -view * aspect;
    this.camera.right = view * aspect;
    this.camera.top = view;
    this.camera.bottom = -view;
    this.camera.zoom = Math.min(0.82 * aspect, 1.26);
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    for (const actor of this.actors.values()) this.stepActor(actor, dt, t);

    if (this.beacon) {
      const alert = this.signals.overdue > 0;
      const color = alert ? "#f5a623" : "#2dd4bf";
      (this.beacon.material as THREE.MeshBasicMaterial).color.set(color);
      (this.beaconGlow.material as THREE.SpriteMaterial).color.set(color);
      const s = 1.8 + Math.sin(t * (alert ? 6 : 2.5)) * 0.6;
      this.beaconGlow.scale.set(s, s, 1);
    }
    if (this.dish) this.dish.rotation.y = t * 0.6;
    if (this.antennaLight) (this.antennaLight.material as THREE.SpriteMaterial).opacity = Math.sin(t * 3) > 0.2 ? 0.95 : 0.15;
    if (this.fountainWater) this.fountainWater.scale.y = 1 + Math.sin(t * 8) * 0.12;
    if (this.hourHand) {
      const now = new Date();
      const minutes = now.getMinutes() + now.getSeconds() / 60;
      const hours = (now.getHours() % 12) + minutes / 60;
      for (const h of this.hourHand) h.rotation.z = -(hours / 12) * Math.PI * 2;
      for (const m of this.minuteHand) m.rotation.z = -(minutes / 60) * Math.PI * 2;
    }
    const smokeRate = this.signals.working > 0 ? 0.55 : 0.18;
    for (const puff of this.smoke) {
      puff.life += dt * smokeRate;
      if (puff.life > 1) puff.life -= 1;
      const l = puff.life;
      puff.mesh.position.y = 2.85 + l * 2.2;
      puff.mesh.position.x = puff.mesh.position.x + Math.sin(t + l * 6) * 0.002;
      const s = 0.6 + l * 1.6;
      puff.mesh.scale.set(s, s, s);
      (puff.mesh.material as THREE.MeshStandardMaterial).opacity = (this.signals.working > 0 ? 0.55 : 0.3) * Math.sin(l * Math.PI);
    }
    if (this.selectionMarker.visible) {
      const s = 1 + Math.sin(t * 4) * 0.05;
      this.selectionMarker.scale.set(s, s, s);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  };
}

