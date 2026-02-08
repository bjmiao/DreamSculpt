import { useEffect, useState, useRef, type RefObject } from 'react';
import type { HandData } from '../components/HandStatistics';

/** MediaPipe Hands onResults callback payload. */
interface HandsResults {
  image: HTMLCanvasElement | HTMLVideoElement;
  multiHandLandmarks?: Array<Array<{ x: number; y: number; z: number }>>;
  multiHandedness?: Array<{ label: string }>;
}

/** MediaPipe hand landmark connections for drawing skeleton (same as @mediapipe/hands HAND_CONNECTIONS). */
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

const MEDIAPIPE_HANDS_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands';

export function useHandTracking(
  videoRef: RefObject<HTMLVideoElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>
) {
  const [handData, setHandData] = useState<HandData>({})
  const [isTracking, setIsTracking] = useState(false)
  const handsRef = useRef<{ setOptions: (o: object) => void; onResults: (cb: (r: unknown) => void) => void; send: (i: object) => Promise<unknown>; close: () => Promise<unknown> } | null>(null)
  const cameraRef = useRef<{ start: () => void; stop: () => void } | null>(null)

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return
    const Win = window as unknown as {
      Hands?: new (cfg?: { locateFile?: (f: string) => string }) => {
        setOptions: (o: object) => void;
        onResults: (cb: (r: unknown) => void) => void;
        send: (i: object) => Promise<unknown>;
        close: () => Promise<unknown>;
      };
      Camera?: new (v: HTMLVideoElement, c: { onFrame: () => Promise<unknown>; width: number; height: number }) => { start: () => void; stop: () => void };
    };
    if (!Win.Hands || !Win.Camera) return

    const hands = new Win.Hands({
      locateFile: (file) => `${MEDIAPIPE_HANDS_BASE}/${file}`,
    })

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    })

    hands.onResults((results: unknown) => {
      const res = results as HandsResults
      if (!canvasRef.current || !videoRef.current) return

      const canvasCtx = canvasRef.current.getContext('2d')
      if (!canvasCtx) return

      // Ensure canvas dimensions match video
      if (canvasRef.current.width !== videoRef.current.videoWidth ||
          canvasRef.current.height !== videoRef.current.videoHeight) {
        canvasRef.current.width = videoRef.current.videoWidth
        canvasRef.current.height = videoRef.current.videoHeight
      }

      // Clear canvas
      canvasCtx.save()
      canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
      canvasCtx.drawImage(res.image, 0, 0, canvasRef.current.width, canvasRef.current.height)

      // Draw hand landmarks
      if (res.multiHandLandmarks && res.multiHandedness) {
        res.multiHandLandmarks.forEach((landmarks, index) => {
          const handedness = res.multiHandedness![index]
          const isRight = handedness.label === 'Right'
          const handColor = isRight ? '#00FF00' : '#0088FF'
          
          drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: handColor, lineWidth: 2 })
          drawLandmarks(canvasCtx, landmarks, { color: handColor, lineWidth: 1, radius: 3 })
        })
      }

      // Update hand data
      const newHandData: HandData = {}
      
      if (res.multiHandLandmarks && res.multiHandedness) {
        res.multiHandLandmarks.forEach((landmarks, index) => {
          const handedness = res.multiHandedness![index]
          const handType = handedness.label.toLowerCase() as 'left' | 'right'
          
          // Detect gesture using MediaPipe-style recognition
          const gesture = detectGesture(landmarks)
          
          // Calculate palm center (average of palm landmarks)
          const palmCenter = calculatePalmCenter(landmarks)
          
          // Calculate palm size and relative distances
          const { palmSize, relativeDistances } = calculatePalmMetrics(landmarks)
          
          newHandData[handType] = {
            landmarks: landmarks.map(lm => ({
              x: lm.x,
              y: lm.y,
              z: lm.z
            })),
            handedness: handedness.label,
            gesture,
            palmCenter,
            palmSize,
            relativeDistances
          }
        })
      }

      setHandData(newHandData)
      setIsTracking(!!(res.multiHandLandmarks && res.multiHandLandmarks.length > 0))
      
      canvasCtx.restore()
    })

    handsRef.current = hands

    const camera = new Win.Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current) {
          await hands.send({ image: videoRef.current })
        }
      },
      width: 640,
      height: 480
    })

    camera.start()
    cameraRef.current = camera

    return () => {
      if (cameraRef.current) {
        cameraRef.current.stop()
      }
      if (handsRef.current) {
        handsRef.current.close()
      }
    }
  }, [videoRef, canvasRef])

  return { handData, isTracking }
}

