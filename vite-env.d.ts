/// <reference types="vite/client" />

declare module '*.ply?url' {
  const url: string;
  export default url;
}

/* Web Speech API (SpeechRecognition) - not in all TS libs */
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
}
declare var SpeechRecognition: { new (): SpeechRecognition };
declare var webkitSpeechRecognition: { new (): SpeechRecognition };
