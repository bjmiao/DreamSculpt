import './HandStatistics.css'

export interface HandLandmark {
  x: number
  y: number
  z: number
}

export type HandGesture = 'palm' | 'fist' | 'pinch' | 'unknown'

export interface HandData {
  left?: {
    landmarks: HandLandmark[]
    handedness: string
    gesture: HandGesture
    palmCenter: { x: number; y: number }
    palmSize: number
    relativeDistances: {
      index: number
      middle: number
      ring: number
      pinky: number
      average: number
    }
  }
  right?: {
    landmarks: HandLandmark[]
    handedness: string
    gesture: HandGesture
    palmCenter: { x: number; y: number }
    palmSize: number
    relativeDistances: {
      index: number
      middle: number
      ring: number
      pinky: number
      average: number
    }
  }
}

interface HandStatisticsProps {
  handData: HandData
}

export default function HandStatistics({ handData }: HandStatisticsProps) {
  const formatNumber = (num: number) => num.toFixed(3)

  const renderHandStats = (hand: HandData['left'] | HandData['right'] | undefined, label: string) => {
    if (!hand) {
      return (
        <div className="hand-section">
          <h3>{label} Hand</h3>
          <p className="no-hand">No {label.toLowerCase()} hand detected</p>
        </div>
      )
    }

    const thumb = hand.landmarks[4]
    const index = hand.landmarks[8]
    const wrist = hand.landmarks[0]

    // Calculate distance between thumb and index finger
    const thumbIndexDistance = Math.sqrt(
      Math.pow(thumb.x - index.x, 2) +
      Math.pow(thumb.y - index.y, 2) +
      Math.pow(thumb.z - index.z, 2)
    )

    return (
      <div className="hand-section">
        <h3>{label} Hand ({hand.handedness})</h3>
        <div className="stats-grid">
          <div className="stat-item">
            <span className="stat-label">Gesture:</span>
            <span className={`stat-value gesture-${hand.gesture}`}>
              {hand.gesture === 'palm' ? '🟢 Palm' : 
               hand.gesture === 'fist' ? '✊ Fist' : 
               hand.gesture === 'pinch' ? '🤏 Pinch' : 
               '❓ Unknown'}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Palm Size:</span>
            <span className="stat-value">{formatNumber(hand.palmSize)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Rel. Distances:</span>
            <span className="stat-value">
              Avg: {formatNumber(hand.relativeDistances.average)}x
            </span>
          </div>
          <div className="stat-item stat-sub-item">
            <span className="stat-label">  Index:</span>
            <span className="stat-value">{formatNumber(hand.relativeDistances.index)}x</span>
          </div>
          <div className="stat-item stat-sub-item">
            <span className="stat-label">  Middle:</span>
            <span className="stat-value">{formatNumber(hand.relativeDistances.middle)}x</span>
          </div>
          <div className="stat-item stat-sub-item">
            <span className="stat-label">  Ring:</span>
            <span className="stat-value">{formatNumber(hand.relativeDistances.ring)}x</span>
          </div>
          <div className="stat-item stat-sub-item">
            <span className="stat-label">  Pinky:</span>
            <span className="stat-value">{formatNumber(hand.relativeDistances.pinky)}x</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Palm Center:</span>
            <span className="stat-value">
              ({formatNumber(hand.palmCenter.x)}, {formatNumber(hand.palmCenter.y)})
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Landmarks:</span>
            <span className="stat-value">{hand.landmarks.length}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Wrist Position:</span>
            <span className="stat-value">
              ({formatNumber(wrist.x)}, {formatNumber(wrist.y)}, {formatNumber(wrist.z)})
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Thumb Position:</span>
            <span className="stat-value">
              ({formatNumber(thumb.x)}, {formatNumber(thumb.y)}, {formatNumber(thumb.z)})
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Index Position:</span>
            <span className="stat-value">
              ({formatNumber(index.x)}, {formatNumber(index.y)}, {formatNumber(index.z)})
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Thumb-Index Distance:</span>
            <span className="stat-value">{formatNumber(thumbIndexDistance)}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="hand-statistics-container">
      <h2>Hand Tracking Statistics</h2>
      {renderHandStats(handData.left, 'Left')}
      {renderHandStats(handData.right, 'Right')}
    </div>
  )
}
