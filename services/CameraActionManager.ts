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
   * Run all actions that match the current hand gestures.
   * Updates highlight from left-hand projection when left hand is present.
   */
  process(
    handStats: HandStatsInput,
    scene: SceneGraph | null,
    renderer: DreamRenderer
  ): void {
    const left = handStats.left;
    const right = handStats.right;

    // Left hand: update closest-object highlight from projection
    if (left) {
      const closestId = renderer.findClosestObjectAtScreenPoint(left.center.x, left.center.y);
      renderer.setSelectedObjectId(closestId);
    } else {
      renderer.setSelectedObjectId(null);
    }

    // Two-hand actions (both hands present)
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
        const leftGesture = left.gesture;
        const rightGesture = right.gesture;
        if (action.gesture === 'Pinch+Pinch' && leftGesture === 'Pinch' && rightGesture === 'Pinch') {
          action.execute(ctx);
        }
      }
    } else {
      this.lastTwoHandDistance = 0;
    }

    // Single-hand: right
    if (right) {
      const delta = {
        x: right.center.x - this.lastRight.x,
        y: right.center.y - this.lastRight.y,
      };
      this.runMatching('right', right, delta, this.lastRight, scene, renderer, left, right);
      this.lastRight = { x: right.center.x, y: right.center.y };
    }

    // Single-hand: left
    if (left) {
      const delta = {
        x: left.center.x - this.lastLeft.x,
        y: left.center.y - this.lastLeft.y,
      };
      const ctxWithAngle = { lastLeftAngle: this.lastLeftAngle };
      this.runMatching('left', left, delta, this.lastLeft, scene, renderer, left, right, ctxWithAngle);
      this.lastLeft = { x: left.center.x, y: left.center.y };
      // Update angle for next frame (index tip 8, wrist 0)
      const lm = left.landmarks;
      if (lm && lm[8] != null && lm[0] != null) {
        this.lastLeftAngle = Math.atan2(lm[8].y - lm[0].y, lm[8].x - lm[0].x);
      }
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
      action.execute(ctx);
    }
  }
}