// Helper functions to draw hand landmarks
function drawConnectors(
  ctx: CanvasRenderingContext2D,
  landmarks: any[],
  connections: number[][],
  style: { color: string; lineWidth: number }
) {
  ctx.strokeStyle = style.color
  ctx.lineWidth = style.lineWidth
  ctx.beginPath()

  for (const connection of connections) {
    const start = landmarks[connection[0]]
    const end = landmarks[connection[1]]
    if (start && end) {
      ctx.moveTo(start.x * ctx.canvas.width, start.y * ctx.canvas.height)
      ctx.lineTo(end.x * ctx.canvas.width, end.y * ctx.canvas.height)
    }
  }

  ctx.stroke()
}

function drawLandmarks(
  ctx: CanvasRenderingContext2D,
  landmarks: any[],
  style: { color: string; lineWidth: number; radius: number }
) {
  ctx.fillStyle = style.color
  ctx.strokeStyle = style.color
  ctx.lineWidth = style.lineWidth

  for (const landmark of landmarks) {
    ctx.beginPath()
    ctx.arc(
      landmark.x * ctx.canvas.width,
      landmark.y * ctx.canvas.height,
      style.radius,
      0,
      2 * Math.PI
    )
    ctx.fill()
  }
}

// MediaPipe-style gesture recognition using relative distances based on palm size
function detectGesture(landmarks: any[]): 'palm' | 'fist' | 'pinch' | 'unknown' {
  const wrist = landmarks[0]
  const thumbTip = landmarks[4]
  const indexTip = landmarks[8]
  const indexPIP = landmarks[6]
  const middleTip = landmarks[12]
  const middlePIP = landmarks[10]
  const middleMCP = landmarks[9]
  const ringTip = landmarks[16]
  const ringPIP = landmarks[14]
  const pinkyTip = landmarks[20]
  const pinkyPIP = landmarks[18]

  // Calculate palm size reference - distance from wrist to middle finger MCP
  // This represents the palm size and accounts for distance from camera
  const palmSize = Math.sqrt(
    Math.pow(middleMCP.x - wrist.x, 2) +
    Math.pow(middleMCP.y - wrist.y, 2) +
    Math.pow(middleMCP.z - wrist.z, 2)
  )

  // Avoid division by zero or very small palm size
  if (palmSize < 0.01) {
    return 'unknown'
  }

  // First check for pinch (thumb and index finger close together)
  // Use relative distance normalized by palm size
  const thumbIndexDistance = Math.sqrt(
    Math.pow(thumbTip.x - indexTip.x, 2) +
    Math.pow(thumbTip.y - indexTip.y, 2) +
    Math.pow(thumbTip.z - indexTip.z, 2)
  )

  // Calculate 3D distances from fingertips to wrist
  const indexDistance = Math.sqrt(
    Math.pow(indexTip.x - wrist.x, 2) +
    Math.pow(indexTip.y - wrist.y, 2) +
    Math.pow(indexTip.z - wrist.z, 2)
  )
  const middleDistance = Math.sqrt(
    Math.pow(middleTip.x - wrist.x, 2) +
    Math.pow(middleTip.y - wrist.y, 2) +
    Math.pow(middleTip.z - wrist.z, 2)
  )
  const ringDistance = Math.sqrt(
    Math.pow(ringTip.x - wrist.x, 2) +
    Math.pow(ringTip.y - wrist.y, 2) +
    Math.pow(ringTip.z - wrist.z, 2)
  )
  const pinkyDistance = Math.sqrt(
    Math.pow(pinkyTip.x - wrist.x, 2) +
    Math.pow(pinkyTip.y - wrist.y, 2) +
    Math.pow(pinkyTip.z - wrist.z, 2)
  )

  // Calculate distances from PIP joints to wrist (for comparison)
  const indexPIPDistance = Math.sqrt(
    Math.pow(indexPIP.x - wrist.x, 2) +
    Math.pow(indexPIP.y - wrist.y, 2) +
    Math.pow(indexPIP.z - wrist.z, 2)
  )
  const middlePIPDistance = Math.sqrt(
    Math.pow(middlePIP.x - wrist.x, 2) +
    Math.pow(middlePIP.y - wrist.y, 2) +
    Math.pow(middlePIP.z - wrist.z, 2)
  )
  const ringPIPDistance = Math.sqrt(
    Math.pow(ringPIP.x - wrist.x, 2) +
    Math.pow(ringPIP.y - wrist.y, 2) +
    Math.pow(ringPIP.z - wrist.z, 2)
  )
  const pinkyPIPDistance = Math.sqrt(
    Math.pow(pinkyPIP.x - wrist.x, 2) +
    Math.pow(pinkyPIP.y - wrist.y, 2) +
    Math.pow(pinkyPIP.z - wrist.z, 2)
  )

  // Normalize all distances relative to palm size
  const relativeIndexDistance = indexDistance / palmSize
  const relativeMiddleDistance = middleDistance / palmSize
  const relativeRingDistance = ringDistance / palmSize
  const relativePinkyDistance = pinkyDistance / palmSize

  const relativeIndexPIPDistance = indexPIPDistance / palmSize
  const relativeMiddlePIPDistance = middlePIPDistance / palmSize
  const relativeRingPIPDistance = ringPIPDistance / palmSize
  const relativePinkyPIPDistance = pinkyPIPDistance / palmSize

  // Check if fingers are extended
  // Extended: fingertip is significantly further from wrist than PIP joint
  const indexExtended = relativeIndexDistance > relativeIndexPIPDistance * 1.3
  const middleExtended = relativeMiddleDistance > relativeMiddlePIPDistance * 1.3
  const ringExtended = relativeRingDistance > relativeRingPIPDistance * 1.3
  const pinkyExtended = relativePinkyDistance > relativePinkyPIPDistance * 1.3

  // Count extended fingers
  const extendedFingers = [indexExtended, middleExtended, ringExtended, pinkyExtended]
  const extendedCount = extendedFingers.filter(Boolean).length

  // Calculate average relative distance of fingertips from wrist
  const avgRelativeDistance = (relativeIndexDistance + relativeMiddleDistance + relativeRingDistance + relativePinkyDistance) / 4

  // Calculate average relative distance of PIP joints from wrist (baseline for closed hand)
  const avgRelativePIPDistance = (relativeIndexPIPDistance + relativeMiddlePIPDistance + relativeRingPIPDistance + relativePinkyPIPDistance) / 4

  // FIST DETECTION (improved criteria):
  // A fist has fingers curled, so fingertips should be close to or closer than PIP joints
  // Multiple criteria to catch different fist variations:
  const fingersCurled = extendedCount <= 1 // Most fingers not extended
  const fingertipsClose = avgRelativeDistance < avgRelativePIPDistance * 1.1 // Fingertips close to PIP baseline
  const relativeThumbIndexDistance = thumbIndexDistance / palmSize
  
  // Pinch: thumb and index are very close relative to palm size, and also not a fist
  if (relativeThumbIndexDistance < 0.25 && extendedCount >= 2) {
    return 'pinch'
  }

  // Strong fist indicators:
  if (fingersCurled && fingertipsClose && avgRelativeDistance < 1.8) {
    return 'fist'
  }
  
  // Very tight fist: all fingertips very close to wrist
  if (extendedCount === 0 && avgRelativeDistance < 1.6) {
    return 'fist'
  }

  // Moderate fist: most fingers curled and fingertips not far from wrist
  if (extendedCount <= 1 && avgRelativeDistance < 2.0 && avgRelativeDistance < avgRelativePIPDistance * 1.2) {
    return 'fist'
  }

  // PALM DETECTION:
  // A palm has fingers extended, so fingertips should be far from wrist
//   const fingersExtended = extendedCount >= 3
//   const fingertipsFar = avgRelativeDistance > avgRelativePIPDistance * 1.4

//   if (fingersExtended && fingertipsFar && avgRelativeDistance > 2.0) {
//     return 'palm'
//   }
//   if (extendedCount >= 4 && avgRelativeDistance > 2.5) {
//     return 'palm'
//   }
//   if (extendedCount >= 3 && avgRelativeDistance > 1.8) {
//     return 'palm'
//   }

  return 'palm';
}

