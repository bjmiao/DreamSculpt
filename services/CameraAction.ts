import type { DreamRenderer } from './sceneService';
import type { SceneGraph } from '../types';
import type { HandStats } from '../types';

/**
 * Context passed to each CameraAction when it is executed.
 * Provides everything an action needs to affect the scene or camera.
 */
export interface CameraActionContext {
  /** The 3D renderer (camera, scene, objects). */
  renderer: DreamRenderer;
  /** Current scene graph (objects, terrain, sky). Null if no scene loaded. */
  scene: SceneGraph | null;
  /** The hand that triggered this action (center, gesture, etc.). */
  hand: HandStats;
  /** Change in hand center from previous frame (normalized 0–1). Used for orbit/dolly. */
  delta: { x: number; y: number };
  /** Hand center in the previous frame (normalized). */
  lastCenter: { x: number; y: number };
  /** Left hand data when available (for two-hand actions). */
  leftHand?: HandStats;
  /** Right hand data when available (for two-hand actions). */
  rightHand?: HandStats;
  /** For two-hand pinch: previous frame distance between hand centers (0–1 scale). */
  lastTwoHandDistance?: number;
  /** For left-hand pinch rotate: previous frame angle of index-from-wrist (radians). */
  lastLeftAngle?: number;
}

/**
 * Abstract base for a single gesture-driven action (camera or scene).
 * Subclasses define which gesture and which hand they handle, and implement execute().
 */
export abstract class CameraAction {
  /** Gesture name that triggers this action (e.g. 'Open Palm', 'Fist', 'Pinch', 'Pinch+Pinch'). */
  abstract readonly gesture: string;
  /** Which hand(s) this action listens to. Use 'both' for two-hand gestures. */
  abstract readonly hand: 'left' | 'right' | 'both';

  /**
   * Called each frame when the registered hand(s) match the gesture.
   * Use ctx.renderer, ctx.scene, ctx.hand, and ctx.delta (and ctx.leftHand/rightHand for 'both').
   */
  abstract execute(ctx: CameraActionContext): void;
}
