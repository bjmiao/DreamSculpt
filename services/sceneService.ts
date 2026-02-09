import * as THREE from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { DreamObject, SceneGraph } from '../types';

// Point cloud PLY files (Vite ?url so they are served)
import bellTowerPly from '../res/point-cloud-files/bell-tower.ply?url';
import churchPly from '../res/point-cloud-files/church.ply?url';
import grassPly from '../res/point-cloud-files/grass.ply?url';
import rainbowPly from '../res/point-cloud-files/rainbow.ply?url';
import sakuraTreePly from '../res/point-cloud-files/sakura-tree.ply?url';
import schoolBusPly from '../res/point-cloud-files/school-bus.ply?url';

/** Map object type to PLY file URL. Types matching filenames (e.g. 'sakura-tree') or aliases (e.g. 'tree') use local point clouds. */
export const TYPE_TO_PLY: Record<string, string> = {
  'tree': sakuraTreePly,
  'sakura-tree': sakuraTreePly,
  'rainbow': rainbowPly,
  'grass': grassPly,
  'bell-tower': bellTowerPly,
  'church': churchPly,
  'school-bus': schoolBusPly,
  'bus': schoolBusPly,
};

const FORWARD_SPEED = 0.025;
const WORLD_Z_RESPAWN = 20;
const OBJECT_Z_WRAP = 150;
/** Per-frame random displacement scale for diffusion. */
const DIFFUSE_STRENGTH = 0.1;
/** Pull back toward original position per frame (0–1) so the cloud doesn’t drift away. */
const DIFFUSE_DAMP = 0.008;
/** Materialize: reveal all particles over this many seconds. */
const MATERIALIZE_DURATION = 10;
/** Fraction of particles (0–1) that enter the diffusion phase. */
const DIFFUSE_FRACTION = 0.1;
/** Duration (seconds) of the diffusion phase; then those particles disappear. */
const DIFFUSE_PHASE_DURATION = 3;
/** Object lifetime: min and max seconds before removal starts (random per object). */
const OBJECT_LIFETIME_MIN = 45;
const OBJECT_LIFETIME_MAX = 75;
/** During removal: fraction of total particles to hide per frame. */
const REMOVAL_PERCENT_PER_FRAME = 0.003;
/** Orbit: yaw limit ±85°, pitch limit ±45° (radians). */
const YAW_MIN = -(85 * Math.PI) / 180;
const YAW_MAX = (85 * Math.PI) / 180;
const PITCH_MIN = -(45 * Math.PI) / 180;
const PITCH_MAX = (45 * Math.PI) / 180;
/** Orbit: max rotation per frame (radians) to limit rotation speed. */
const ORBIT_MAX_YAW_PER_FRAME = 0.04;
const ORBIT_MAX_PITCH_PER_FRAME = 0.04;
/** Dolly: max movement per frame to limit zoom speed. */
const DOLLY_MAX_PER_FRAME = 0.15;
/** Default point size; highlighted object uses this multiplier. */
const HIGHLIGHT_SIZE_MULT = 1.5;
/** Particle size in world units (spherical/circular points to avoid square overlap). */
const POINT_SIZE = 0.04;

