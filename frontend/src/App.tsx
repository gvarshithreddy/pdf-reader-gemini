/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Network, Moon, Sun, Settings, Sparkles, Server, Terminal, HelpCircle, Laptop, AlertCircle } from 'lucide-react';
import DocumentReader from './components/DocumentReader';
import MinimalControlBar from './components/MinimalControlBar';
import { usePdfTtsEngine } from './hooks/usePdfTtsEngine';
import { ServerConfig, TtsChunk } from './types';

export default function App() {
  // 1. Theme state handling
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  // 2. Server IP configuration state (Initial load checks localStorage)
  const [serverConfig, setServerConfig] = useState<ServerConfig>(() => {
    const savedIp = localStorage.getItem('tts-backend-ip');
    return {
      ip: savedIp || '',
      isValidated: !!savedIp,
    };
  });

  // Modal form input states
  const [modalInput, setModalInput] = useState<string>(serverConfig.ip || '192.168.1.5:8000');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verifyError, setVerifyError] = useState<string>('');
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false); // No initial blocking modal: settings are inline on landing page

  // Initialize TTS Core Playback Hook
  const {
    chunks,
    isPlaying,
    isBuffering,
    isLoading,
    currentChunkIndex,
    options,
    togglePlayPause,
    setCurrentChunkIndex,
    updateOptions,
    setChunks,
    resetEngine,
  } = usePdfTtsEngine(serverConfig.isValidated ? serverConfig.ip : null);

  // 3. Connect/Verify TTS server health
  const handleVerifyServer = async (ipToTest: string) => {
    const cleanIp = ipToTest.trim().replace(/^https?:\/\//, '');
    if (!cleanIp) {
      setVerifyError('Please enter a valid IP address and port.');
      return;
    }

    setIsVerifying(true);
    setVerifyError('');

    // Handle instant offline demo/sandbox validation
    if (cleanIp.toLowerCase() === 'mock') {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          setIsVerifying(false);
          setServerConfig({ ip: 'mock', isValidated: true });
          localStorage.setItem('tts-backend-ip', 'mock');
          setShowConfigModal(false);
          resolve();
        }, 800);
      });
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      // Send standard test synthesis payload
      const response = await fetch(`http://${cleanIp}/synthesize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: 'ping',
          voice: 'af_bella',
          speed: 1.0,
          pitch: 1.0,
          sample_rate: 24000,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Any HTTP response under 500 confirms CORS re-routing is up and IP is reachable
      if (response.status < 500) {
        setServerConfig({ ip: cleanIp, isValidated: true });
        localStorage.setItem('tts-backend-ip', cleanIp);
        setShowConfigModal(false);
      } else {
        throw new Error(`Server returned HTTP status ${response.status}`);
      }
    } catch (err: any) {
      console.error('Server checking failed:', err);
      setVerifyError(
        'Could not reach the TTS backend. Verify that the IP is correct, the server is running, and CORS is enabled.'
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDisconnect = () => {
    resetEngine();
    setServerConfig({ ip: '', isValidated: false });
    localStorage.removeItem('tts-backend-ip');
    // Don't auto open config modal on landing page since it has inline config
  };

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${
      isDark ? 'bg-[#09090b] text-zinc-100' : 'bg-[#fafafa] text-zinc-900'
    } antialiased`}>
      
      {/* Brutalist Elegant Top Navigation Bar */}
      <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-[#0a0a0c]/85 border-b border-zinc-900/60 px-6 py-3 flex items-center justify-between text-zinc-100">
        
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-zinc-950 shadow-md">
            <span className="font-mono font-bold text-sm tracking-wider">NP</span>
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest font-mono text-zinc-100 leading-none">Neural PDF</h2>
            <p className="text-[8px] text-zinc-500 font-mono tracking-wide mt-1 leading-none select-none">WebAudio Gapless Streamer</p>
          </div>
        </div>

        {/* Global actions and status pills */}
        <div className="flex items-center space-x-3">
          
          {serverConfig.isValidated && (
            <div className="hidden sm:inline-flex items-center space-x-2 bg-emerald-500/5 border border-emerald-500/15 px-2.5 py-1 rounded-full text-emerald-400 text-[9px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>Node Active: {serverConfig.ip === 'mock' ? 'MOCK_DEMO' : serverConfig.ip}</span>
            </div>
          )}

          {/* Configuration Setup Button */}
          {chunks.length > 0 && (
            <button
              id="btn-edit-config"
              onClick={() => {
                setModalInput(serverConfig.ip || '192.168.1.5:8000');
                setVerifyError('');
                setShowConfigModal(true);
              }}
              className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
              title="Setup TTS connection"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Theme switcher */}
          <button
            id="btn-toggle-theme"
            onClick={() => setIsDark(!isDark)}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
            title="Toggle theme color"
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>

        </div>
      </header>

      {/* Main Workspace Frame container */}
      <main className="flex-1 flex flex-col w-full relative">
        <DocumentReader
          serverIp={serverConfig.ip}
          isValidated={serverConfig.isValidated}
          onConnectServer={handleVerifyServer}
          onDisconnectServer={handleDisconnect}
          isVerifying={isVerifying}
          verifyError={verifyError}
          chunks={chunks}
          currentChunkIndex={currentChunkIndex}
          isPlaying={isPlaying}
          isBuffering={isBuffering}
          isLoading={isLoading}
          setChunks={setChunks}
          setCurrentChunkIndex={setCurrentChunkIndex}
          togglePlayPause={togglePlayPause}
          resetEngine={resetEngine}
        />
      </main>

      {/* Persistent floating bottom control controls */}
      {chunks.length > 0 && serverConfig.isValidated && (
        <MinimalControlBar
          isPlaying={isPlaying}
          isBuffering={isBuffering}
          isLoading={isLoading}
          options={options}
          currentChunkIndex={currentChunkIndex}
          totalChunks={chunks.length}
          onTogglePlayPause={togglePlayPause}
          onUpdateOptions={updateOptions}
          onReset={() => setCurrentChunkIndex(0)}
        />
      )}

      {/* Server Configuration Modal - Blocking Backdrop */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          
          <div className="absolute inset-0 bg-zinc-950/60 backdrop-blur-md" />

          {/* Modal core paper element */}
          <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 p-6 shadow-2xl border border-zinc-200/80 dark:border-zinc-800/85 animate-fade-in text-neutral-900 dark:text-zinc-100">
            
            <div className="flex items-center space-x-3 mb-4 border-b border-zinc-150 dark:border-zinc-800/50 pb-3">
              <div className="w-9 h-9 rounded-xl bg-amber-400/10 text-amber-500 flex items-center justify-center">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-mono text-sm uppercase tracking-wider font-bold">Node Settings</h3>
                <p className="text-[10px] text-zinc-400 leading-none mt-0.5">Please provide remote synthesis address</p>
              </div>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed font-sans">
              To parser and stream speech gaplessly, this app connects to a neural TTS API. Please enter your backend server address below.
            </p>

            <div className="space-y-4">
              
              <div>
                <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-zinc-500 dark:text-zinc-400 block mb-1.5">
                  Server IP & Port
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-xs text-zinc-500 font-mono">http://</span>
                  <input
                    id="input-server-ip"
                    type="text"
                    spellCheck={false}
                    disabled={isVerifying}
                    placeholder="192.168.1.5:8000"
                    value={modalInput}
                    onChange={(e) => setModalInput(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-xl py-2.5 pl-16 pr-4 text-xs font-mono font-bold focus:outline-none focus:border-amber-400 transition-colors"
                  />
                </div>
              </div>

              {/* Offline backup notification */}
              <div className="p-3 rounded-xl bg-amber-400/5 border border-amber-400/10 text-[10px] text-amber-500/95 flex items-start gap-2.5 leading-relaxed font-mono">
                <Terminal className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  No local server? Enter <b className="text-amber-400 underline">mock</b> to run locally with pleasant offline audio wave synthesizers!
                </div>
              </div>

              {/* Error messages */}
              {verifyError && (
                <div className="p-3 bg-rose-500/5 border border-rose-500/10 text-[11px] text-rose-500 rounded-xl leading-relaxed font-mono flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{verifyError}</span>
                </div>
              )}

              {/* Core validation triggers */}
              <div className="flex gap-2.5 pt-2">
                
                {serverConfig.isValidated && (
                  <button
                    id="btn-modal-cancel"
                    type="button"
                    onClick={() => setShowConfigModal(false)}
                    className="flex-1 bg-zinc-100 hover:bg-neutral-200 dark:bg-zinc-850 dark:hover:bg-zinc-800 border border-neutral-200/50 dark:border-zinc-750 py-2.5 rounded-xl text-xs font-semibold hover:scale-[1.01] active:scale-95 transition-all text-center"
                  >
                    Cancel
                  </button>
                )}

                <button
                  id="btn-modal-submit"
                  type="button"
                  disabled={isVerifying}
                  onClick={() => handleVerifyServer(modalInput)}
                  className="flex-2 bg-amber-400 hover:bg-amber-300 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 py-2.5 rounded-xl text-xs font-bold hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg"
                >
                  {isVerifying ? (
                    <>
                      <span className="w-4.5 h-4.5 border-t-2 border-l-2 border-zinc-950 animate-spin rounded-full inline-block" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <span>Test, Save & Connect</span>
                  )}
                </button>

              </div>

              {/* Disconnect helper option */}
              {serverConfig.isValidated && (
                <div className="text-center pt-2">
                  <button
                    id="btn-modal-disconnect"
                    type="button"
                    onClick={handleDisconnect}
                    className="text-[10px] font-mono text-rose-500 hover:underline cursor-pointer"
                  >
                    Disconnect Active Node Connection
                  </button>
                </div>
              )}

            </div>

          </div>

        </div>
      )}

    </div>
  );
}
