import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { classifyPrompt, parseScenePrompt, generateSkyTexture, generateTerrainTexture } from './services/geminiService';
import { DreamRenderer } from './services/sceneService';
import { CameraActionManager } from './services/CameraActionManager';
import {
  OrbitCameraAction,
  DollyCameraAction,
  PinchTranslateAction,
  FistRotateAction,
  PalmReleaseAction,
  TwoHandPinchScaleAction,
} from './services/defaultCameraActions';
import { GalaxyParticles } from './components/GalaxyParticles';
import { HandMonitor } from './components/HandMonitor';
import HandStatistics, { HandData } from './components/HandStatistics';
import { useHandTracking } from './services/handTrackingService';
import { AppState, SceneGraph, HandStats } from './types';

/** Convert HandData from handTrackingService to HandStats for CameraActionManager and UI. */
function handDataToHandStats(handData: HandData): { left?: HandStats; right?: HandStats } {
  const out: { left?: HandStats; right?: HandStats } = {};
  const mapGesture = (g: string) =>
    g === 'palm' ? 'Open Palm' : g === 'fist' ? 'Fist' : g === 'pinch' ? 'Pinch' : 'Open Palm';
  for (const side of ['left', 'right'] as const) {
    const hand = handData[side];
    if (!hand) continue;
    const thumb = hand.landmarks[4];
    const index = hand.landmarks[8];
    const distance = thumb && index
      ? Math.sqrt(
          (thumb.x - index.x) ** 2 + (thumb.y - index.y) ** 2 + (thumb.z - index.z) ** 2
        )
      : 0;
    const handedness = (hand.handedness === 'Left' || hand.handedness === 'Right'
      ? hand.handedness
      : side === 'left' ? 'Left' : 'Right') as 'Left' | 'Right';
    const stat: HandStats = {
      gesture: mapGesture(hand.gesture),
      palmSize: hand.palmSize,
      center: hand.palmCenter,
      landmarks: hand.landmarks,
      distance,
      handedness,
    };
    out[side] = stat;
  }
  return out;
}

const SpeechRecognitionCtor =
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition);

