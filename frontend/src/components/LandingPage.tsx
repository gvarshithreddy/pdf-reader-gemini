import React, { useState } from 'react';
import { Upload, Server, Sparkles, Terminal, AlertCircle, CheckCircle2, Volume2, Eye, Cpu, BookOpen, ArrowRight } from 'lucide-react';

interface LandingPageProps {
  serverIp: string;
  isValidated: boolean;
  onConnectServer: (ip: string) => Promise<void>;
  onDisconnectServer: () => void;
  isVerifying: boolean;
  verifyError: string;
  onPdfSelected: (file: File) => void;
  isParsing: boolean;
  parseProgress: string;
}

export default function LandingPage({
  serverIp,
  isValidated,
  onConnectServer,
  onDisconnectServer,
  isVerifying,
  verifyError,
  onPdfSelected,
  isParsing,
  parseProgress,
}: LandingPageProps) {
  const [ipInput, setIpInput] = useState<string>(serverIp || '192.168.1.5:8000');
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string>('');

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        onPdfSelected(file);
      } else {
        setLocalError('Unsupported file type. Please drag a valid PDF document.');
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onPdfSelected(e.target.files[0]);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    if (!ipInput.trim()) {
      setLocalError('Please enter a valid IP address and port.');
      return;
    }
    await onConnectServer(ipInput);
  };

  return (
    <div className="flex-1 w-full flex flex-col justify-between py-12 px-4 md:px-8 max-w-6xl mx-auto animate-fade-in">
      
      {/* Hero Header Area */}
      <header className="text-center max-w-3xl mx-auto mb-12 mt-6">
        
        {/* Animated Sonic Waveform Pill */}
        <div className="inline-flex items-center gap-3 px-3 py-1.5 rounded-full bg-amber-400/5 border border-amber-400/15 mb-6">
          <div className="flex items-center gap-0.5 h-3.5 w-6 overflow-hidden">
            <span className="w-0.5 h-full bg-amber-400/40 rounded-full animate-pulse" style={{ animationDelay: '0.1s' }} />
            <span className="w-0.5 h-full bg-amber-400 rounded-full wave-bar" style={{ animationDuration: '0.8s', animationDelay: '0.2s' }} />
            <span className="w-0.5 h-full bg-amber-500 rounded-full wave-bar" style={{ animationDuration: '1.2s', animationDelay: '0s' }} />
            <span className="w-0.5 h-full bg-amber-400 rounded-full wave-bar" style={{ animationDuration: '0.9s', animationDelay: '0.4s' }} />
            <span className="w-0.5 h-full bg-amber-400/40 rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
          </div>
          <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-amber-400/90">
            Neural Auditory Interface
          </span>
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white leading-none font-display">
          Hear your books. <br/>
          <span className="bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 bg-clip-text text-transparent">
            Read with your ears.
          </span>
        </h1>
        
        <p className="mt-4 text-sm md:text-base text-zinc-400 font-sans max-w-xl mx-auto leading-relaxed">
          Experience next-generation auditory reading. Neural PDF Reader parses your documents and streams high-fidelity synthetic voices with precise word-level synchronization.
        </p>

      </header>

      {/* Main Portals Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch mb-16">
        
        {/* Portal 1: Server Config (LHS) */}
        <div className="lg:col-span-5 flex flex-col justify-between p-6 rounded-2xl glass-panel pulse-glow relative overflow-hidden">
          
          {/* Subtle grid lines background overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />

          <div className="relative z-10 space-y-5">
            
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-400/10 text-amber-500 flex items-center justify-center border border-amber-400/20">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-mono text-xs uppercase tracking-wider font-bold text-white">Speech Synthesis Engine</h3>
                <p className="text-[10px] text-zinc-400 leading-none mt-1">Configure your speech synthesis node</p>
              </div>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed font-sans">
              Connect to a local or remote neural speech synthesis node. Don't have a server configured? Enter <code className="text-amber-400 px-1 py-0.5 rounded bg-zinc-900 border border-zinc-800 font-mono">mock</code> to experience elegant, offline ambient speech synthesizers.
            </p>

            <form onSubmit={handleConnect} className="space-y-4">
              <div>
                <label htmlFor="landing-server-ip" className="text-[10px] uppercase font-mono tracking-wider font-bold text-zinc-400 block mb-2">
                  Node IP & Port
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-xs text-zinc-500 font-mono">http://</span>
                  <input
                    id="landing-server-ip"
                    type="text"
                    spellCheck={false}
                    disabled={isVerifying || isParsing}
                    placeholder="192.168.1.5:8000"
                    value={ipInput}
                    onChange={(e) => setIpInput(e.target.value)}
                    className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl py-2.5 pl-16 pr-4 text-xs font-mono font-bold text-white placeholder-zinc-700 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 transition-all"
                  />
                </div>
              </div>

              {/* Status Indicator inside the box */}
              {isValidated ? (
                <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/15 text-[11px] text-emerald-400 flex items-start gap-2.5 font-mono">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                  <div>
                    <span className="font-bold">Engine Connected:</span> <br/>
                    <span className="text-zinc-400 text-[10px]">
                      {serverIp === 'mock' ? 'MOCK_DEMO (Offline Ambient Waves)' : `http://${serverIp}`}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/10 text-[10px] text-amber-500/90 flex items-start gap-2.5 font-mono leading-relaxed">
                  <Terminal className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    Verify connection to enable synthesized playback features.
                  </div>
                </div>
              )}

              {/* Errors */}
              {(verifyError || localError) && (
                <div className="p-3 bg-rose-500/5 border border-rose-500/15 text-[11px] text-rose-400 rounded-xl leading-relaxed font-mono flex items-start gap-2">
                  <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5 text-rose-400" />
                  <span>{verifyError || localError}</span>
                </div>
              )}

              <div className="flex gap-2">
                {isValidated && (
                  <button
                    id="btn-disconnect-landing"
                    type="button"
                    onClick={onDisconnectServer}
                    className="flex-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 py-2.5 rounded-xl text-xs font-semibold hover:text-white transition-all cursor-pointer"
                  >
                    Disconnect
                  </button>
                )}
                <button
                  id="btn-connect-landing"
                  type="submit"
                  disabled={isVerifying || isParsing}
                  className={`flex-2 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md ${
                    isVerifying
                      ? 'bg-zinc-800 text-zinc-500'
                      : 'bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold active:scale-[0.98]'
                  } ${isValidated ? 'w-full' : 'flex-1'}`}
                >
                  {isVerifying ? (
                    <>
                      <span className="w-3.5 h-3.5 border-t-2 border-l-2 border-zinc-950 animate-spin rounded-full inline-block" />
                      <span>Verifying Node...</span>
                    </>
                  ) : isValidated ? (
                    <span>Test Connection Again</span>
                  ) : (
                    <span>Connect & Validate Node</span>
                  )}
                </button>
              </div>

            </form>
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-900/60 text-[10px] font-mono text-zinc-500 flex items-center justify-between">
            <span>Core Protocol: REST/PCM</span>
            <span>API v1.0.0</span>
          </div>

        </div>

        {/* Portal 2: PDF Dropzone (RHS) */}
        <div className="lg:col-span-7 flex flex-col justify-between p-6 rounded-2xl glass-panel relative overflow-hidden">
          
          <div className="relative z-10 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-400/10 text-amber-500 flex items-center justify-center border border-amber-400/20">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-mono text-xs uppercase tracking-wider font-bold text-white">Document Library</h3>
                <p className="text-[10px] text-zinc-400 leading-none mt-1">Upload a document to begin parsing</p>
              </div>
            </div>

            {/* Dropzone Container */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`cursor-pointer group flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 min-h-[220px] relative overflow-hidden bg-zinc-950/20 ${
                dragActive
                  ? 'border-amber-400 bg-amber-400/5'
                  : 'border-zinc-800 hover:border-amber-400/40'
              }`}
            >
              <input
                id="landing-file-upload"
                type="file"
                accept=".pdf"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={handleFileInput}
                disabled={isParsing}
              />

              {isParsing ? (
                <div className="flex flex-col items-center space-y-4">
                  <div className="relative w-12 h-12 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-4 border-amber-400/20 border-t-amber-500 animate-spin" />
                    <Upload className="w-5 h-5 text-amber-500 animate-bounce" />
                  </div>
                  <div className="flex flex-col space-y-1">
                    <span className="text-xs font-bold text-white">Extracting Plain Text</span>
                    <p className="text-[10px] font-mono text-zinc-500">
                      {parseProgress || 'Processing PDF structure...'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800 text-zinc-500 mb-4 group-hover:scale-105 group-hover:border-amber-400/30 group-hover:text-amber-400 transition-all duration-300">
                    <Upload className="w-6 h-6" />
                  </div>
                  <h4 className="text-xs font-bold text-zinc-300">
                    Drop your PDF here, or click to browse
                  </h4>
                  <p className="text-[10px] text-zinc-500 font-mono mt-1">
                    Supports text-based standard PDF files
                  </p>
                  <div className="mt-4 px-3.5 py-1.5 rounded-lg text-xs bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all flex items-center gap-2 font-semibold shadow-sm">
                    Select File <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              )}
            </div>

            {/* Quick-start alert for user validation */}
            {!isValidated && (
              <div className="p-3 bg-amber-400/5 border border-amber-400/10 rounded-xl flex items-start gap-2.5 text-[10px] font-mono text-amber-500/90">
                <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold uppercase tracking-wider">Demo Sandbox:</span> You can drag a PDF first and reader pages will load. However, to hear audio playback, connect to a Node or select the offline "mock" mode on the left.
                </div>
              </div>
            )}

          </div>

          <div className="mt-6 pt-4 border-t border-zinc-900/60 text-[10px] font-mono text-zinc-500 flex items-center justify-between">
            <span>Parser Engine: PDF.js</span>
            <span>Max Size: 100MB</span>
          </div>

        </div>

      </section>

      {/* Capability/Feature Matrix Section */}
      <footer className="border-t border-zinc-900/80 pt-10">
        
        <h4 className="text-center text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-8">
          Auditory System Capabilities
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <div className="p-5 rounded-xl glass-card glass-card-hover group">
            <div className="w-8 h-8 rounded-lg bg-amber-400/5 text-amber-400 flex items-center justify-center border border-amber-400/10 mb-4 group-hover:bg-amber-400/10 group-hover:text-amber-300 transition-colors">
              <Volume2 className="w-4 h-4" />
            </div>
            <h5 className="font-display text-xs font-bold text-white">Gapless WebAudio Queue</h5>
            <p className="mt-2 text-xs text-zinc-400 leading-relaxed font-sans">
              Combines PCM stream prefetching with tight audio schedule overlap crossfading, preventing latency gaps between synthesized blocks.
            </p>
          </div>

          <div className="p-5 rounded-xl glass-card glass-card-hover group">
            <div className="w-8 h-8 rounded-lg bg-amber-400/5 text-amber-400 flex items-center justify-center border border-amber-400/10 mb-4 group-hover:bg-amber-400/10 group-hover:text-amber-300 transition-colors">
              <Eye className="w-4 h-4" />
            </div>
            <h5 className="font-display text-xs font-bold text-white">Visual Alignment Tracking</h5>
            <p className="mt-2 text-xs text-zinc-400 leading-relaxed font-sans">
              Maps characters back to coordinates within the PDF viewport, highlighting spoken syllables in real-time without obstructing legibility.
            </p>
          </div>

          <div className="p-5 rounded-xl glass-card glass-card-hover group">
            <div className="w-8 h-8 rounded-lg bg-amber-400/5 text-amber-400 flex items-center justify-center border border-amber-400/10 mb-4 group-hover:bg-amber-400/10 group-hover:text-amber-300 transition-colors">
              <Cpu className="w-4 h-4" />
            </div>
            <h5 className="font-display text-xs font-bold text-white">Multi-Voice Modulation</h5>
            <p className="mt-2 text-xs text-zinc-400 leading-relaxed font-sans">
              Interact with custom model speech profiles including British and American genders, with adjustable speed ratios and fine-tuned pitch vectors.
            </p>
          </div>

        </div>

      </footer>

    </div>
  );
}
