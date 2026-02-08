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
const TYPE_TO_PLY: Record<string, string> = {
  tree: sakuraTreePly,
  'sakura-tree': sakuraTreePly,
  cloud: rainbowPly,
  rainbow: rainbowPly,
  mushroom: grassPly,
  grass: grassPly,
  'bell-tower': bellTowerPly,
  church: churchPly,
  'school-bus': schoolBusPly,
};

const FORWARD_SPEED = 0.05;
const WORLD_Z_RESPAWN = 20;
const OBJECT_Z_WRAP = 150;
/** Materialize effect: fraction of total points revealed per second (e.g. 0.1 = 10% per second) */
const MATERIALIZE_RATE_PER_SEC = 0.1;

export class DreamRenderer {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  private clock: THREE.Clock;
  private cameraRig: THREE.Group;
  private worldGroup: THREE.Group;
  private objects: Map<string, { mesh: THREE.Points, targetPoints: number, currentPoints: number }> = new Map();
  private terrain: THREE.Mesh | null = null;
  private sky: THREE.Mesh | null = null;
  private skyMat: THREE.MeshBasicMaterial | null = null;
  private terrainMat: THREE.MeshStandardMaterial | null = null;
  private textureFadeProgress = 0; // 0..1, animated in animate()
  private readonly TEXTURE_FADE_DURATION = 2.5; // seconds
  private movingWorld: THREE.Group;
  private _forward = new THREE.Vector3();

  constructor(container: HTMLElement) {
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

  public async updateScene(graph: SceneGraph, skyUrl?: string, terrainUrl?: string) {
    // Clear old objects
    this.movingWorld.clear();
    this.objects.clear();

    this.textureFadeProgress = 0;

    // Create Sky — start transparent, fade in in animate()
    const skyGeo = new THREE.SphereGeometry(500, 32, 32);
    this.skyMat = new THREE.MeshBasicMaterial({
      color: graph.skyColor,
      side: THREE.BackSide,
      map: skyUrl ? new THREE.TextureLoader().load(skyUrl) : null,
      transparent: true,
      opacity: 0
    });
    this.sky = new THREE.Mesh(skyGeo, this.skyMat);
    this.worldGroup.add(this.sky);

    // Create Terrain — start transparent, fade in in animate()
    const terrainGeo = new THREE.PlaneGeometry(2050, 2050, 10, 10);
    const terrainTex = terrainUrl ? new THREE.TextureLoader().load(terrainUrl) : null;
    if (terrainTex) {
      terrainTex.wrapS = THREE.RepeatWrapping;
      terrainTex.wrapT = THREE.RepeatWrapping;
      terrainTex.repeat.set(105, 105);
    }
    this.terrainMat = new THREE.MeshStandardMaterial({
      color: graph.terrainColor,
      map: terrainTex,
      roughness: 0.8,
      metalness: 0.2,
      transparent: true,
      opacity: 0
    });
    this.terrain = new THREE.Mesh(terrainGeo, this.terrainMat);
    this.terrain.rotation.x = -Math.PI / 2;
    this.worldGroup.add(this.terrain);

    // Create Objects (async: PLY models load and then materialize gradually)
    const plyLoader = new PLYLoader();
    await Promise.all(
      graph.objects.map((obj) => this.createPointCloudObject(obj, plyLoader))
    );
  }

  private async createPointCloudObject(data: DreamObject, plyLoader: PLYLoader): Promise<void> {
    const plyUrl = TYPE_TO_PLY[data.type];
    let geometry: THREE.BufferGeometry;
    let pointCount: number;

    if (plyUrl) {
      geometry = await new Promise<THREE.BufferGeometry>((resolve, reject) => {
        plyLoader.load(plyUrl, resolve, undefined, reject);
      });
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
    const material = new THREE.PointsMaterial({
      color: data.color,
      size: 0.08,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      vertexColors: hasVertexColors,
    });

    const cloud = new THREE.Points(geometry, material);
    cloud.position.set(...data.position);
    cloud.scale.set(...data.scale);
    cloud.rotation.set(...data.rotation);
    cloud.userData = { id: data.id };

    this.movingWorld.add(cloud);
    this.objects.set(data.id, {
      mesh: cloud,
      targetPoints: pointCount,
      currentPoints: 0,
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
    this.cameraRig.rotation.y += yaw;
    this.cameraRig.rotation.x += pitch;
  }

  public dollyCamera(delta: number) {
    this.camera.getWorldDirection(this._forward).negate();
    this.cameraRig.position.addScaledVector(this._forward, delta);
  }

  private animate() {
    requestAnimationFrame(this.animate.bind(this));
    const delta = this.clock.getDelta();

    // Gradual fade-in of sky and terrain textures (gradient opacity)
    if (this.textureFadeProgress < 1 && (this.skyMat || this.terrainMat)) {
      this.textureFadeProgress = Math.min(1, this.textureFadeProgress + delta / this.TEXTURE_FADE_DURATION);
      const t = this.textureFadeProgress;
      const ease = t * t * (3 - 2 * t); // smoothstep
      const opacity = ease;
      if (this.skyMat) this.skyMat.opacity = opacity;
      if (this.terrainMat) this.terrainMat.opacity = opacity;
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

    // Materializing effect: reveal points at MATERIALIZE_RATE_PER_SEC (e.g. 10%) per second
    this.objects.forEach((obj) => {
      if (obj.currentPoints < obj.targetPoints) {
        obj.currentPoints = Math.min(
          obj.targetPoints,
          obj.currentPoints + obj.targetPoints * MATERIALIZE_RATE_PER_SEC * delta
        );
        obj.mesh.geometry.setDrawRange(0, Math.floor(obj.currentPoints));
      }
    });

    this.renderer.render(this.scene, this.camera);
  }
}
