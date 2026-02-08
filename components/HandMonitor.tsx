import React from 'react';

interface HandMonitorProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isTracking?: boolean;
}

export const HandMonitor: React.FC<HandMonitorProps> = ({ videoRef, canvasRef, isTracking }) => {
  return (
    <div className="fixed bottom-4 right-4 w-64 h-48 bg-black/50 border border-white/20 rounded-xl overflow-hidden shadow-2xl backdrop-blur-md z-10">
      <video ref={videoRef} id="input_video" className="hidden" playsInline muted />
      <canvas
        ref={canvasRef}
        id="output_canvas"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
      />
      <div className="absolute top-2 left-2 text-[10px] font-mono text-white/80 bg-black/60 px-2 py-1 rounded z-10">
        {isTracking ? 'TRACKING ACTIVE' : 'STARTING...'}
      </div>
    </div>
  );
};
