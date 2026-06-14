/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { Upload, FileText, CheckCircle2, AlertCircle, Sparkles, Navigation, ArrowLeft } from 'lucide-react';
import { PageTextMap, TtsChunk, TtsOptions } from '../types';
import PdfPageRenderer from './PdfPageRenderer';
import LandingPage from './LandingPage';

// Config worker source using jsdelivr CDN matching imported version
const pdfjsVersion = pdfjs.version || '6.0.227';
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

interface DocumentReaderProps {
  serverIp: string;
  isValidated: boolean;
  onConnectServer: (ip: string) => Promise<void>;
  onDisconnectServer: () => void;
  isVerifying: boolean;
  verifyError: string;
  chunks: TtsChunk[];
  currentChunkIndex: number;
  isPlaying: boolean;
  isBuffering: boolean;
  isLoading: boolean;
  setChunks: (chunks: TtsChunk[]) => void;
  setCurrentChunkIndex: (index: number) => void;
  togglePlayPause: () => void;
  resetEngine: () => void;
}

// Custom text chunker splitting pages cleanly by sentences/punctuations (max ~200 characters)
function splitTextIntoChunks(text: string, pageIndex: number): Array<{ text: string; startChar: number; endChar: number }> {
  // Match sentences including punctuation marks as boundaries
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+/g) || [text];
  const chunks: Array<{ text: string; startChar: number; endChar: number }> = [];
  
  let currentChunk = '';
  let startIdx = 0;
  let charAccumulator = 0;

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) {
      charAccumulator += sentence.length;
      continue;
    }

    // Accumulate sentence, splitting if we exceed character ceiling limit
    if (currentChunk.length + trimmed.length > 180 && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        startChar: startIdx,
        endChar: startIdx + currentChunk.length,
      });
      currentChunk = '';
    }

    if (currentChunk.length === 0) {
      startIdx = charAccumulator;
    }
    currentChunk += (currentChunk ? ' ' : '') + trimmed;
    charAccumulator += sentence.length;
  }

  // Flush remaining strings
  if (currentChunk.trim()) {
    chunks.push({
      text: currentChunk.trim(),
      startChar: startIdx,
      endChar: startIdx + currentChunk.length,
    });
  }

  return chunks;
}

