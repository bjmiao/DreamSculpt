
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { parseScenePrompt, generateSkyTexture, generateTerrainTexture } from './services/geminiService';
import { DreamRenderer } from './services/sceneService';
import { GestureTracker } from './services/gestureService';
import { GalaxyParticles } from './components/GalaxyParticles';
import { HandMonitor } from './components/HandMonitor';
import { StatsSidebar } from './components/StatsSidebar';
import { AppState, SceneGraph } from './types';

const App: React.FC = () => {
  const [prompt, setPrompt] = useState('A glowing neon forest with floating amethyst crystals and purple rivers');
  const [state, setState] = useState<AppState>({
    isGenerating: false,
    statusMessage: 'Ready to dream...',
    scene: null,
    cameraSpeed: 1,
    handStats: {}
  });

  const rendererRef = useRef<DreamRenderer | null>(null);
  const gestureTrackerRef = useRef<GestureTracker | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastRightPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (containerRef.current && !rendererRef.current) {
      rendererRef.current = new DreamRenderer(containerRef.current);
    }
    
    const startGestures = () => {
        const video = document.getElementById('input_video') as HTMLVideoElement;
        if (video && !gestureTrackerRef.current) {
            gestureTrackerRef.current = new GestureTracker(video, (stats) => {
                setState(prev => ({ ...prev, handStats: stats }));
            });
            gestureTrackerRef.current.start();
        }
    };

    const timer = setTimeout(startGestures, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Handle Gesture interactions
  useEffect(() => {
    if (!rendererRef.current) return;
    const { left, right } = state.handStats;

    // Right Hand Navigation
    if (right) {
        if (right.gesture === 'Open Palm') {
            const dx = right.center.x - lastRightPos.current.x;
            const dy = right.center.y - lastRightPos.current.y;
            rendererRef.current.orbitCamera(-dx * 2, -dy * 2);
        } else if (right.gesture === 'Fist') {
            const dy = right.center.y - lastRightPos.current.y;
            rendererRef.current.dollyCamera(dy * 50);
        }
        lastRightPos.current = { x: right.center.x, y: right.center.y };
    }

    // Left Hand Manipulation (Conceptual for first object)
    if (left && state.scene && state.scene.objects.length > 0) {
        const firstObjId = state.scene.objects[0].id;
        if (left.gesture === 'Pinch') {
            rendererRef.current.manipulateObject(firstObjId, 'translate', {
                x: (left.center.x - 0.5) * 0.5,
                y: -(left.center.y - 0.5) * 0.5
            });
        }
    }
  }, [state.handStats, state.scene]);

  const handleGenerate = async () => {
    if (!prompt.trim() || state.isGenerating) return;

    setState(prev => ({ ...prev, isGenerating: true, statusMessage: 'Parsing your imagination...' }));

    try {
      const scene = await parseScenePrompt(prompt);
      setState(prev => ({ ...prev, statusMessage: 'Generating ethereal textures...' }));
      
      const skyUrl = await generateSkyTexture(scene.ambience);
      const terrainUrl = await generateTerrainTexture(scene.ambience);

      if (rendererRef.current) {
          await rendererRef.current.updateScene(scene, skyUrl, terrainUrl);
      }

      setState(prev => ({ 
        ...prev, 
        scene, 
        isGenerating: false, 
        statusMessage: `Now dreaming: ${scene.ambience}` 
      }));
    } catch (error) {
      console.error(error);
      setState(prev => ({ ...prev, isGenerating: false, statusMessage: 'The dream failed to materialize.' }));
    }
  };

  return (
    <div className="relative w-full h-screen bg-[#050505]">
      {/* Dreamy galaxy particles background */}
      <GalaxyParticles />
      {/* 3D Container */}
      <div ref={containerRef} className="absolute inset-0 z-0" />

      {/* Top Header */}
      <div className="absolute top-0 left-0 w-full p-8 flex justify-between items-start z-10 pointer-events-none">
        <div>
          <h1 className="text-4xl font-extralight tracking-tighter text-white/90">
            DREAMY SCENE <span className="font-bold">VISUALIZER</span>
          </h1>
          <p className="text-white/40 text-sm mt-1">{state.statusMessage}</p>
        </div>
        <div className="flex gap-4 pointer-events-auto">
          <input 
            type="text" 
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your dream..."
            className="w-96 bg-white/5 border border-white/10 rounded-full px-6 py-3 text-white focus:outline-none focus:ring-2 ring-blue-500/50 backdrop-blur-md transition-all"
          />
          <button 
            onClick={handleGenerate}
            disabled={state.isGenerating}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 text-white rounded-full font-semibold shadow-lg shadow-blue-500/20 transition-all active:scale-95"
          >
            {state.isGenerating ? 'Manifesting...' : 'Manifest'}
          </button>
        </div>
      </div>

      {/* UI Elements */}
      <StatsSidebar left={state.handStats.left} right={state.handStats.right} />
      <HandMonitor />

      {/* Crosshair Overlay */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-20">
          <div className="w-12 h-12 border border-white rounded-full flex items-center justify-center">
              <div className="w-1 h-1 bg-white rounded-full" />
          </div>
      </div>

      {/* Hand Cursors */}
      {state.handStats.left && (
          <div 
            className="fixed w-4 h-4 rounded-full bg-blue-400/50 border border-blue-200 pointer-events-none blur-[1px]"
            style={{ 
                left: `${state.handStats.left.center.x * 100}%`, 
                top: `${state.handStats.left.center.y * 100}%` 
            }}
          />
      )}
      {state.handStats.right && (
          <div 
            className="fixed w-4 h-4 rounded-full bg-purple-400/50 border border-purple-200 pointer-events-none blur-[1px]"
            style={{ 
                left: `${state.handStats.right.center.x * 100}%`, 
                top: `${state.handStats.right.center.y * 100}%` 
            }}
          />
      )}

    </div>
  );
};

export default App;
