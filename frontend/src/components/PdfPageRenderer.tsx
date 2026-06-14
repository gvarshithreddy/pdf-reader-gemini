/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { PageTextMap, TtsChunk } from '../types';

interface PdfPageRendererProps {
  key?: number | string;
  pdfDocument: any;
  pageIndex: number;
  activeChunk: TtsChunk | null;
  onTextItemClick: (pageIndex: number, charIndex: number) => void;
  onPageTextExtracted: (pageIndex: number, textMap: PageTextMap) => void;
  pageTextMap: PageTextMap | null;
}

// Config worker source using jsdelivr CDN matching imported version
const pdfjsVersion = pdfjs.version || '6.0.227';
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

export default function PdfPageRenderer({
  pdfDocument,
  pageIndex,
  activeChunk,
  onTextItemClick,
  onPageTextExtracted,
  pageTextMap,
}: PdfPageRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageObj, setPageObj] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number } | null>(null);

  // 1. Listen to container size changes responsively
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const width = entries[0].contentRect.width;
      if (width > 0) {
        setContainerWidth(width);
      }
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  // 2. Fetch page object and extract text metadata once page loads
  useEffect(() => {
    let active = true;
    setLoading(true);

    pdfDocument.getPage(pageIndex + 1).then((page: any) => {
      if (!active) return;
      setPageObj(page);

      // Extract text content for highlighting alignment and mapping
      page.getTextContent().then((textContent: any) => {
        if (!active) return;

        let joinedText = '';
        const items = textContent.items.map((item: any) => {
          const startChar = joinedText.length;
          joinedText += (joinedText ? ' ' : '') + item.str;
          const endChar = joinedText.length;

          return {
            str: item.str,
            startChar,
            endChar,
            transform: item.transform,
            width: item.width,
            height: item.height,
          };
        });

        onPageTextExtracted(pageIndex, {
          pageIndex,
          text: joinedText,
          items,
        });

        setLoading(false);
      });
    }).catch((err: any) => {
      console.error(`Page ${pageIndex + 1} load failed:`, err);
    });

    return () => {
      active = false;
    };
  }, [pdfDocument, pageIndex, onPageTextExtracted]);

  // 3. Render Canvas task when size or page changes
  useEffect(() => {
    if (!pageObj || containerWidth === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Retrieve original layout dimensions
    const originalViewport = pageObj.getViewport({ scale: 1.0 });
    
    // Responsive Scaling: compute scale factor dynamically based on outer layout container width
    const scale = containerWidth / originalViewport.width;
    const viewport = pageObj.getViewport({ scale });
    setViewportSize({ width: viewport.width, height: viewport.height });

    const context = canvas.getContext('2d');
    if (!context) return;

    // Setup high-DPI crisp Canvas scaling
    const dpr = window.devicePixelRatio || 1;
    canvas.width = viewport.width * dpr;
    canvas.height = viewport.height * dpr;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    context.resetTransform();
    context.scale(dpr, dpr);

    // Cancel matching previous PDF generation task if queue is busy
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
    }

    const renderContext = {
      canvasContext: context,
      viewport,
    };

    const renderTask = pageObj.render(renderContext);
    renderTaskRef.current = renderTask;

    renderTask.promise.then(() => {
      renderTaskRef.current = null;
    }).catch((err: any) => {
      if (err && err.name !== 'RenderingCancelledException') {
        console.error('PDF Canvas Render Error:', err);
      }
    });

    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pageObj, containerWidth]);

  // Position transform mapping math: Multiplies element points onto CSS dimensions
  const getViewportDimensions = () => {
    if (!pageObj || !viewportSize || containerWidth === 0) return null;
    const originalViewport = pageObj.getViewport({ scale: 1.0 });
    const scale = containerWidth / originalViewport.width;
    const currentViewport = pageObj.getViewport({ scale });
    return currentViewport;
  };

  const viewport = getViewportDimensions();

  return (
    <div
      ref={containerRef}
      id={`pdf-page-${pageIndex}`}
      data-page-index={pageIndex}
      className="relative mx-auto rounded-xl shadow-2xl border border-zinc-200/80 dark:border-zinc-900 bg-white dark:bg-[#0d0d10] overflow-hidden transition-all duration-300 w-full mb-8 max-w-3xl"
      style={{ minHeight: viewportSize ? `${viewportSize.height}px` : '300px' }}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-50/50 dark:bg-zinc-950/60 z-30 backdrop-blur-xs">
          <div className="flex flex-col items-center space-y-3">
            <div className="w-8 h-8 rounded-full border-2 border-amber-500/20 border-t-amber-500 animate-spin" />
            <span className="text-[10px] text-zinc-500 font-mono tracking-wider">Parsing Page {pageIndex + 1}...</span>
          </div>
        </div>
      )}

      {/* Render Canvas with Native Dark Mode Inversion */}
      <canvas 
        ref={canvasRef} 
        className="block w-full h-auto dark:invert dark:opacity-[0.9] transition-all duration-300" 
      />

      {/* Interactive Word Overlay Layer */}
      {viewport && pageTextMap && (
        <div
          className="absolute inset-0 select-none z-10"
          style={{ width: `${viewport.width}px`, height: `${viewport.height}px` }}
        >
          {pageTextMap.items.map((item, key) => {
            if (!item.str.trim()) return null;

            // Extract PDF matrices transform elements
            const [scaleX_raw, skewX, skewY, scaleY_raw, tx, ty] = item.transform;
            const [a, b, c, d, e, f] = viewport.transform;

            // Convert PDF base origin vectors into top-left client CSS dimensions
            const left = a * tx + c * ty + e;
            const top = b * tx + d * ty + f;

            const scaleX = Math.sqrt(a * a + b * b);
            const scaleY = Math.sqrt(c * c + d * d);

            const widthValue = item.width * scaleX;
            const heightValue = item.height * scaleY;

            // Highlight status checker for speaks
            const isWordSpoken =
              activeChunk &&
              activeChunk.pageIndex === pageIndex &&
              item.endChar > activeChunk.startChar &&
              item.startChar < activeChunk.endChar;

            return (
              <div
                key={key}
                id={`pf-${pageIndex}-w-${key}`}
                className={`absolute cursor-pointer transition-all duration-150 rounded-sm hover:border-b hover:border-amber-400/35 hover:bg-amber-400/5 text-transparent select-text ${
                  isWordSpoken
                    ? 'bg-amber-400/10 border-b-2 border-amber-400 shadow-[0_4px_12px_rgba(245,158,11,0.2)] scale-[1.03] z-20 font-bold transition-all duration-100'
                    : 'bg-transparent'
                }`}
                style={{
                  left: `${left}px`,
                  top: `${top - heightValue}px`, // ty is baseline origin, shift upward by height
                  width: `${widthValue < 4 ? 4 : widthValue}px`,
                  height: `${heightValue < 8 ? 12 : heightValue}px`,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onTextItemClick(pageIndex, item.startChar);
                }}
                title={item.str}
              >
                {item.str}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