/** Create a texture: solid circle (pure color, no gradient outline). */
function createCirclePointTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(r, r, r - 1, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export class DreamRenderer {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  private clock: THREE.Clock;
  private cameraRig: THREE.Group;
  private worldGroup: THREE.Group;
  private objects: Map<string, {
    mesh: THREE.Points;
    targetPoints: number;
    currentPoints: number;
    loadedAt: number;
    /** Random lifetime in seconds (20–30) before removal starts. */
    lifetime: number;
    /** When gradual removal started; set when loadedAt + lifetime is reached. */
    removalStartedAt?: number;
    /** During removal: number of points still visible (decreased 10% per frame). */
    visiblePoints?: number;
    /** When the "10% diffuse" phase started (after materialize settled). */
    diffusionPhaseStartedAt?: number;
    /** First vertex index of the diffusing 10% (last 10% of points). */
    diffusingStartIndex?: number;
    /** Snapshot of positions for the diffusing segment only (for damp). */
    originalPositionsDiffuse?: Float32Array;
  }> = new Map();
  private terrain: THREE.Mesh | null = null;
  private sky: THREE.Mesh | null = null;
  private skyMat: THREE.MeshBasicMaterial | null = null;
  private terrainMat: THREE.MeshStandardMaterial | null = null;
  /** Previous sky/terrain meshes and materials for crossfade (fade out old, fade in new). */
  private lastSky: THREE.Mesh | null = null;
  private lastTerrain: THREE.Mesh | null = null;
  private lastSkyMat: THREE.MeshBasicMaterial | null = null;
  private lastTerrainMat: THREE.MeshStandardMaterial | null = null;
  private textureFadeProgress = 0; // 0..1, animated in animate()
  private readonly TEXTURE_FADE_DURATION = 2.5; // seconds
  private movingWorld: THREE.Group;
  private _forward = new THREE.Vector3();
  private _projVec = new THREE.Vector3();
  private _ndcVec = new THREE.Vector3();
  private selectedObjectId: string | null = null;
  private readonly defaultPointSize = POINT_SIZE;
  private static circlePointTexture: THREE.CanvasTexture | null = null;
  private onFpsUpdate?: (fps: number) => void;
  private smoothedFps = 0;

  constructor(container: HTMLElement, options?: { onFpsUpdate?: (fps: number) => void }) {
    this.onFpsUpdate = options?.onFpsUpdate;
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    // Camera rig: camera position is fixed relative to the rig; orbit/dolly move the rig.
    this.cameraRig = new THREE.Group();
    this.scene.add(this.cameraRig);
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 5, 10);
    this.cameraRig.add(this.camera);

    // World group: moves backward each frame to simulate infinite forward motion (camera stays static).
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);
    this.movingWorld = new THREE.Group();
    this.worldGroup.add(this.movingWorld);

    this.clock = new THREE.Clock();
    this.initLights();
    this.animate();

    window.addEventListener('resize', this.onResize.bind(this));
  }

  private initLights() {
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    this.scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(10, 10, 10);
    this.scene.add(pointLight);
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * Update sky and terrain images/colors only. Does not remove or replace meshes; only updates materials.
   * If sky/terrain do not exist yet, creates them. Fade-in is animated in the render loop.
   */
  public setSkyAndTerrain(
    skyColor: string,
    terrainColor: string,
    skyUrl?: string,
    terrainUrl?: string
  ): void {
    this.textureFadeProgress = 0;

    if (this.sky && this.skyMat) {
      this.lastSky = this.sky;
      this.lastSkyMat = this.skyMat;
      this.lastSkyMat.opacity = 1;
    }
    const skyGeo = new THREE.SphereGeometry(500, 32, 32);
    this.skyMat = new THREE.MeshBasicMaterial({
      color: skyColor,
      side: THREE.BackSide,
      map: skyUrl ? new THREE.TextureLoader().load(skyUrl) : null,
      transparent: true,
      opacity: 0,
    });
    this.sky = new THREE.Mesh(skyGeo, this.skyMat);
    this.worldGroup.add(this.sky);

    const terrainTex = terrainUrl ? new THREE.TextureLoader().load(terrainUrl) : null;
    if (terrainTex) {
      terrainTex.wrapS = THREE.RepeatWrapping;
      terrainTex.wrapT = THREE.RepeatWrapping;
      terrainTex.repeat.set(15, 15);
    }
    if (this.terrain && this.terrainMat) {
      this.lastTerrain = this.terrain;
      this.lastTerrainMat = this.terrainMat;
      this.lastTerrainMat.opacity = 1;
    }
    const terrainGeo = new THREE.PlaneGeometry(2050, 2050, 10, 10);
    this.terrainMat = new THREE.MeshStandardMaterial({
      color: terrainColor,
      map: terrainTex,
      roughness: 0.8,
      metalness: 0.2,
      transparent: true,
      opacity: 0,
    });
    this.terrain = new THREE.Mesh(terrainGeo, this.terrainMat);
    this.terrain.rotation.x = -Math.PI / 2;
    this.worldGroup.add(this.terrain);
  }

  /**
   * Add (or replace) scene objects only. Clears existing objects, then loads and adds the given list.
   */
  public async addObjects(objects: DreamObject[]): Promise<void> {
    // this.movingWorld.clear();
    // this.objects.clear();
    this.selectedObjectId = null;

    if (objects.length === 0) return;

    const plyLoader = new PLYLoader();
    await Promise.all(objects.map((obj) => this.createPointCloudObject(obj, plyLoader)));
  }

  /** Convenience: set sky/terrain and add objects in one call (same as before). */
  public async updateScene(graph: SceneGraph, skyUrl?: string, terrainUrl?: string): Promise<void> {
    this.setSkyAndTerrain(graph.skyColor, graph.terrainColor, skyUrl, terrainUrl);
    await this.addObjects(graph.objects);
  }

  private async createPointCloudObject(data: DreamObject, plyLoader: PLYLoader): Promise<void> {
    const plyUrl = TYPE_TO_PLY[data.type];
    let geometry: THREE.BufferGeometry;

    let pointCount: number;

    if (plyUrl) {
      geometry = await new Promise<THREE.BufferGeometry>((resolve, reject) => {
        plyLoader.load(plyUrl, resolve, undefined, reject);
      });

      // Get size
      const boundingBox = new THREE.Box3().setFromObject(new THREE.Object3D().add(new THREE.Mesh(geometry)));
      const size = boundingBox.getSize(new THREE.Vector3());
      const maxSize = Math.max(size.x, size.y, size.z);
      data.scale = [data.scale[0] / maxSize * 100, data.scale[1] / maxSize * 100, data.scale[2] / maxSize * 100] as [number, number, number];
      console.log(plyUrl, data.scale);

      const posAttr = geometry.getAttribute('position');
      pointCount = posAttr ? posAttr.count : 0;
      if (pointCount === 0) return;
      geometry.setDrawRange(0, 0);
    } else {
      let prim: THREE.BufferGeometry;
      switch (data.type) {
        case 'sphere': prim = new THREE.SphereGeometry(2, 32, 32); break;
        case 'box': prim = new THREE.BoxGeometry(3, 3, 3); break;
        case 'cylinder': prim = new THREE.CylinderGeometry(1, 1, 4, 32); break;
        case 'torus': prim = new THREE.TorusGeometry(2, 0.5, 16, 100); break;
        default: prim = new THREE.IcosahedronGeometry(2, 1);
      }
      geometry = this.generatePointsFromGeometry(prim, data.maxPoints);
      pointCount = data.maxPoints;
      geometry.setDrawRange(0, 0);
    }

    const hasVertexColors = geometry.getAttribute('color') != null;
    if (!DreamRenderer.circlePointTexture) {
      DreamRenderer.circlePointTexture = createCirclePointTexture();
    }
    const material = new THREE.PointsMaterial({
      color: data.color,
      size: POINT_SIZE,
      map: DreamRenderer.circlePointTexture,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      vertexColors: hasVertexColors,
      alphaTest: 0.01,
    });

    const cloud = new THREE.Points(geometry, material);
    cloud.position.set(...data.position);
    cloud.scale.set(...data.scale);
    cloud.rotation.set(...data.rotation);
    cloud.userData = { id: data.id };

    this.movingWorld.add(cloud);
    const loadedAt = this.clock.getElapsedTime();
    const lifetime = OBJECT_LIFETIME_MIN + Math.random() * (OBJECT_LIFETIME_MAX - OBJECT_LIFETIME_MIN);
    this.objects.set(data.id, {
      mesh: cloud,
      targetPoints: pointCount,
      currentPoints: 0,
      loadedAt,
      lifetime,
    });
  }

  private generatePointsFromGeometry(geo: THREE.BufferGeometry, count: number): THREE.BufferGeometry {
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    const tempPoints: number[] = [];
    const n = posAttr.count;

    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * n);
      tempPoints.push(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
    }

    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(tempPoints, 3));
    return result;
  }

  public manipulateObject(id: string, action: 'translate' | 'rotate' | 'scale', value: any) {
    const obj = this.objects.get(id);
    if (!obj) return;
    
    if (action === 'translate') {
        obj.mesh.position.x += value.x;
        obj.mesh.position.y += value.y;
    } else if (action === 'rotate') {
        obj.mesh.rotation.y += value;
    } else if (action === 'scale') {
        obj.mesh.scale.multiplyScalar(value);
    }
  }

  public orbitCamera(yaw: number, pitch: number) {
    const clampedYaw = Math.max(-ORBIT_MAX_YAW_PER_FRAME, Math.min(ORBIT_MAX_YAW_PER_FRAME, yaw));
    const clampedPitch = Math.max(-ORBIT_MAX_PITCH_PER_FRAME, Math.min(ORBIT_MAX_PITCH_PER_FRAME, pitch));
    this.cameraRig.rotation.y = Math.max(YAW_MIN, Math.min(YAW_MAX, this.cameraRig.rotation.y + clampedYaw));
    this.cameraRig.rotation.x = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.cameraRig.rotation.x + clampedPitch));
  }

  public dollyCamera(delta: number) {
    const clamped = Math.max(-DOLLY_MAX_PER_FRAME, Math.min(DOLLY_MAX_PER_FRAME, delta));
    this.camera.getWorldDirection(this._forward).negate();
    this.cameraRig.position.addScaledVector(this._forward, clamped);
  }

  /** Set which object is selected; updates highlight (point size). Pass null to clear. */
  public setSelectedObjectId(id: string | null): void {
    if (this.selectedObjectId === id) return;
    if (this.selectedObjectId) {
      const prev = this.objects.get(this.selectedObjectId);
      if (prev?.mesh.material instanceof THREE.PointsMaterial) {
        prev.mesh.material.size = this.defaultPointSize;
      }
    }
    this.selectedObjectId = id;
    if (id) {
      const obj = this.objects.get(id);
      if (obj?.mesh.material instanceof THREE.PointsMaterial) {
        obj.mesh.material.size = this.defaultPointSize * HIGHLIGHT_SIZE_MULT;
      }
    }
  }
      
  public getSelectedObjectId(): string | null {
    return this.selectedObjectId;
  }

  /**
   * Find the object whose screen projection is closest to normalized (0–1) screen point.
   * Uses camera and movingWorld children; returns object id or null.
   */
  public findClosestObjectAtScreenPoint(normalizedX: number, normalizedY: number): string | null {
    const children = this.movingWorld.children;
    if (children.length === 0) return null;
    const camera = this.camera;
    let bestId: string | null = null;
    let bestDistSq = Infinity;
    // NDC: x,y in [-1,1], y up in NDC
    const targetX = normalizedX * 2 - 1;
    const targetY = 1 - normalizedY * 2;
    for (const child of children) {
      const id = (child.userData as { id?: string }).id;
      if (!id) continue;
      child.getWorldPosition(this._projVec);
      this._projVec.project(camera);
      const dx = this._projVec.x - targetX;
      const dy = this._projVec.y - targetY;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestId = id;
      }
    }
    return bestId;
  }

  /**
   * Restart the materialize effect for an object (reset visible points so they re-reveal over MATERIALIZE_DURATION).
   */
  public triggerDiffuse(objectId: string): void {
    const obj = this.objects.get(objectId);
    if (!obj) return;
    obj.currentPoints = 0;
    obj.diffusionPhaseStartedAt = undefined;
    obj.diffusingStartIndex = undefined;
    obj.originalPositionsDiffuse = undefined;
    obj.mesh.geometry.setDrawRange(0, 0);
  }

  private animate() {
    requestAnimationFrame(this.animate.bind(this));
    const delta = this.clock.getDelta();
    if (this.onFpsUpdate && delta > 0) {
      const instantFps = 1 / delta;
      this.smoothedFps = this.smoothedFps ? this.smoothedFps * 0.85 + instantFps * 0.15 : instantFps;
      this.onFpsUpdate(Math.round(this.smoothedFps));
    }
    // Crossfade: fade out old sky/terrain, fade in new
    const hasTransition = this.textureFadeProgress < 1 && (this.skyMat || this.terrainMat || this.lastSkyMat || this.lastTerrainMat);
    if (hasTransition) {
      this.textureFadeProgress = Math.min(1, this.textureFadeProgress + delta / this.TEXTURE_FADE_DURATION);
      const t = this.textureFadeProgress;
      const ease = t * t * (3 - 2 * t); // smoothstep
      if (this.skyMat) this.skyMat.opacity = ease;
      if (this.terrainMat) this.terrainMat.opacity = ease;
      if (this.lastSkyMat) this.lastSkyMat.opacity = 1 - ease;
      if (this.lastTerrainMat) this.lastTerrainMat.opacity = 1 - ease;
      if (this.textureFadeProgress >= 1) {
        if (this.lastSky) {
          this.worldGroup.remove(this.lastSky);
          this.lastSky.geometry?.dispose();
          this.lastSkyMat?.dispose();
          this.lastSky = null;
          this.lastSkyMat = null;
        }
        if (this.lastTerrain) {
          this.worldGroup.remove(this.lastTerrain);
          this.lastTerrain.geometry?.dispose();
          this.lastTerrainMat?.dispose();
          this.lastTerrain = null;
          this.lastTerrainMat = null;
        }
      }
    }

    // Simulated forward motion: camera is static; the world moves backward.
    if (this.worldGroup) {
      this.worldGroup.position.z += FORWARD_SPEED;
      this.movingWorld.children.forEach((child) => {
        const worldZ = this.worldGroup.position.z + child.position.z;
        if (worldZ > WORLD_Z_RESPAWN) {
          child.position.z -= OBJECT_Z_WRAP;
        }
      });
    }

    const now = this.clock.getElapsedTime();

    // Phase 1: Materialize — gradually show all particles over MATERIALIZE_DURATION (10 seconds)
    this.objects.forEach((obj) => {
      if (obj.currentPoints < obj.targetPoints) {
        const rate = obj.targetPoints / MATERIALIZE_DURATION;
        obj.currentPoints = Math.min(obj.targetPoints, obj.currentPoints + rate * delta);
        obj.mesh.geometry.setDrawRange(0, Math.floor(obj.currentPoints));
      }
    });

    // Phase 2 & 3: After settled, 10% of particles diffuse for DIFFUSE_PHASE_DURATION (3s), then disappear
    for (const [, obj] of this.objects.entries()) {
      const geo = obj.mesh.geometry;
      const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
      if (!posAttr || posAttr.count === 0) continue;

      const count = obj.targetPoints;
      const settled = obj.currentPoints >= count;

      // Start diffusion phase when materialize has just settled (10% = last 10% of vertex indices)
      if (settled && obj.diffusionPhaseStartedAt == null) {
        obj.diffusionPhaseStartedAt = now;
        obj.diffusingStartIndex = Math.floor((1 - DIFFUSE_FRACTION) * count);
        const start = obj.diffusingStartIndex * 3;
        const len = (count - obj.diffusingStartIndex) * 3;
        const arr0 = posAttr.array as Float32Array;
        obj.originalPositionsDiffuse = arr0.slice(start, start + len);
      }

      if (obj.diffusionPhaseStartedAt == null || obj.diffusingStartIndex == null) continue;

      const elapsed = now - obj.diffusionPhaseStartedAt;

      // After 3 seconds: hide the diffusing 10% (they disappear)
      if (elapsed >= DIFFUSE_PHASE_DURATION) {
        obj.mesh.geometry.setDrawRange(0, obj.diffusingStartIndex);
        obj.diffusionPhaseStartedAt = undefined;
        obj.diffusingStartIndex = undefined;
        obj.originalPositionsDiffuse = undefined;
        continue;
      }

      // Apply diffusion only to the last 10% of vertices (random + damp)
      const arr = posAttr.array as Float32Array;
      const startIdx = obj.diffusingStartIndex * 3;
      const orig = obj.originalPositionsDiffuse!;
      const segLen = (count - obj.diffusingStartIndex) * 3;
      for (let i = 0; i < segLen; i += 9) {
        const j = startIdx + i;
        arr[j] += (Math.random() - 0.5) * 2 * DIFFUSE_STRENGTH;
        arr[j + 1] += (Math.random() ) * 2 * DIFFUSE_STRENGTH;
        arr[j + 2] += (Math.random() - 0.5) * 2 * DIFFUSE_STRENGTH;
        arr[j] = orig[i] + (arr[j] - orig[i]) * (1 - DIFFUSE_DAMP);
        arr[j + 1] = orig[i + 1] + (arr[j + 1] - orig[i + 1]) * (1 - DIFFUSE_DAMP);
        arr[j + 2] = orig[i + 2] + (arr[j + 2] - orig[i + 2]) * (1 - DIFFUSE_DAMP);
      }
      posAttr.needsUpdate = true;
    }

    // Object lifetime: after lifetime (20–30s), gradually hide 10% of particles per frame, then remove and dispose
    const idsToDelete: string[] = [];
    for (const [id, obj] of this.objects.entries()) {
      const age = now - obj.loadedAt;

      if (obj.removalStartedAt == null) {
        if (age < obj.lifetime) continue;
        obj.removalStartedAt = now;
        const dr = obj.mesh.geometry.drawRange;
        obj.visiblePoints = dr.count;
      }

      const removePerFrame = Math.max(1, Math.ceil(obj.targetPoints * REMOVAL_PERCENT_PER_FRAME));
      obj.visiblePoints = Math.max(0, (obj.visiblePoints ?? obj.targetPoints) - removePerFrame);
      obj.mesh.geometry.setDrawRange(0, obj.visiblePoints);

      if (obj.visiblePoints <= 0) {
        idsToDelete.push(id);
      }
    }
    for (const id of idsToDelete) {
      const obj = this.objects.get(id);
      if (obj) {
        this.movingWorld.remove(obj.mesh);
        obj.mesh.geometry.dispose();
        if (Array.isArray(obj.mesh.material)) obj.mesh.material.forEach((m) => m.dispose());
        else obj.mesh.material.dispose();
        this.objects.delete(id);
        if (this.selectedObjectId === id) this.selectedObjectId = null;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}
