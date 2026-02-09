import { CameraAction } from './CameraAction';
import type { CameraActionContext } from './CameraAction';

// ---- Right hand: navigation ----

/** Right Open Palm + move: orbit camera (yaw/pitch) with larger rotation range. */
export class OrbitCameraAction extends CameraAction {
  readonly gesture = 'Open Palm';
  readonly hand = 'right' as const;

  execute(ctx: CameraActionContext): void {
    const { delta, renderer } = ctx;
    renderer.orbitCamera(-delta.x * 4, -delta.y * 4);
  }
}

/** Right Fist + move up/down: dolly in/out (speed limited in renderer). */
export class DollyCameraAction extends CameraAction {
  readonly gesture = 'Fist';
  readonly hand = 'right' as const;

  execute(ctx: CameraActionContext): void {
    const { delta, renderer } = ctx;
    renderer.dollyCamera(delta.y * 30);
  }
}

// ---- Left hand: object transformation ----
// Highlight is updated by manager from left-hand projection. Selected object is that closest to left hand.
const TRANSLATION_SPEED = 100;
/** Left Pinch + move: grab/translate selected object. */
export class PinchTranslateAction extends CameraAction {
  readonly gesture = 'Pinch';
  readonly hand = 'left' as const;

  execute(ctx: CameraActionContext): void {
    console.log('PinchTranslateAction');
    const { delta, renderer } = ctx;
    const id = renderer.getSelectedObjectId();
    if (!id) return;
    renderer.manipulateObject(id, 'translate', {
      x: delta.x * TRANSLATION_SPEED,
      y: -delta.y * TRANSLATION_SPEED,
    });
  }
}

/** Left Fist + rotate (hand angle): rotate selected object around Y. */
export class FistRotateAction extends CameraAction {
  readonly gesture = 'Fist';
  readonly hand = 'left' as const;

  execute(ctx: CameraActionContext): void {
    const { hand, renderer, lastLeftAngle } = ctx;
    const id = renderer.getSelectedObjectId();
    if (!id || lastLeftAngle == null) return;
    const lm = hand.landmarks;
    if (!lm?.[8] || !lm?.[0]) return;
    const currentAngle = Math.atan2(lm[8].y - lm[0].y, lm[8].x - lm[0].x);
    let deltaAngle = currentAngle - lastLeftAngle;
    if (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
    if (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;
    renderer.manipulateObject(id, 'rotate', deltaAngle * 2);
  }
}

/** Left Open Palm: free the particle and start diffuse on the touched (selected) object. */
export class PalmReleaseAction extends CameraAction {
  readonly gesture = 'Open Palm';
  readonly hand = 'left' as const;

  execute(ctx: CameraActionContext): void {
    const { renderer } = ctx;
    console.log("PalmReleaseAction");
    // const id = renderer.getSelectedObjectId();
    // if (id) renderer.triggerDiffuse(id);
    // renderer.setSelectedObjectId(null);
  }
}

// ---- Both hands ----

/** Two-hand Pinch: scale selected object by change in distance between hands. */
export class TwoHandPinchScaleAction extends CameraAction {
  readonly gesture = 'Pinch+Pinch';
  readonly hand = 'both' as const;

  execute(ctx: CameraActionContext): void {
    console.log('TwoHandPinchScaleAction');
    const { renderer, leftHand, rightHand, lastTwoHandDistance } = ctx;
    const id = renderer.getSelectedObjectId();
    if (!id || !leftHand || !rightHand || lastTwoHandDistance == null || lastTwoHandDistance <= 0) return;
    const dist = Math.hypot(
      rightHand.center.x - leftHand.center.x,
      rightHand.center.y - leftHand.center.y
    );
    const scaleFactor = dist / lastTwoHandDistance;
    const clamped = Math.max(0.7, Math.min(1.4, scaleFactor));
    renderer.manipulateObject(id, 'scale', clamped);
  }
}
