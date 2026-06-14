/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { TtsChunk, TtsOptions } from '../types';

interface ScheduledItem {
  source: AudioBufferSourceNode;
  gain: GainNode;
  chunkIndex: number;
  startTime: number;
  duration: number;
}

// Robust audio decoding utility supports standard headers (WAV/MP3) & raw mono linear 16-bit PCM (24kHz)
async function decodeAudio(arrayBuffer: ArrayBuffer, audioContext: AudioContext): Promise<AudioBuffer> {
  try {
    // Clone buffer because decodeAudioData consumes it
    const clone = arrayBuffer.slice(0);
    return await audioContext.decodeAudioData(clone);
  } catch (err) {
    console.warn("Standard decodeAudioData failed, attempting raw Float32 conversion for 16-bit Mono PCM 24000Hz fallback:", err);
    try {
      const int16Array = new Int16Array(arrayBuffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }
      const buffer = audioContext.createBuffer(1, float32Array.length, 24000);
      buffer.getChannelData(0).set(float32Array);
      return buffer;
    } catch (fallbackErr) {
      console.error("PCM Fallback decoding failed as well:", fallbackErr);
      throw err;
    }
  }
}

export function usePdfTtsEngine(serverIp: string | null) {
  const [chunks, setChunksState] = useState<TtsChunk[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentChunkIndex, setCurrentChunkIndexState] = useState<number>(0);
  const [options, setOptions] = useState<TtsOptions>({
    voice: 'af_bella',
    speed: 1.0,
    pitch: 1.0,
  });

  // Keep references to skip closure issues in active scheduler loops
  const chunksRef = useRef<TtsChunk[]>([]);
  const currentChunkIndexRef = useRef<number>(0);
  const isPlayingRef = useRef(false);
  const optionsRef = useRef(options);

  useEffect(() => {
    chunksRef.current = chunks;
  }, [chunks]);

  useEffect(() => {
    optionsRef.current = options;
    // Clear cache when voice/speed/pitch changes since cache contains old parameters
    prefetchCacheRef.current.clear();
  }, [options]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const prefetchCacheRef = useRef<Map<number, AudioBuffer>>(new Map());
  const activeFetchesRef = useRef<Set<number>>(new Set());
  
  const nextScheduleIndexRef = useRef<number>(0);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<ScheduledItem[]>([]);
  const schedulerIntervalRef = useRef<number | null>(null);

  // Sync state reference to prevent index lag
  const setIndexSync = (idx: number) => {
    currentChunkIndexRef.current = idx;
    setCurrentChunkIndexState(idx);
  };

  const getAudioContext = useCallback((): AudioContext => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const prefetchNextChunks = useCallback(() => {
    if (!serverIp || chunksRef.current.length === 0) return;

    const currentIndex = currentChunkIndexRef.current;
    const targetPrefetchRange = 8; // Pre-cache next 8 buffers
    const activeOpts = optionsRef.current;

    for (let offset = 0; offset < targetPrefetchRange; offset++) {
      const idx = currentIndex + offset;
      if (idx < 0 || idx >= chunksRef.current.length) continue;

      // Skip if cached or fetch in progress
      if (prefetchCacheRef.current.has(idx) || activeFetchesRef.current.has(idx)) {
        continue;
      }

      // Mark index as being fetched
      const chunkText = chunksRef.current[idx].text;
      activeFetchesRef.current.add(idx);

      (async () => {
        try {
          const cleanIp = serverIp.trim().replace(/^https?:\/\//, '');
          let decoded: AudioBuffer;

          if (cleanIp.toLowerCase() === 'mock') {
            const ctx = getAudioContext();
            const words = chunkText.split(/\s+/).length;
            // Simulated speech duration: ~0.26s per word, divided by active speed scalar
            const speedFactor = activeOpts.speed || 1.0;
            const pitchFactor = activeOpts.pitch || 1.0;
            const duration = Math.max(0.4, Math.min(4.0, words * (0.26 / speedFactor)));
            const sampleRate = ctx.sampleRate;
            
            decoded = ctx.createBuffer(1, sampleRate * duration, sampleRate);
            const data = decoded.getChannelData(0);
            
            // Synth resonant voice carriers for modular speaking tones
            const f0 = 150 * pitchFactor; 
            for (let i = 0; i < data.length; i++) {
              const t = i / sampleRate;
              const fm = Math.sin(2 * Math.PI * 5 * t) * 10; // 5Hz frequency modulation
              const s1 = Math.sin(2 * Math.PI * (f0 + fm) * t);
              const s2 = Math.sin(2 * Math.PI * (f0 * 1.5 + fm) * t) * 0.3; // harmonics
              const s3 = Math.sin(2 * Math.PI * (f0 * 2.0 + fm) * t) * 0.15;
              
              data[i] = (s1 + s2 + s3) * 0.12;

              // Soft boundary attack & release envelopes
              if (t < 0.04) {
                data[i] *= (t / 0.04);
              } else if (t > duration - 0.06) {
                data[i] *= (Math.max(0, duration - t) / 0.06);
              }
            }
          } else {
            const response = await fetch(`http://${cleanIp}/synthesize`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                text: chunkText,
                voice: activeOpts.voice,
                speed: activeOpts.speed,
                pitch: activeOpts.pitch,
                sample_rate: 24000,
              }),
            });

            if (!response.ok) {
              throw new Error(`TTS HTTP error: ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const parsedCtx = getAudioContext();
            decoded = await decodeAudio(arrayBuffer, parsedCtx);
          }

          prefetchCacheRef.current.set(idx, decoded);
        } catch (err) {
          console.warn(`Buffer fetching failed for index ${idx}:`, err);
        } finally {
          activeFetchesRef.current.delete(idx);
        }
      })();
    }

    // Clean up older or too far cached chunks to prevent memory leaks
    for (const cachedIdx of Array.from(prefetchCacheRef.current.keys()) as number[]) {
      if (cachedIdx < currentIndex - 1 || cachedIdx > currentIndex + 12) {
        prefetchCacheRef.current.delete(cachedIdx);
      }
    }
  }, [serverIp, getAudioContext]);

  // Clean play state, stops all active nodes
  const clearPlaySession = useCallback(() => {
    activeSourcesRef.current.forEach(({ source, gain }) => {
      try {
        source.stop();
        source.disconnect();
        gain.disconnect();
      } catch (_) {}
    });
    activeSourcesRef.current = [];
  }, []);

  const stopAllAudio = useCallback(() => {
    clearPlaySession();
    setIsPlaying(false);
    isPlayingRef.current = false;
    setIsBuffering(false);
  }, [clearPlaySession]);

  const togglePlayPause = useCallback(() => {
    if (!serverIp || chunksRef.current.length === 0) return;

    if (isPlaying) {
      stopAllAudio();
    } else {
      // Lazy init audio context
      const audioCtx = getAudioContext();
      setIsPlaying(true);
      isPlayingRef.current = true;
      
      // Resume or restart scheduler
      nextScheduleIndexRef.current = currentChunkIndexRef.current;
      nextStartTimeRef.current = 0; // immediate play
    }
  }, [isPlaying, getAudioContext, serverIp, stopAllAudio]);

  const setCurrentChunkIndex = useCallback((index: number) => {
    const targetIdx = Math.max(0, Math.min(chunksRef.current.length - 1, index));
    if (isPlayingRef.current) {
      clearPlaySession();
      setIndexSync(targetIdx);
      nextScheduleIndexRef.current = targetIdx;
      nextStartTimeRef.current = 0; // immediate reset scheduler timeline
    } else {
      setIndexSync(targetIdx);
      nextScheduleIndexRef.current = targetIdx;
    }
  }, [clearPlaySession]);

  const updateOptions = useCallback((newOpts: Partial<TtsOptions>) => {
    setOptions((prev) => ({ ...prev, ...newOpts }));
  }, []);

  const setChunks = useCallback((newChunks: TtsChunk[]) => {
    stopAllAudio();
    chunksRef.current = newChunks;
    setChunksState(newChunks);
    setIndexSync(0);
    prefetchCacheRef.current.clear();
    activeFetchesRef.current.clear();
    nextScheduleIndexRef.current = 0;
    nextStartTimeRef.current = 0;
  }, [stopAllAudio]);

  // Use high reliability scheduler loop inside useEffect
  useEffect(() => {
    if (schedulerIntervalRef.current) {
      window.clearInterval(schedulerIntervalRef.current);
    }

    schedulerIntervalRef.current = window.setInterval(() => {
      // Periodic prefetch triggers
      prefetchNextChunks();

      if (!isPlayingRef.current || chunksRef.current.length === 0 || !serverIp) {
        return;
      }

      const audioCtx = getAudioContext();
      const lookahead = 2.0; // Queue audio 2s into the future
      const now = audioCtx.currentTime;

      // 1. Maintain highlighting sync and garbage collect finished nodes
      let heardIndex = currentChunkIndexRef.current;
      let isAnySpeechPlaying = false;

      activeSourcesRef.current = activeSourcesRef.current.filter((item) => {
        const itemEndTime = item.startTime + item.duration;
        if (now >= item.startTime - 0.05 && now < itemEndTime) {
          heardIndex = item.chunkIndex;
          isAnySpeechPlaying = true;
          return true;
        }
        if (now >= itemEndTime) {
          try {
            item.source.disconnect();
            item.gain.disconnect();
          } catch (_) {}
          return false; // fully played
        }
        return true; // future scheduled
      });

      if (heardIndex !== currentChunkIndexRef.current) {
        setIndexSync(heardIndex);
      }

      // If scheduled items fully processed and we are out of future schedules, end playback
      if (
        nextScheduleIndexRef.current >= chunksRef.current.length &&
        activeSourcesRef.current.length === 0
      ) {
        stopAllAudio();
        return;
      }

      // 2. Queue lookahead chunks
      while (
        nextScheduleIndexRef.current < chunksRef.current.length &&
        (nextStartTimeRef.current === 0 || nextStartTimeRef.current < now + lookahead)
      ) {
        const indexToSchedule = nextScheduleIndexRef.current;
        const cachedBuffer = prefetchCacheRef.current.get(indexToSchedule);

        if (!cachedBuffer) {
          // If we haven't scheduled anything yet, or are about to speak but lack buffers, we are buffering
          if (activeSourcesRef.current.length === 0) {
            setIsBuffering(true);
          }
          break; // Must wait for next buffer resource
        }

        setIsBuffering(false);

        // Compute play start timestamp
        let startTimestamp = nextStartTimeRef.current;
        if (startTimestamp < now + 0.02) {
          startTimestamp = now + 0.05; // small scheduling margin
        }

        const source = audioCtx.createBufferSource();
        source.buffer = cachedBuffer;

        const gainNode = audioCtx.createGain();
        source.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        const duration = cachedBuffer.duration;
        const crossfadeTime = 0.05; // 50ms overlap crossfade

        // Standard linear rise and fall audio level envelope
        gainNode.gain.setValueAtTime(0, startTimestamp);
        gainNode.gain.linearRampToValueAtTime(1, startTimestamp + crossfadeTime);
        gainNode.gain.setValueAtTime(1, startTimestamp + duration - crossfadeTime);
        gainNode.gain.linearRampToValueAtTime(0, startTimestamp + duration);

        // Trigger node start
        try {
          source.start(startTimestamp);
        } catch (e) {
          console.error("Failed to start scheduled buffer node:", e);
          break;
        }

        // Save node state
        activeSourcesRef.current.push({
          source,
          gain: gainNode,
          chunkIndex: indexToSchedule,
          startTime: startTimestamp,
          duration,
        });

        // Shift next timing index with overlap subtraction
        nextStartTimeRef.current = startTimestamp + duration - crossfadeTime;
        nextScheduleIndexRef.current = indexToSchedule + 1;
      }
    }, 100);

    return () => {
      if (schedulerIntervalRef.current) {
        window.clearInterval(schedulerIntervalRef.current);
      }
    };
  }, [prefetchNextChunks, getAudioContext, serverIp, stopAllAudio]);

  const resetEngine = useCallback(() => {
    stopAllAudio();
    setChunksState([]);
    setIndexSync(0);
    prefetchCacheRef.current.clear();
    activeFetchesRef.current.clear();
    nextScheduleIndexRef.current = 0;
    nextStartTimeRef.current = 0;
  }, [stopAllAudio]);

  // Pre-fetch initial chunks and resolve when at least `count` are cached.
  // Used during the loading screen to warm up audio before showing the reader.
  const prefetchInitialChunks = useCallback(async (count: number = 3): Promise<void> => {
    if (!serverIp || chunksRef.current.length === 0) return;

    const target = Math.min(count, chunksRef.current.length);
    const activeOpts = optionsRef.current;
    const fetchPromises: Promise<void>[] = [];

    // Kick off fetches for the first `target` chunks
    for (let idx = 0; idx < target; idx++) {
      if (prefetchCacheRef.current.has(idx) || activeFetchesRef.current.has(idx)) continue;

      const chunkText = chunksRef.current[idx].text;
      activeFetchesRef.current.add(idx);

      const fetchPromise = (async () => {
        try {
          const cleanIp = serverIp.trim().replace(/^https?:\/\//, '');
          let decoded: AudioBuffer;

          if (cleanIp.toLowerCase() === 'mock') {
            const ctx = getAudioContext();
            const words = chunkText.split(/\s+/).length;
            const speedFactor = activeOpts.speed || 1.0;
            const pitchFactor = activeOpts.pitch || 1.0;
            const duration = Math.max(0.4, Math.min(4.0, words * (0.26 / speedFactor)));
            const sampleRate = ctx.sampleRate;
            decoded = ctx.createBuffer(1, sampleRate * duration, sampleRate);
            const data = decoded.getChannelData(0);
            const f0 = 150 * pitchFactor;
            for (let i = 0; i < data.length; i++) {
              const t = i / sampleRate;
              const fm = Math.sin(2 * Math.PI * 5 * t) * 10;
              data[i] = (Math.sin(2 * Math.PI * (f0 + fm) * t) + Math.sin(2 * Math.PI * (f0 * 1.5 + fm) * t) * 0.3) * 0.12;
              if (t < 0.04) data[i] *= (t / 0.04);
              else if (t > duration - 0.06) data[i] *= (Math.max(0, duration - t) / 0.06);
            }
          } else {
            const response = await fetch(`http://${cleanIp}/synthesize`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: chunkText,
                voice: activeOpts.voice,
                speed: activeOpts.speed,
                pitch: activeOpts.pitch,
                sample_rate: 24000,
              }),
            });
            if (!response.ok) throw new Error(`TTS HTTP error: ${response.status}`);
            const arrayBuffer = await response.arrayBuffer();
            decoded = await decodeAudio(arrayBuffer, getAudioContext());
          }
          prefetchCacheRef.current.set(idx, decoded);
        } catch (err) {
          console.warn(`Initial prefetch failed for chunk ${idx}:`, err);
        } finally {
          activeFetchesRef.current.delete(idx);
        }
      })();
      
      fetchPromises.push(fetchPromise);
    }

    // Wait for all initial fetches to complete (or fail)
    if (fetchPromises.length > 0) {
      await Promise.all(fetchPromises);
    }
  }, [serverIp, getAudioContext]);

  // Clean context on completely unmount
  useEffect(() => {
    return () => {
      stopAllAudio();
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [stopAllAudio]);

  return {
    chunks,
    isPlaying,
    isBuffering,
    isLoading: activeFetchesRef.current.size > 0 && prefetchCacheRef.current.size === 0 && isPlaying,
    currentChunkIndex,
    options,
    togglePlayPause,
    setCurrentChunkIndex,
    updateOptions,
    setChunks,
    resetEngine,
    prefetchInitialChunks,
  };
}