const App: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [state, setState] = useState<AppState>({
    isGenerating: false,
    statusMessage: 'Ready to dream...',
    skyUrl: null,
    terrainUrl: null,
    scene: null,
    cameraSpeed: 1,
  });

  const recognitionRef = useRef<InstanceType<NonNullable<typeof SpeechRecognitionCtor>> | null>(null);
  const voiceTranscriptRef = useRef('');
  const promptInputRef = useRef<HTMLInputElement>(null);
  const rendererRef = useRef<DreamRenderer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraActionManagerRef = useRef<CameraActionManager | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fpsUpdateRef = useRef(0);
  const { handData, isTracking } = useHandTracking(videoRef, canvasRef);

  const handStats = useMemo(() => handDataToHandStats(handData), [handData]);

  useEffect(() => {
    if (containerRef.current && !rendererRef.current) {
      rendererRef.current = new DreamRenderer(containerRef.current, {
        onFpsUpdate: (fps) => {
          const now = Date.now();
          if (now - fpsUpdateRef.current >= 200) {
            fpsUpdateRef.current = now;
            setState((prev) => ({ ...prev, fps }));
          }
        },
      });
    }

    if (!cameraActionManagerRef.current) {
      const manager = new CameraActionManager();
      manager.register(new OrbitCameraAction());
      manager.register(new DollyCameraAction());
      manager.register(new PinchTranslateAction());
      manager.register(new FistRotateAction());
      manager.register(new PalmReleaseAction());
      manager.register(new TwoHandPinchScaleAction());
      cameraActionManagerRef.current = manager;
    }
  }, []);

  // Hand gesture → scene: delegate to CameraActionManager (handStats from handTrackingService)
  useEffect(() => {
    const renderer = rendererRef.current;
    const manager = cameraActionManagerRef.current;
    if (!renderer || !manager) return;
    manager.process(handStats, state.scene, renderer);
  }, [handStats, state.scene]);

  const handleGenerate = useCallback(async (promptOverride?: string) => {
    const raw = promptOverride !== undefined ? promptOverride : prompt;
    const text = typeof raw === 'string' ? raw.trim() : String(raw).trim();
    if (!text || state.isGenerating) return;

    setPrompt(text);
    setState(prev => ({ ...prev, isGenerating: true, statusMessage: 'Classifying prompt...' }));

    try {
      const kind = await classifyPrompt(text);
      console.log("kind", kind);
      if (kind === 'scene') {
        setState(prev => ({ ...prev, statusMessage: 'Generating sky & terrain...' }));
        const ambience = text.slice(0, 300);
        const [skyUrl, terrainUrl] = await Promise.all([
          generateSkyTexture(ambience),
          generateTerrainTexture(ambience),
        ]);
        setState(prev => ({
          ...prev,
          skyUrl,
          terrainUrl,
        }));
        const terrainColor = '#FFFFFF';
        const skyColor = '#FFFFFF';
        if (rendererRef.current) {
          await rendererRef.current.setSkyAndTerrain(skyColor, terrainColor, skyUrl, terrainUrl);
        }
        setState(prev => ({ ...prev, isGenerating: false, statusMessage: `Now dreaming: ${ambience.slice(0, 50)}...` }));
        return;
      }

      setState(prev => ({ ...prev, statusMessage: 'Parsing objects...' }));
      const scene = await parseScenePrompt(text);
      setState(prev => ({ ...prev, statusMessage: 'Generating ethereal textures...' }));

      // // use the previous skyURL and terrainUrl
      // if (!state.skyUrl || !state.terrainUrl) {
      //   console.log("Generating new textures");
      //   const [skyUrl, terrainUrl] = await Promise.all([
      //     generateSkyTexture(text),
      //     generateTerrainTexture(text),
      // ]);
      // if (rendererRef.current) {
      //     await rendererRef.current.setSkyAndTerrain(scene.skyColor, scene.terrainColor, state.skyUrl, state.terrainUrl);
      // }
      // setState(prev => ({
      //     ...prev,
      //     skyUrl,
      //     terrainUrl,
      //   }));
      // }

      if (rendererRef.current) {
        await rendererRef.current.addObjects(scene.objects);
      }
      
      setState(prev => ({
        ...prev,
        scene,
        isGenerating: false,
        statusMessage: `Now dreaming: ${scene.ambience}`,
      }));
    } catch (error) {
      console.error(error);
      setState(prev => ({ ...prev, isGenerating: false, statusMessage: 'The dream failed to materialize.' }));
    }
  }, [prompt, state.isGenerating]);

  // Voice recognition: create once
  useEffect(() => {
    if (!SpeechRecognitionCtor) return;
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (typeof t !== 'string') continue;
        if (event.results[i].isFinal) {
          voiceTranscriptRef.current += t + (i < event.results.length - 1 ? ' ' : '');
        } else {
          interim += t;
        }
      }
      const next = voiceTranscriptRef.current + interim;
      setPrompt(typeof next === 'string' ? next : '');
    };
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    return () => {
      try { recognition.abort(); } catch { /* noop */ }
      recognitionRef.current = null;
    };
  }, []);

  const startVoiceInput = useCallback(() => {
    setPrompt('');
    if (!recognitionRef.current || state.isGenerating) return;
    voiceTranscriptRef.current = '';
    setIsListening(true);
    try {
      recognitionRef.current.start();
    } catch (e) {
      setIsListening(false);
    }
  }, [state.isGenerating]);

  const stopVoiceInput = useCallback(() => {
    if (!recognitionRef.current) return;
    setIsListening(false);
    try {
      recognitionRef.current.stop();
    } catch { /* noop */ }
    // const transcript = typeof voiceTranscriptRef.current === 'string' ? voiceTranscriptRef.current.trim() : '';
    const transcript = prompt;
    if (transcript) {
      setPrompt(transcript);
      setTimeout(() => handleGenerate(transcript), 0);
    }
  }, [handleGenerate]);

  // Keep prompt input scrolled to the end as voice adds text
  useEffect(() => {
    const el = promptInputRef.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
    el.setSelectionRange(prompt.length, prompt.length);
  }, [prompt]);

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
          </h1>
        </div>
        <div className="flex gap-3 items-center pointer-events-auto">
          <input 
            ref={promptInputRef}
            type="text" 
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your dream..."
            className="w-96 bg-white/5 border border-white/10 rounded-full px-6 py-3 text-white focus:outline-none focus:ring-2 ring-blue-500/50 backdrop-blur-md transition-all"
          />
          <button
            type="button"
            onPointerDown={startVoiceInput}
            onPointerUp={stopVoiceInput}
            onPointerLeave={isListening ? stopVoiceInput : undefined}
            disabled={state.isGenerating || !SpeechRecognitionCtor}
            className={`p-3 rounded-full font-semibold transition-all select-none touch-none ${
              SpeechRecognitionCtor
                ? isListening
                  ? 'bg-red-600 text-white shadow-lg shadow-red-500/30 animate-pulse'
                  : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
                : 'bg-white/5 text-white/40 cursor-not-allowed'
            }`}
            title={SpeechRecognitionCtor ? 'Hold to speak, release to generate' : 'Voice input not supported in this browser'}
          >
            <span className="sr-only">Voice input</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
          <button 
            onClick={() => handleGenerate(prompt)}
            disabled={state.isGenerating}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 text-white rounded-full font-semibold shadow-lg shadow-blue-500/20 transition-all active:scale-95"
          >
            {state.isGenerating ? 'Manifesting...' : 'Manifest'}
          </button>
        </div>
      </div>

      {/* UI Elements */}
      <HandMonitor videoRef={videoRef} canvasRef={canvasRef} isTracking={isTracking} />

      {/* FPS */}
      {state.fps != null && (
        <div className="fixed top-3 right-3 text-white/80 text-sm font-mono tabular-nums pointer-events-none select-none">
          {/* {state.fps} FPS */}
        </div>
      )}

      {/* Crosshair Overlay */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-20">
          <div className="w-12 h-12 border border-white rounded-full flex items-center justify-center">
              <div className="w-1 h-1 bg-white rounded-full" />
          </div>
      </div>

      {/* Hand Cursors (from handTrackingService) */}
      {handStats.left && (
          <div 
            className="fixed w-4 h-4 rounded-full bg-blue-400/50 border border-blue-200 pointer-events-none blur-[1px]"
            style={{ 
                left: `${handStats.left.center.x * 100}%`, 
                top: `${handStats.left.center.y * 100}%` 
            }}
          />
      )}
      {handStats.right && (
          <div 
            className="fixed w-4 h-4 rounded-full bg-purple-400/50 border border-purple-200 pointer-events-none blur-[1px]"
            style={{ 
                left: `${handStats.right.center.x * 100}%`, 
                top: `${handStats.right.center.y * 100}%` 
            }}
          />
      )}
      <HandStatistics handData={handData} />
    </div>
  );
};

export default App;