export default function DocumentReader({
  serverIp,
  isValidated,
  onConnectServer,
  onDisconnectServer,
  isVerifying,
  verifyError,
  chunks,
  currentChunkIndex,
  isPlaying,
  isBuffering,
  isLoading,
  setChunks,
  setCurrentChunkIndex,
  togglePlayPause,
  resetEngine,
}: DocumentReaderProps) {
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [fileName, setFileName] = useState<string>('');
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parseProgress, setParseProgress] = useState<string>('');
  const [errorStatus, setErrorStatus] = useState<string>('');
  const [dragActive, setDragActive] = useState<boolean>(false);
  
  // Page highlighting and scroll sync maps
  const [pageTextMaps, setPageTextMaps] = useState<Map<number, PageTextMap>>(new Map());
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [isDraggingSlider, setIsDraggingSlider] = useState<boolean>(false);
  
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Sync chunks across parent layers
  const activeChunk = chunks[currentChunkIndex] || null;

  // Track page navigation based on current chunk index and avoid bounce-backs when not playing/dragging
  const lastScrolledIndexRef = useRef<number>(-1);
  const lastIsPlayingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!activeChunk) return;

    const indexChanged = currentChunkIndex !== lastScrolledIndexRef.current;
    const playStarted = isPlaying && !lastIsPlayingRef.current;

    lastScrolledIndexRef.current = currentChunkIndex;
    lastIsPlayingRef.current = isPlaying;

    if (isDraggingSlider) return;

    if (indexChanged || playStarted) {
      setActivePageIndex(activeChunk.pageIndex);
      
      // Keep page in center of reading viewport scroll
      const pageElement = document.getElementById(`pdf-page-${activeChunk.pageIndex}`);
      if (pageElement) {
        pageElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeChunk, currentChunkIndex, isPlaying, isDraggingSlider]);

  // Extract page structures directly into linear array of segments
  const handlePdfFile = async (file: File) => {
    try {
      setIsParsing(true);
      setErrorStatus('');
      setFileName(file.name);
      setParseProgress('Reading document binary...');

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      
      setPdfDocument(pdf);
      setNumPages(pdf.numPages);
      setPageTextMaps(new Map());

      const totalPages = pdf.numPages;
      const allChunks: TtsChunk[] = [];
      let globalChunkCounter = 0;

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        setParseProgress(`Parsing text items: page ${pageNum} / ${totalPages}`);
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        let pageText = '';
        textContent.items.forEach((item: any) => {
          pageText += (pageText ? ' ' : '') + item.str;
        });

        const singlePageChunks = splitTextIntoChunks(pageText, pageNum - 1);
        singlePageChunks.forEach((item) => {
          allChunks.push({
            id: `p-${pageNum - 1}-c-${globalChunkCounter++}`,
            text: item.text,
            pageIndex: pageNum - 1,
            startChar: item.startChar,
            endChar: item.endChar,
          });
        });
      }

      if (allChunks.length === 0) {
        throw new Error('This document contains no readable plain text segments.');
      }

      setChunks(allChunks);
      setIsParsing(false);
      setParseProgress('');
    } catch (err: any) {
      console.error('Core PDF extraction failed:', err);
      setErrorStatus(err.message || 'An error occurred while loading this PDF. Please verify its source.');
      setIsParsing(false);
    }
  };

  // Drag and Drop handles
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
        handlePdfFile(file);
      } else {
        setErrorStatus('Unsupported file. Please upload a standard document with .pdf extension.');
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handlePdfFile(e.target.files[0]);
    }
  };

  const onPageTextExtracted = useCallback((pageIndex: number, textMap: PageTextMap) => {
    setPageTextMaps((prev) => {
      const copy = new Map(prev);
      copy.set(pageIndex, textMap);
      return copy;
    });
  }, []);

  // Exact coordinates character range match to jump instantly to spoken phrase context
  const handleTextItemClick = useCallback((pageIndex: number, charIndex: number) => {
    const clickedChunkIndex = chunks.findIndex(
      (c) => c.pageIndex === pageIndex && charIndex >= c.startChar && charIndex <= c.endChar
    );

    if (clickedChunkIndex !== -1) {
      setCurrentChunkIndex(clickedChunkIndex);
    } else {
      // Find backup closest index on matching page
      const closestIndex = chunks.findIndex((c) => c.pageIndex === pageIndex);
      if (closestIndex !== -1) {
        setCurrentChunkIndex(closestIndex);
      }
    }
  }, [chunks, setCurrentChunkIndex]);

  // Sync scroll indicator on manual reader drags
  useEffect(() => {
    if (numPages === 0 || isDraggingSlider) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          // Identify highly visible elements center screen
          const sorted = visible.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
          const index = parseInt(sorted[0].target.getAttribute('data-page-index') || '0', 10);
          setActivePageIndex(index);
        }
      },
      {
        root: null,
        rootMargin: '-25% 0px -45% 0px', // Center viewport focus
        threshold: [0.1, 0.4, 0.8],
      }
    );

    for (let i = 0; i < numPages; i++) {
      const el = document.getElementById(`pdf-page-${i}`);
      if (el) observer.observe(el);
    }

    return () => {
      observer.disconnect();
    };
  }, [numPages, isDraggingSlider]);

  // Pointer drag events for Custom touch-friendly scroller interaction
  const updateScrollPosition = (clientY: number) => {
    const track = trackRef.current;
    if (!track || numPages === 0) return;

    const rect = track.getBoundingClientRect();
    const relativeY = clientY - rect.top;
    const percentage = Math.max(0, Math.min(1, relativeY / rect.height));

    const targetPage = Math.round(percentage * (numPages - 1));
    setActivePageIndex(targetPage);

    // Instant scrolling without delay
    const el = document.getElementById(`pdf-page-${targetPage}`);
    if (el) {
      el.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDraggingSlider(true);
    updateScrollPosition(e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSlider) return;
    updateScrollPosition(e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDraggingSlider(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div className="flex-1 w-full flex flex-col relative">
      
      {numPages === 0 ? (
        <LandingPage
          serverIp={serverIp}
          isValidated={isValidated}
          onConnectServer={onConnectServer}
          onDisconnectServer={onDisconnectServer}
          isVerifying={isVerifying}
          verifyError={verifyError}
          onPdfSelected={handlePdfFile}
          isParsing={isParsing}
          parseProgress={parseProgress}
        />
      ) : (
        // Loaded reader workspace dashboard
        <div className="flex-1 w-full flex relative px-4 pr-12 pb-32 md:px-8 md:pr-16 max-w-5xl mx-auto animate-fade-in">
          
          {/* Main vertical document rendering viewport */}
          <div ref={scrollContainerRef} className="flex-1 w-full py-8 pr-2">
            
            {/* Header metadata label bar */}
            <div className="mb-8 flex items-center justify-between border-b border-zinc-900 pb-4">
              <div className="flex items-center shrink-1 overflow-hidden">
                <button
                  id="btn-back-to-library"
                  onClick={() => {
                    setPdfDocument(null);
                    setNumPages(0);
                    setFileName('');
                    resetEngine();
                  }}
                  className="flex items-center gap-2 text-xs font-mono font-semibold text-zinc-400 hover:text-white transition-all py-1.5 px-3 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 shadow-sm cursor-pointer mr-4 select-none"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Library
                </button>
                <div className="flex items-center space-x-2 truncate">
                  <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="text-xs font-bold text-zinc-200 truncate" title={fileName}>
                    {fileName}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-[10px] font-mono uppercase bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-zinc-400 tracking-wide select-none">
                  {numPages} {numPages === 1 ? 'Page' : 'Pages'}
                </span>
              </div>
            </div>

            {/* Structured Page loop elements */}
            <div className="space-y-8">
              {Array.from({ length: numPages }).map((_, index) => (
                <PdfPageRenderer
                  key={index}
                  pdfDocument={pdfDocument}
                  pageIndex={index}
                  activeChunk={activeChunk}
                  onTextItemClick={handleTextItemClick}
                  onPageTextExtracted={onPageTextExtracted}
                  pageTextMap={pageTextMaps.get(index) || null}
                />
              ))}
            </div>
          </div>

          {/* Elegant Sticky Navigation Sidebar */}
          <div className="w-16 shrink-0 relative hidden sm:block">
            <div className="sticky top-32 h-[calc(100vh-16rem)] flex items-center justify-center z-30 select-none">
              
              {/* Invisible Hit-Area Track for Pointer Events */}
              <div
                ref={trackRef}
                className="w-16 h-full flex items-center justify-center cursor-pointer relative group"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                style={{ touchAction: 'none' }}
                title="Fast Document Navigator"
              >
                {/* Visual Glass Track */}
                <div className="w-1.5 h-full rounded-full bg-zinc-900/50 backdrop-blur-sm border border-zinc-800/50 relative transition-all duration-300 group-hover:bg-zinc-800/60 group-hover:w-2">
                  
                  {/* Glowing Thumb Pill */}
                  <div
                    className="absolute w-3.5 h-10 -left-[4px] rounded-full bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.3)] transition-all duration-200 cursor-grab active:cursor-grabbing flex items-center justify-center"
                    style={{
                      top: `${(activePageIndex / (Math.max(1, numPages - 1))) * 100}%`,
                      transform: 'translateY(-50%)',
                    }}
                  >
                    {/* Inner texture lines */}
                    <div className="flex flex-col gap-[2px] opacity-60">
                      <div className="w-1.5 h-[1px] bg-zinc-950 rounded-full" />
                      <div className="w-1.5 h-[1px] bg-zinc-950 rounded-full" />
                      <div className="w-1.5 h-[1px] bg-zinc-950 rounded-full" />
                    </div>
                  </div>

                  {/* Elegant Floating Page Indicator (Visible on Hover/Drag) */}
                  <div
                    className={`absolute right-6 -translate-y-1/2 flex items-center transition-all duration-300 pointer-events-none ${
                      isDraggingSlider ? 'opacity-100 translate-x-0' : 'opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0'
                    }`}
                    style={{
                      top: `${(activePageIndex / (Math.max(1, numPages - 1))) * 100}%`,
                    }}
                  >
                    <div className="bg-zinc-950/90 backdrop-blur-md border border-zinc-800 shadow-xl rounded-lg px-3 py-1.5 flex items-baseline gap-1.5">
                      <span className="text-amber-400 font-mono font-bold text-sm">
                        {activePageIndex + 1}
                      </span>
                      <span className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest">
                        / {numPages}
                      </span>
                    </div>
                  </div>

                </div>
              </div>

            </div>
          </div>

        </div>
      )}

    </div>
  );
}
