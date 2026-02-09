import type { DreamRenderer } from './sceneService';
import type { SceneGraph } from '../types';
import type { HandStats } from '../types';
import { CameraAction } from './CameraAction';
import type { CameraActionContext } from './CameraAction';

type HandStatsInput = { left?: HandStats; right?: HandStats };

/**
 * Manages gesture-to-scene bindings. Register CameraAction instances;
 * each frame, pass hand stats and the manager runs matching actions.
 */
export class CameraActionManager {
  private actions: CameraAction[] = [];
  private lastLeft: { x: number; y: number } = { x: 0, y: 0 };
  private lastRight: { x: number; y: number } = { x: 0, y: 0 };
  private lastTwoHandDistance: number = 0;
  private lastLeftAngle: number = 0;

  /**
   * Register an action. It will be run when the matching hand has the matching gesture.
   */
  register(action: CameraAction): void {
    if (!this.actions.includes(action)) {
      this.actions.push(action);
    }
  }

  /**
   * Unregister an action so it is no longer run.
   */
  unregister(action: CameraAction): void {
    this.actions = this.actions.filter((a) => a !== action);
  }

  /**
   * Clear all registered actions.
   */
  clear(): void {
    this.actions = [];
  }

  /**
   * Priority (high to low):
   * (1) Left hand available → manipulation only: left-hand actions + two-hand pinch scale. Right-hand navigation disabled.
   * (2) Left hand not available → right hand does navigation (orbit by palm, dolly by fist).
   */
  process(
    handStats: HandStatsInput,
    scene: SceneGraph | null,
    renderer: DreamRenderer
  ): void {
    const left = handStats.left;
    const right = handStats.right;
    const manipulationMode = !!left;

    // --- Highlight: from left hand when present ---
    if (left) {
      const closestId = renderer.findClosestObjectAtScreenPoint(left.center.x, left.center.y);
      renderer.setSelectedObjectId(closestId);
    } else {
      renderer.setSelectedObjectId(null);
    }

    // --- Priority 1: Two-hand manipulation (both hands) — pinch to scale ---
    if (left && right) {
      const dist = Math.hypot(right.center.x - left.center.x, right.center.y - left.center.y);
      const ctx: CameraActionContext = {
        renderer,
        scene,
        hand: left,
        delta: { x: 0, y: 0 },
        lastCenter: this.lastLeft,
        leftHand: left,
        rightHand: right,
        lastTwoHandDistance: this.lastTwoHandDistance,
      };
      this.lastTwoHandDistance = dist;
      for (const action of this.actions) {
        if (action.hand !== 'both') continue;
        if (left.gesture === 'Pinch' && right.gesture === 'Pinch' && action.gesture === 'Pinch+Pinch') {
          action.execute(ctx);
        }
      }
    } else {
      this.lastTwoHandDistance = 0;
    }

    // --- Priority 1: Left-hand manipulation (when left is available) ---
    if (left) {
      const delta = {
        x: left.center.x - this.lastLeft.x,
        y: left.center.y - this.lastLeft.y,
      };
      const ctxWithAngle = { lastLeftAngle: this.lastLeftAngle };
      this.runMatching('left', left, delta, this.lastLeft, scene, renderer, left, right, ctxWithAngle);
      this.lastLeft = { x: left.center.x, y: left.center.y };
      const lm = left.landmarks;
      if (lm?.[8] != null && lm?.[0] != null) {
        this.lastLeftAngle = Math.atan2(lm[8].y - lm[0].y, lm[8].x - lm[0].x);
      }
    }

    // --- Priority 2: Right-hand navigation only when left hand is NOT available ---
    if (right && !manipulationMode) {
      const delta = {
        x: right.center.x - this.lastRight.x,
        y: right.center.y - this.lastRight.y,
      };
      this.runMatching('right', right, delta, this.lastRight, scene, renderer, left, right);
    }
    if (right) {
      this.lastRight = { x: right.center.x, y: right.center.y };
    }
  }

  private runMatching(
    hand: 'left' | 'right',
    handData: HandStats,
    delta: { x: number; y: number },
    lastCenter: { x: number; y: number },
    scene: SceneGraph | null,
    renderer: DreamRenderer,
    leftHand?: HandStats,
    rightHand?: HandStats,
    extraCtx?: Partial<CameraActionContext>
  ): void {
    const ctx: CameraActionContext = {
      renderer,
      scene,
      hand: handData,
      delta,
      lastCenter,
      leftHand,
      rightHand,
      lastTwoHandDistance: this.lastTwoHandDistance,
      ...extraCtx,
    };

    for (const action of this.actions) {
      if (action.hand !== hand || action.gesture !== handData.gesture) continue;
      console.log('Executing action:', action.hand, action.gesture);
      action.execute(ctx);
    }
  }
}
