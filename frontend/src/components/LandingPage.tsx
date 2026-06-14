import React, { useState, useEffect } from 'react';
import { Upload, Terminal, AlertCircle, CheckCircle2, ArrowRight, Wifi, WifiOff, FileText, Cpu, AudioLines, ScanText, Volume2 } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion';

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

/* ────────────────────────────────────────────
   Cursor-following spotlight on a dot grid
   ──────────────────────────────────────────── */
function SpotlightGrid() {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 60, damping: 20 });
  const springY = useSpring(mouseY, { stiffness: 60, damping: 20 });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle, #c4b5fd 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full"
        style={{
          x: useTransform(springX, (v) => v - 250),
          y: useTransform(springY, (v) => v - 250),
          background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)',
        }}
      />
    </div>
  );
}

/* ────────────────────────────────────────────
   Full-screen Document Loading Overlay
   with progress bar and cycling messages
   ──────────────────────────────────────────── */
function DocumentLoader({ parseProgress }: { parseProgress: string }) {
  const [elapsed, setElapsed] = useState(0);

  // Parse "page X / Y" from parseProgress to derive a real percentage
  const pageMatch = parseProgress.match(/page\s+(\d+)\s*\/\s*(\d+)/i);
  const currentPage = pageMatch ? parseInt(pageMatch[1], 10) : 0;
  const totalPages = pageMatch ? parseInt(pageMatch[2], 10) : 0;

  // Text parsing = 0-80%, audio caching = 80-100%
  const isAudioPhase = parseProgress.includes('audio') || parseProgress.includes('Audio');
  const isFinishing = parseProgress.includes('launching') || parseProgress.includes('Finalizing');
  const textProgress = totalPages > 0 ? Math.round((currentPage / totalPages) * 80) : 0;
  const progressPercent = isFinishing ? 100 : isAudioPhase ? 90 : textProgress;

  // Cycle elapsed time for the status messages
  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Status pipeline — messages cycle as work progresses
  const statusSteps = [
    { icon: <FileText className="w-4 h-4" />, label: 'Reading document binary', done: textProgress > 0 || isAudioPhase },
    { icon: <ScanText className="w-4 h-4" />, label: 'Extracting text layer', done: textProgress > 20 || isAudioPhase },
    { icon: <Cpu className="w-4 h-4" />, label: 'Building character maps', done: textProgress > 60 || isAudioPhase },
    { icon: <AudioLines className="w-4 h-4" />, label: 'Preparing speech chunks', done: textProgress > 90 || isAudioPhase },
    { icon: <Volume2 className="w-4 h-4" />, label: 'Pre-caching audio buffers', done: isFinishing },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#09090b]/95 backdrop-blur-xl"
    >
      <div className="w-full max-w-md px-8 flex flex-col items-center">

        {/* Animated spinner ring */}
        <div className="relative w-20 h-20 mb-8">
          <motion.div
            className="absolute inset-0 rounded-full border-[3px] border-slate-800"
          />
          <motion.div
            className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-violet-500 border-r-violet-500/30"
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-black font-mono text-violet-400">
              {progressPercent > 0 ? `${progressPercent}%` : '...'}
            </span>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-black text-white tracking-tight mb-2">
          Preparing your document
        </h2>
        <p className="text-xs text-slate-500 font-mono mb-8 text-center">
          {parseProgress || 'Initializing parser...'}
        </p>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mb-8">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500"
            initial={{ width: '2%' }}
            animate={{ width: progressPercent > 0 ? `${progressPercent}%` : '5%' }}
            transition={{ type: 'spring', stiffness: 50, damping: 15 }}
          />
        </div>

        {/* Status steps list */}
        <div className="w-full space-y-3">
          {statusSteps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.15, duration: 0.3 }}
              className="flex items-center gap-3"
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-500 ${
                step.done
                  ? 'bg-violet-500/10 text-violet-400'
                  : 'bg-slate-800/50 text-slate-600'
              }`}>
                {step.done ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : step.icon}
              </div>
              <span className={`text-xs font-mono transition-colors duration-500 ${
                step.done ? 'text-slate-300' : 'text-slate-600'
              }`}>
                {step.label}
              </span>
              {step.done && (
                <motion.span
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-[9px] font-mono text-emerald-500/60 ml-auto"
                >
                  done
                </motion.span>
              )}
            </motion.div>
          ))}
        </div>

        {/* Elapsed time */}
        <p className="text-[10px] font-mono text-slate-700 mt-8">
          {elapsed}s elapsed
          {totalPages > 0 && <span className="text-slate-600"> · {totalPages} pages detected</span>}
        </p>
      </div>
    </motion.div>
  );
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
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        onPdfSelected(file);
      } else {
        setLocalError('Only PDF files are supported.');
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) onPdfSelected(e.target.files[0]);
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    if (!ipInput.trim()) { setLocalError('Enter a valid address.'); return; }
    await onConnectServer(ipInput);
  };

  return (
    <div className="flex-1 w-full flex flex-col min-h-0 overflow-y-auto scrollbar-none relative">
      <SpotlightGrid />

      {/* ═══════════════════════════════════
          FULL-SCREEN DOCUMENT LOADER
          Overlays when isParsing is true
          ═══════════════════════════════════ */}
      <AnimatePresence>
        {isParsing && <DocumentLoader parseProgress={parseProgress} />}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════
          HERO — Massive typographic statement
          ═══════════════════════════════════════════ */}
      <section className="relative flex flex-col items-center justify-center px-6 pt-20 pb-16 md:pt-28 md:pb-24">

        {/* Eyebrow badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-violet-500/15 bg-violet-500/5 backdrop-blur-sm mb-10"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-400" />
          </span>
          <span className="text-[11px] uppercase font-mono tracking-[0.2em] font-bold text-violet-300/90">
            PDF → Speech Engine
          </span>
        </motion.div>

        {/* Hero text */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-center leading-[0.88] tracking-[-0.04em] select-none relative z-10 mb-8"
        >
          <span
            className="block font-black text-white"
            style={{ fontSize: 'clamp(3.5rem, 13vw, 11rem)' }}
          >
            Read with
          </span>
          <span
            className="block font-black bg-gradient-to-r from-violet-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent"
            style={{ fontSize: 'clamp(3.5rem, 13vw, 11rem)' }}
          >
            your ears.
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-base md:text-lg text-slate-400 text-center max-w-md leading-relaxed"
        >
          Upload any PDF. Connect a speech synthesis server.
          Every word highlights as it's spoken aloud.
        </motion.p>
      </section>


      {/* ═══════════════════════════════════════════
          ACTION GRID — Two panels, clean and direct
          ═══════════════════════════════════════════ */}
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-6 md:px-10 max-w-4xl mx-auto w-full mb-24 relative z-10"
      >

        {/* ─── Panel: Connect Engine ─── */}
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm p-6 md:p-7 flex flex-col">

          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-lg bg-slate-800/80 flex items-center justify-center border border-slate-700/50">
              {isValidated
                ? <Wifi className="w-4 h-4 text-emerald-400" />
                : <WifiOff className="w-4 h-4 text-slate-500" />
              }
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Speech Engine</h2>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                {isValidated ? 'Connected' : 'Not connected'}
              </p>
            </div>
          </div>

          <form onSubmit={handleConnect} className="space-y-3 flex-1 flex flex-col">
            <div>
              <label htmlFor="landing-server-ip" className="text-[10px] uppercase font-mono tracking-[0.15em] font-bold text-slate-500 block mb-2">
                Server Address
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-[11px] text-slate-600 font-mono">http://</span>
                <input
                  id="landing-server-ip"
                  type="text"
                  spellCheck={false}
                  disabled={isVerifying || isParsing}
                  placeholder="192.168.1.5:8000"
                  value={ipInput}
                  onChange={(e) => setIpInput(e.target.value)}
                  className="w-full bg-slate-950/60 border border-slate-700/50 rounded-xl py-2.5 pl-[4rem] pr-4 text-xs font-mono font-bold text-white placeholder-slate-700 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-all"
                />
              </div>
            </div>

            <AnimatePresence mode="wait">
              {isValidated ? (
                <motion.div
                  key="ok"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/15 text-[11px] text-emerald-400 flex items-center gap-2 font-mono overflow-hidden"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{serverIp === 'mock' ? 'Mock mode (offline)' : `http://${serverIp}`}</span>
                </motion.div>
              ) : (
                <motion.div
                  key="hint"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/30 text-[10px] text-slate-500 flex items-center gap-2 font-mono overflow-hidden"
                >
                  <Terminal className="w-3.5 h-3.5 shrink-0 opacity-60" />
                  <span>Type <strong className="text-violet-400/80">mock</strong> for offline demo</span>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {(verifyError || localError) && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="p-3 bg-rose-500/5 border border-rose-500/15 text-[11px] text-rose-400 rounded-lg font-mono flex items-center gap-2"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{verifyError || localError}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex gap-2 mt-auto pt-1">
              {isValidated && (
                <button
                  id="btn-disconnect-landing"
                  type="button"
                  onClick={onDisconnectServer}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800/60 border border-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
                >
                  Disconnect
                </button>
              )}
              <motion.button
                id="btn-connect-landing"
                type="submit"
                disabled={isVerifying || isParsing}
                whileTap={{ scale: 0.97 }}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  isVerifying
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-violet-500 hover:bg-violet-400 text-white shadow-lg shadow-violet-500/20'
                }`}
              >
                {isVerifying ? (
                  <>
                    <span className="w-3.5 h-3.5 border-t-2 border-l-2 border-white animate-spin rounded-full" />
                    Verifying...
                  </>
                ) : isValidated ? 'Reconnect' : 'Connect'}
              </motion.button>
            </div>
          </form>
        </div>

        {/* ─── Panel: Upload PDF ─── */}
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm p-6 md:p-7 flex flex-col">

          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-lg bg-slate-800/80 flex items-center justify-center border border-slate-700/50">
              <Upload className="w-4 h-4 text-slate-500" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Open Document</h2>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">PDF up to 100 MB</p>
            </div>
          </div>

          {/* Dropzone */}
          <motion.div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            animate={{
              scale: dragActive ? 1.015 : 1,
              borderColor: dragActive ? 'rgba(139,92,246,0.5)' : 'rgba(51,65,85,0.5)',
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="flex-1 relative cursor-pointer flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 text-center min-h-[180px] group"
          >
            <input
              id="landing-file-upload"
              type="file"
              accept=".pdf"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              onChange={handleFileInput}
              disabled={isParsing}
            />

            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center mb-4 group-hover:border-violet-500/30 group-hover:text-violet-400 text-slate-600 transition-colors">
                <Upload className="w-5 h-5" />
              </div>
              <p className="text-sm font-bold text-slate-300 mb-1">Drop a PDF here</p>
              <p className="text-[10px] text-slate-600 font-mono">or click to browse</p>
              <div className="mt-4 px-4 py-2 rounded-lg text-[11px] bg-slate-800/40 border border-slate-700/40 text-slate-400 hover:text-violet-300 hover:border-violet-500/20 transition-all flex items-center gap-1.5 font-bold relative z-10">
                Choose File <ArrowRight className="w-3 h-3" />
              </div>
            </div>
          </motion.div>
        </div>

      </motion.section>


      {/* ═══════════════════════════════════════════
          PIPELINE — Three steps, honestly sequential
          ═══════════════════════════════════════════ */}
      <motion.section
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.5 }}
        className="px-6 md:px-10 max-w-4xl mx-auto w-full pb-16 relative z-10"
      >
        <div className="border-t border-slate-800/60 pt-10 mb-8">
          <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-600 text-center">
            How it works
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              step: '01',
              title: 'Parse',
              desc: 'PDF.js extracts every text item with character-level coordinates. Each page becomes a structured map.',
            },
            {
              step: '02',
              title: 'Speak',
              desc: 'Text chunks stream to a neural TTS engine. Audio queues with crossfading eliminate silence between blocks.',
            },
            {
              step: '03',
              title: 'Track',
              desc: 'Characters map back to PDF coordinates live. The spoken phrase highlights as you listen.',
            },
          ].map((item, i) => (
            <motion.div
              key={item.step}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="p-5 rounded-xl border border-slate-800/40 bg-slate-900/20 hover:border-slate-700/60 transition-colors group"
            >
              <span className="text-[10px] font-mono text-violet-400/60 font-bold">{item.step}</span>
              <h3 className="text-xl font-black text-white tracking-tight mt-1 mb-2">
                {item.title}
              </h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {item.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.section>
    </div>
  );
}
