
import React from 'react';
import { HandStats } from '../types';

interface StatsSidebarProps {
  left?: HandStats;
  right?: HandStats;
}

export const StatsSidebar: React.FC<StatsSidebarProps> = ({ left, right }) => {
  const renderHand = (hand: HandStats, side: string) => (
    <div className="mb-6 p-4 bg-white/5 border border-white/10 rounded-lg">
      <h3 className="text-xs font-bold text-blue-400 mb-2 uppercase tracking-widest">{side} HAND</h3>
      <div className="space-y-1 text-sm font-mono">
        <div className="flex justify-between">
          <span className="text-white/40">Gesture:</span>
          <span className="text-white">{hand.gesture}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/40">Palm Size:</span>
          <span className="text-white">{hand.palmSize.toFixed(4)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/40">Center X:</span>
          <span className="text-white">{hand.center.x.toFixed(4)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/40">Center Y:</span>
          <span className="text-white">{hand.center.y.toFixed(4)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/40">Pinch Dist:</span>
          <span className="text-white">{hand.distance.toFixed(4)}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed left-4 top-24 w-64 p-4 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl h-[calc(100vh-8rem)] overflow-y-auto z-10">
      <h2 className="text-lg font-light mb-6 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        Neural Statistics
      </h2>
      {left && renderHand(left, 'Left')}
      {right && renderHand(right, 'Right')}
      {!left && !right && (
          <div className="text-white/20 text-center mt-20 italic">
            Waiting for visual input...
          </div>
      )}
    </div>
  );
};