// Calculate palm center position
function calculatePalmCenter(landmarks: any[]): { x: number; y: number } {
  // Use palm landmarks (wrist, MCP joints)
  const palmLandmarks = [
    landmarks[0],  // Wrist
    landmarks[5],  // Index MCP
    landmarks[9],  // Middle MCP
    landmarks[13], // Ring MCP
    landmarks[17]  // Pinky MCP
  ]
  
  const sum = palmLandmarks.reduce(
    (acc, lm) => ({ x: acc.x + lm.x, y: acc.y + lm.y }),
    { x: 0, y: 0 }
  )
  
  return {
    x: sum.x / palmLandmarks.length,
    y: sum.y / palmLandmarks.length
  }
}

// Calculate palm size and relative distances
function calculatePalmMetrics(landmarks: any[]): {
  palmSize: number
  relativeDistances: {
    index: number
    middle: number
    ring: number
    pinky: number
    average: number
  }
} {
  const wrist = landmarks[0]
  const indexTip = landmarks[8]
  const middleTip = landmarks[12]
  const middleMCP = landmarks[9]
  const ringTip = landmarks[16]
  const pinkyTip = landmarks[20]

  // Calculate palm size reference - distance from wrist to middle finger MCP
  const palmSize = Math.sqrt(
    Math.pow(middleMCP.x - wrist.x, 2) +
    Math.pow(middleMCP.y - wrist.y, 2) +
    Math.pow(middleMCP.z - wrist.z, 2)
  )

  // Calculate 3D distances from fingertips to wrist
  const indexDistance = Math.sqrt(
    Math.pow(indexTip.x - wrist.x, 2) +
    Math.pow(indexTip.y - wrist.y, 2) +
    Math.pow(indexTip.z - wrist.z, 2)
  )
  const middleDistance = Math.sqrt(
    Math.pow(middleTip.x - wrist.x, 2) +
    Math.pow(middleTip.y - wrist.y, 2) +
    Math.pow(middleTip.z - wrist.z, 2)
  )
  const ringDistance = Math.sqrt(
    Math.pow(ringTip.x - wrist.x, 2) +
    Math.pow(ringTip.y - wrist.y, 2) +
    Math.pow(ringTip.z - wrist.z, 2)
  )
  const pinkyDistance = Math.sqrt(
    Math.pow(pinkyTip.x - wrist.x, 2) +
    Math.pow(pinkyTip.y - wrist.y, 2) +
    Math.pow(pinkyTip.z - wrist.z, 2)
  )

  // Normalize all distances relative to palm size
  const relativeIndexDistance = palmSize > 0.01 ? indexDistance / palmSize : 0
  const relativeMiddleDistance = palmSize > 0.01 ? middleDistance / palmSize : 0
  const relativeRingDistance = palmSize > 0.01 ? ringDistance / palmSize : 0
  const relativePinkyDistance = palmSize > 0.01 ? pinkyDistance / palmSize : 0

  const average = (relativeIndexDistance + relativeMiddleDistance + relativeRingDistance + relativePinkyDistance) / 4

  return {
    palmSize,
    relativeDistances: {
      index: relativeIndexDistance,
      middle: relativeMiddleDistance,
      ring: relativeRingDistance,
      pinky: relativePinkyDistance,
      average
    }
  }
}
