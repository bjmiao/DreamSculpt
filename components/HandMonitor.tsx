
import React, { useRef, useEffect } from 'react';

export const HandMonitor: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // MediaPipe rendering usually happens via the gesture service, 
    // but we provide the video element here.
  }, []);

  return (
    <div className="fixed bottom-4 right-4 w-64 h-48 bg-black/50 border border-white/20 rounded-xl overflow-hidden shadow-2xl backdrop-blur-md">
      <video ref={videoRef} id="input_video" className="hidden" />
      <canvas ref={canvasRef} id="output_canvas" className="w-full h-full object-cover grayscale opacity-60" />
      <div className="absolute top-2 left-2 text-[10px] font-mono text-white/50 bg-black/50 px-2 py-1 rounded">
        TRACKING ACTIVE
      </div>
    </div>
  );
};
