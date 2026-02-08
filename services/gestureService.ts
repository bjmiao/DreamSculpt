
import { HandStats } from "../types";

export class GestureTracker {
  private hands: any;
  private camera: any;
  private onStatsUpdate: (stats: { left?: HandStats; right?: HandStats }) => void;

  constructor(videoElement: HTMLVideoElement, onStatsUpdate: (stats: { left?: HandStats; right?: HandStats }) => void) {
    this.onStatsUpdate = onStatsUpdate;
    // @ts-ignore
    this.hands = new window.Hands({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    this.hands.onResults(this.processResults.bind(this));

    // @ts-ignore
    this.camera = new window.Camera(videoElement, {
      onFrame: async () => {
        await this.hands.send({ image: videoElement });
      },
      width: 640,
      height: 480,
    });
  }

  public start() {
    this.camera.start();
  }

  private processResults(results: any) {
    const stats: { left?: HandStats; right?: HandStats } = {};

    if (results.multiHandLandmarks && results.multiHandedness) {
      results.multiHandLandmarks.forEach((landmarks: any, index: number) => {
        const handedness = results.multiHandedness[index].label as 'Left' | 'Right';
        
        // Basic gesture logic
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const distance = Math.sqrt(
          Math.pow(thumbTip.x - indexTip.x, 2) + 
          Math.pow(thumbTip.y - indexTip.y, 2)
        );

        const isPinching = distance < 0.05;
        
        // Calculate palm center
        const wrist = landmarks[0];
        const center = { x: landmarks[9].x, y: landmarks[9].y };
        const palmSize = Math.sqrt(Math.pow(wrist.x - landmarks[9].x, 2) + Math.pow(wrist.y - landmarks[9].y, 2));

        const isFist = landmarks.slice(8, 21).every((lm: any) => {
             const d = Math.sqrt(Math.pow(lm.x - center.x, 2) + Math.pow(lm.y - center.y, 2));
             return d < palmSize * 1.5;
        });

        let gesture = "Open Palm";
        if (isPinching) gesture = "Pinch";
        else if (isFist) gesture = "Fist";

        const handStat: HandStats = {
          gesture,
          palmSize,
          center,
          landmarks,
          distance,
          handedness
        };

        if (handedness === 'Left') stats.left = handStat;
        else stats.right = handStat;
      });
    }

    this.onStatsUpdate(stats);
  }
}
