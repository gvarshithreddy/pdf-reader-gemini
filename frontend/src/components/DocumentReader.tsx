/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { Upload, FileText, CheckCircle2, AlertCircle, Sparkles, Navigation } from 'lucide-react';
import { PageTextMap, TtsChunk, TtsOptions } from '../types';
import PdfPageRenderer from './PdfPageRenderer';

// Config worker source using jsdelivr CDN matching imported version
const pdfjsVersion = pdfjs.version || '6.0.227';
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

interface DocumentReaderProps {
  serverIp: string;
  chunks: TtsChunk[];
  currentChunkIndex: number;
  isPlaying: boolean;
  isBuffering: boolean;
  isLoading: boolean;
  setChunks: (chunks: TtsChunk[]) => void;
  setCurrentChunkIndex: (index: number) => void;
  togglePlayPause: () => void;
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
  chunks,
  currentChunkIndex,
  isPlaying,
  isBuffering,
  isLoading,
  setChunks,
  setCurrentChunkIndex,
  togglePlayPause,
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
        // Clean layout dashboard before PDF document upload
        <div className="flex-1 max-w-2xl mx-auto w-full flex flex-col justify-center py-12 px-4">
          
          <div className="text-center mb-8">
            <div className="inline-flex p-3 rounded-2xl bg-amber-400/10 border border-amber-400/20 text-amber-500 mb-4 animate-pulse">
              <Sparkles className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-zinc-100">
              Transform PDFs to Speech
            </h2>
            <p className="text-xs text-neutral-500 dark:text-zinc-400 font-mono mt-1 w-full max-w-sm mx-auto">
              A high performance engine utilizing Web Audio scheduling for gapless playback alignment
            </p>
          </div>

          {/* Interactive Drag/Drop Zone */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`cursor-pointer group flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-300 min-h-[250px] relative overflow-hidden bg-white/40 dark:bg-zinc-900/10 ${
              dragActive
                ? 'border-amber-400 bg-amber-400/5'
                : 'border-zinc-300 dark:border-zinc-800 hover:border-amber-400/60 dark:hover:border-amber-400/40'
            }`}
          >
            <input
              id="file-upload-input"
              type="file"
              accept=".pdf"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={handleFileInputChange}
              disabled={isParsing}
            />

            {isParsing ? (
              <div className="flex flex-col items-center space-y-4">
                <div className="relative w-12 h-12 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-4 border-amber-400/20 border-t-amber-500 animate-spin" />
                  <FileText className="w-5 h-5 text-amber-500" />
                </div>
                <div className="flex flex-col space-y-1">
                  <span className="text-sm font-semibold text-neutral-800 dark:text-zinc-200">
                    Extracting Plain Text
                  </span>
                  <p className="text-[11px] font-mono text-zinc-500">
                    {parseProgress}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="p-4 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 mb-4 group-hover:scale-110 transition-transform duration-300">
                  <Upload className="w-8 h-8" />
                </div>
                <h3 className="text-sm font-semibold text-neutral-800 dark:text-zinc-200">
                  Upload file or drag here
                </h3>
                <span className="text-[11px] text-zinc-400 font-mono mt-1">
                  Supports .pdf files with plain text formats
                </span>
                <span className="inline-block mt-4 text-xs bg-zinc-150 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 rounded-lg text-zinc-700 dark:text-zinc-300 hover:bg-zinc-250 transition-all font-medium">
                  Select Locally
                </span>
              </div>
            )}
          </div>

          {/* Validation Fail Indicator */}
          {errorStatus && (
            <div className="mt-4 flex items-start gap-3 p-3.5 rounded-xl border border-rose-500/10 bg-rose-500/5 text-rose-500 text-xs font-medium font-mono animate-fade-in animate-duration-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorStatus}</span>
            </div>
          )}

          {/* Connection diagnostics notice */}
          <div className="mt-8 p-3 rounded-xl bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-200/40 dark:border-zinc-800/40 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
            <span>Core Node Backend:</span>
            <span className="text-emerald-500 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> {serverIp}
            </span>
          </div>

        </div>
      ) : (
        // Loaded reader workspace dashboard
        <div className="flex-1 w-full flex relative px-2 pr-12 pb-24 md:px-8 md:pr-16 max-w-4xl mx-auto">
          
          {/* Main vertical document rendering viewport */}
          <div ref={scrollContainerRef} className="flex-1 w-full py-6 pr-2">
            
            {/* Header metadata label bar */}
            <div className="mb-6 flex items-center justify-between border-b border-zinc-200/60 dark:border-zinc-800 pb-3">
              <div className="flex items-center space-x-2 shrink-1 overflow-hidden">
                <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="text-xs font-semibold text-neutral-800 dark:text-zinc-200 truncate" title={fileName}>
                  {fileName}
                </span>
              </div>
              <span className="text-[10px] font-mono uppercase bg-neutral-100 dark:bg-zinc-900 border border-neutral-200 dark:border-zinc-800 rounded-lg px-2 py-0.5 text-zinc-500 tracking-wide">
                {numPages} {numPages === 1 ? 'Page' : 'Pages'}
              </span>
            </div>

            {/* Structured Page loop elements */}
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

          {/* Custom touch-friendly Fast-Scroller layout container */}
          <div className="fixed right-2 top-20 bottom-24 w-10 z-30 flex items-center justify-center select-none">
            
            {/* Extended invisible touch rail wrapper giving the 40px large hit target */}
            <div
              ref={trackRef}
              className="w-10 h-full flex items-center justify-center cursor-pointer relative"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              touch-action="none"
              style={{ touchAction: 'none' }}
              title="Fast Vertical Drag Slider"
            >
              {/* Visible scroll bar core */}
              <div className="w-1 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors h-full rounded-full relative">
                
                {/* Grabber thumb indicating active page position */}
                <div
                  className="absolute w-6 h-6 -left-2.5 rounded-full bg-amber-400 border-2 border-zinc-950 dark:border-zinc-100 shadow-lg flex items-center justify-center cursor-grab active:cursor-grabbing hover:scale-110 active:scale-100 transition-transform"
                  style={{
                    top: `${(activePageIndex / (numPages - 1 || 1)) * 100}%`,
                    transform: 'translateY(-50%)',
                  }}
                >
                  <Navigation className="w-2.5 h-2.5 text-zinc-950 rotate-90" />
                </div>

                {/* Floating Page X active bubble visualizer popup overlay */}
                {isDraggingSlider && (
                  <div
                    className="absolute right-8 p-2 rounded-xl backdrop-blur-md bg-zinc-950/90 text-white font-mono text-center shadow-xl border border-zinc-800 text-xs min-w-[70px] -translate-y-1/2 pointer-events-none animate-fade-in"
                    style={{
                      top: `${(activePageIndex / (numPages - 1 || 1)) * 100}%`,
                    }}
                  >
                    <div className="text-[8px] uppercase text-zinc-400 tracking-wider">Viewing</div>
                    <span className="font-bold text-amber-400 text-sm">{activePageIndex + 1}</span> / {numPages}
                  </div>
                )}

              </div>
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
