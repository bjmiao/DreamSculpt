
export interface DreamObject {
  id: string;
  type: 'sphere' | 'box' | 'cylinder' | 'torus' | 'tree' | 'cloud' | 'mushroom';
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
  rotation: [number, number, number];
  name: string;
  maxPoints: number;
}

export interface SceneGraph {
  terrainColor: string;
  skyColor: string;
  objects: DreamObject[];
  ambience: string;
}

export interface HandStats {
  gesture: string;
  palmSize: number;
  center: { x: number; y: number };
  landmarks: any;
  distance: number;
  handedness: 'Left' | 'Right';
}

export interface AppState {
  isGenerating: boolean;
  statusMessage: string;
  scene: SceneGraph | null;
  cameraSpeed: number;
  handStats: {
    left?: HandStats;
    right?: HandStats;
  };
}
