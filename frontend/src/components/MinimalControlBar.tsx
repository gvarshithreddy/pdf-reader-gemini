/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Play, Pause, ChevronDown, RotateCcw, Volume2, Info, Loader } from 'lucide-react';
import { TtsOptions } from '../types';

interface MinimalControlBarProps {
  isPlaying: boolean;
  isBuffering: boolean;
  isLoading: boolean;
  options: TtsOptions;
  currentChunkIndex: number;
  totalChunks: number;
  onTogglePlayPause: () => void;
  onUpdateOptions: (newOpts: Partial<TtsOptions>) => void;
  onReset: () => void;
}

export default function MinimalControlBar({
  isPlaying,
  isBuffering,
  isLoading,
  options,
  currentChunkIndex,
  totalChunks,
  onTogglePlayPause,
  onUpdateOptions,
  onReset,
}: MinimalControlBarProps) {
  // Voice list supported by TTS models
  const voiceList = [
    // --- American Female ---
    { value: "af_bella", label: "🇺🇸 Female (Bella)" },
    { value: "af_sarah", label: "🇺🇸 Female (Sarah)" },
    { value: "af_nicole", label: "🇺🇸 Female (Nicole)" },
    { value: "af_sky", label: "🇺🇸 Female (Sky)" },
    { value: "af_heart", label: "🇺🇸 Female (Heart)" },
    { value: "af_alloy", label: "🇺🇸 Female (Alloy)" },
    { value: "af_aoede", label: "🇺🇸 Female (Aoede)" },
    { value: "af_kore", label: "🇺🇸 Female (Kore)" },
    
    // --- American Male ---
    { value: "am_adam", label: "🇺🇸 Male (Adam)" },
    { value: "am_michael", label: "🇺🇸 Male (Michael)" },
    { value: "am_onyx", label: "🇺🇸 Male (Onyx)" },
    { value: "am_puck", label: "🇺🇸 Male (Puck)" },
    { value: "am_fenrir", label: "🇺🇸 Male (Fenrir)" },

    // --- British Female ---
    { value: "bf_emma", label: "🇬🇧 Female (Emma)" },
    { value: "bf_isabella", label: "🇬🇧 Female (Isabella)" },
    { value: "bf_alice", label: "🇬🇧 Female (Alice)" },
    { value: "bf_lily", label: "🇬🇧 Female (Lily)" },

    // --- British Male ---
    { value: "bm_george", label: "🇬🇧 Male (George)" },
    { value: "bm_lewis", label: "🇬🇧 Male (Lewis)" },
    { value: "bm_daniel", label: "🇬🇧 Male (Daniel)" },
    { value: "bm_fable", label: "🇬🇧 Male (Fable)" }
  ];

  const completionPercentage = totalChunks > 0 ? Math.round((currentChunkIndex / totalChunks) * 100) : 0;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-full max-w-4xl px-4 z-40 transition-all duration-300">
      <div className="relative overflow-hidden rounded-2xl glass-panel border border-zinc-800 shadow-2xl p-4 text-zinc-100 flex flex-col space-y-3">
        
        {/* Progress horizontal glow slider */}
        {totalChunks > 0 && (
          <div className="w-full bg-zinc-900/60 h-1 rounded-full overflow-hidden absolute top-0 left-0">
            <div
              className="bg-amber-400 h-full transition-all duration-300 shadow-[0_0_8px_rgba(245,158,11,0.6)]"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        )}

        {/* Outer content with scrollable wrapper on mobile */}
        <div className="flex items-center justify-between space-x-4">
          <div className="flex items-center space-x-3 shrink-0">
            {/* Play/Pause control with buffering and loading animations */}
            <button
              id="btn-play-pause"
              disabled={totalChunks === 0}
              onClick={onTogglePlayPause}
              className={`p-3.5 rounded-full transition-all duration-200 shadow-md ${
                totalChunks === 0
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/50'
                  : 'bg-gradient-to-br from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-zinc-950 font-bold active:scale-95 shadow-[0_0_12px_rgba(245,158,11,0.15)] hover:shadow-[0_0_16px_rgba(245,158,11,0.25)]'
              } flex items-center justify-center relative cursor-pointer select-none`}
            >
              {isBuffering || isLoading ? (
                <Loader className="w-5 h-5 animate-spin text-zinc-950" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>

            {/* Reset loader */}
            <button
              id="btn-restart"
              onClick={onReset}
              disabled={totalChunks === 0}
              className="p-2.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 disabled:opacity-50 transition-all cursor-pointer select-none"
              title="Reset reading progress to start"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Horizontally scrollable configuration panel with hidden scrollbars */}
          <div className="flex-1 overflow-x-auto scrollbar-none flex items-center justify-start py-0.5 space-x-6">
            <div className="flex items-center min-w-max space-x-6 pr-6">
              
              {/* Voice select */}
              <div className="flex flex-col">
                <label htmlFor="select-voice" className="text-[9px] font-mono text-zinc-500 mb-1.5 uppercase tracking-wider select-none">Voice Profile</label>
                <div className="relative">
                  <select
                    id="select-voice"
                    value={options.voice}
                    onChange={(e) => onUpdateOptions({ voice: e.target.value })}
                    className="appearance-none bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 pr-8 text-xs font-medium text-zinc-100 focus:outline-none focus:border-amber-400 cursor-pointer min-w-[130px] select-none"
                  >
                    {voiceList.map((voice) => (
                      <option key={voice.value} value={voice.value} className="bg-zinc-950 text-white">
                        {voice.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                </div>
              </div>

              {/* Speed customization */}
              <div className="flex flex-col min-w-[110px]">
                <div className="flex items-center justify-between mb-1.5 select-none">
                  <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">Speed</span>
                  <span className="text-[9px] font-mono text-amber-400 font-bold">{options.speed.toFixed(1)}x</span>
                </div>
                <input
                  id="slider-speed"
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.1"
                  value={options.speed}
                  onChange={(e) => onUpdateOptions({ speed: parseFloat(e.target.value) })}
                  className="w-full accent-amber-400 cursor-pointer bg-zinc-900 border border-zinc-800 h-1.5 rounded-lg appearance-none"
                />
              </div>

              {/* Pitch customization */}
              <div className="flex flex-col min-w-[110px]">
                <div className="flex items-center justify-between mb-1.5 select-none">
                  <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">Pitch</span>
                  <span className="text-[9px] font-mono text-amber-400 font-bold">{options.pitch.toFixed(1)}x</span>
                </div>
                <input
                  id="slider-pitch"
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={options.pitch}
                  onChange={(e) => onUpdateOptions({ pitch: parseFloat(e.target.value) })}
                  className="w-full accent-amber-400 cursor-pointer bg-zinc-900 border border-zinc-800 h-1.5 rounded-lg appearance-none"
                />
              </div>

            </div>
          </div>

          {/* Quick Stats display info and Wave visualizer */}
          <div className="text-right shrink-0 hidden sm:flex items-center gap-4 select-none pl-4 border-l border-zinc-800 font-mono">
            {isPlaying && (
              <div className="flex items-center gap-0.5 h-3.5 w-6 overflow-hidden">
                <span className="w-0.5 h-full bg-amber-400/40 rounded-full animate-pulse" style={{ animationDelay: '0.1s' }} />
                <span className="w-0.5 h-full bg-amber-400 rounded-full wave-bar" style={{ animationDuration: '0.8s', animationDelay: '0.2s' }} />
                <span className="w-0.5 h-full bg-amber-500 rounded-full wave-bar" style={{ animationDuration: '1.2s', animationDelay: '0s' }} />
                <span className="w-0.5 h-full bg-amber-400 rounded-full wave-bar" style={{ animationDuration: '0.9s', animationDelay: '0.4s' }} />
                <span className="w-0.5 h-full bg-amber-400/40 rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
              </div>
            )}
            <div className="flex flex-col justify-center text-left">
              {totalChunks > 0 ? (
                <>
                  <div className="text-[9px] text-zinc-500 uppercase tracking-wider">Reading Timeline</div>
                  <div className="text-xs text-amber-400 font-bold mt-0.5">
                    Block {currentChunkIndex + 1}/{totalChunks}
                  </div>
                </>
              ) : (
                <div className="text-xs text-zinc-500 italic">No document loaded</div>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
