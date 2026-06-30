'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Download, ExternalLink, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut, RotateCcw, AlertCircle, Play, Pause,
  Volume2, VolumeX, Maximize2
} from 'lucide-react';

interface Message {
  messageId: string;
  senderId: string;
  text: string;
  type: 'text' | 'image' | 'video' | 'file';
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  fileId?: string;
  uploadedAt?: number;
  expiresAt?: number;
  timestamp: number;
  status: 'sent' | 'delivered' | 'read' | 'uploading' | 'sending' | 'failed';
  progress?: number;
}

interface MediaViewerProps {
  mediaId: string;
  messages: Message[];
  onClose: () => void;
  onNavigate: (messageId: string) => void;
}

export default function MediaViewer({
  mediaId,
  messages,
  onClose,
  onNavigate
}: MediaViewerProps) {
  // Find current active message
  const activeMessage = messages.find(m => m.messageId === mediaId);
  const mediaMessages = messages.filter(m => m.type !== 'text');
  const currentIndex = mediaMessages.findIndex(m => m.messageId === mediaId);

  // States
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [videoSpeed, setVideoSpeed] = useState(1);
  const [downloading, setDownloading] = useState(false);

  // Touch & Mouse Refs
  const dragStart = useRef({ x: 0, y: 0 });
  const touchStartDist = useRef(0);
  const touchStartScale = useRef(1);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Auto-hide controls helper
  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3500);
  };

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [mediaId]);

  // Reset zoom settings on media change
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [mediaId]);

  // Listen to keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        setScale(prev => Math.min(5, prev + 0.5));
      } else if (e.key === '-') {
        e.preventDefault();
        setScale(prev => {
          const next = Math.max(1, prev - 0.5);
          if (next === 1) setPosition({ x: 0, y: 0 });
          return next;
        });
      } else if (e.key === '0') {
        e.preventDefault();
        setScale(1);
        setPosition({ x: 0, y: 0 });
      } else if (e.key === 'ArrowRight') {
        if (currentIndex < mediaMessages.length - 1) {
          onNavigate(mediaMessages[currentIndex + 1].messageId);
        }
      } else if (e.key === 'ArrowLeft') {
        if (currentIndex > 0) {
          onNavigate(mediaMessages[currentIndex - 1].messageId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mediaId, currentIndex, mediaMessages, onClose, onNavigate]);

  if (!activeMessage) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black text-white p-4">
        <div className="text-center space-y-4 max-w-sm">
          <AlertCircle className="h-12 w-12 text-error mx-auto" />
          <h3 className="text-lg font-bold">Media Not Found</h3>
          <p className="text-sm text-text-secondary">The requested file could not be loaded or has expired.</p>
          <button onClick={onClose} className="px-4 py-2 bg-primary rounded-xl font-semibold">
            Close Viewer
          </button>
        </div>
      </div>
    );
  }

  const isImage = activeMessage.type === 'image';
  const isVideo = activeMessage.type === 'video';
  const isPDF = activeMessage.type === 'file' && activeMessage.mimeType === 'application/pdf';

  // Desktop Mouse Drag / Panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    resetControlsTimeout();
    if (!isDragging) return;
    
    // Bounds constraints
    const maxOffset = (scale - 1) * 250;
    const nextX = e.clientX - dragStart.current.x;
    const nextY = e.clientY - dragStart.current.y;
    
    setPosition({
      x: Math.max(-maxOffset, Math.min(maxOffset, nextX)),
      y: Math.max(-maxOffset, Math.min(maxOffset, nextY))
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Mouse Wheel Zoom
  const handleWheel = (e: React.WheelEvent) => {
    resetControlsTimeout();
    const zoomFactor = 0.15;
    const nextScale = e.deltaY < 0 ? scale + zoomFactor : scale - zoomFactor;
    const clampedScale = Math.max(1, Math.min(5, nextScale));
    setScale(clampedScale);
    if (clampedScale === 1) {
      setPosition({ x: 0, y: 0 });
    }
  };

  // Double Click / Tap Zoom
  const handleDoubleClick = () => {
    if (scale > 1) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    } else {
      setScale(2.5);
    }
  };

  // Mobile Pinch Gestures
  const getDistance = (touches: React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    resetControlsTimeout();
    if (e.touches.length === 2) {
      e.preventDefault();
      touchStartDist.current = getDistance(e.touches);
      touchStartScale.current = scale;
    } else if (e.touches.length === 1 && scale > 1) {
      setIsDragging(true);
      dragStart.current = {
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = getDistance(e.touches);
      const factor = dist / touchStartDist.current;
      const nextScale = touchStartScale.current * factor;
      const clampedScale = Math.max(1, Math.min(5, nextScale));
      setScale(clampedScale);
      if (clampedScale === 1) {
        setPosition({ x: 0, y: 0 });
      }
    } else if (e.touches.length === 1 && isDragging && scale > 1) {
      const maxOffset = (scale - 1) * 200;
      const nextX = e.touches[0].clientX - dragStart.current.x;
      const nextY = e.touches[0].clientY - dragStart.current.y;
      
      setPosition({
        x: Math.max(-maxOffset, Math.min(maxOffset, nextX)),
        y: Math.max(-maxOffset, Math.min(maxOffset, nextY))
      });
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // File Download Helper
  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(activeMessage.text);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = activeMessage.fileName || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download failed, opening in new tab instead:', error);
      window.open(activeMessage.text, '_blank');
    } finally {
      setDownloading(false);
    }
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextSpeed = parseFloat(e.target.value);
    setVideoSpeed(nextSpeed);
    if (videoRef.current) {
      videoRef.current.playbackRate = nextSpeed;
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return 'Unknown Size';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <AnimatePresence>
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex flex-col bg-black select-none overflow-hidden touch-none"
        onMouseMove={resetControlsTimeout}
        onClick={() => setShowControls(prev => !prev)}
      >
        {/* TOP PANEL CONTROL BAR */}
        <motion.div
          initial={{ y: -50 }}
          animate={{ y: showControls ? 0 : -100 }}
          transition={{ duration: 0.25 }}
          className="absolute top-0 inset-x-0 h-16 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between px-4 z-50 pointer-events-auto"
          onClick={(e) => e.stopPropagation()} // Prevent toggling controls when interacting with buttons
        >
          <div className="flex items-center space-x-3 min-w-0">
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-full text-white transition-colors cursor-pointer"
              aria-label="Close Preview"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="min-w-0">
              <h2 className="text-white text-sm font-semibold truncate leading-tight">
                {activeMessage.fileName || 'Attachment Preview'}
              </h2>
              <p className="text-white/60 text-xs mt-0.5">
                {formatSize(activeMessage.fileSize)}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Download Icon */}
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="p-2 hover:bg-white/10 rounded-full text-white transition-colors cursor-pointer disabled:opacity-50"
              title="Download File"
              aria-label="Download"
            >
              <Download className="h-5.5 w-5.5" />
            </button>

            {/* External Link */}
            <button
              onClick={() => window.open(activeMessage.text, '_blank')}
              className="p-2 hover:bg-white/10 rounded-full text-white transition-colors cursor-pointer"
              title="Open Original"
              aria-label="Open original link"
            >
              <ExternalLink className="h-5.5 w-5.5" />
            </button>
          </div>
        </motion.div>

        {/* MEDIA CONTAINER */}
        <div 
          className="flex-1 flex items-center justify-center relative w-full h-full"
          onWheel={isImage ? handleWheel : undefined}
          onMouseDown={isImage ? handleMouseDown : undefined}
          onMouseMove={isImage ? handleMouseMove : undefined}
          onMouseUp={isImage ? handleMouseUp : undefined}
          onMouseLeave={isImage ? handleMouseUp : undefined}
          onTouchStart={isImage ? handleTouchStart : undefined}
          onTouchMove={isImage ? handleTouchMove : undefined}
          onTouchEnd={isImage ? handleTouchEnd : undefined}
        >
          {/* LEFT NAVIGATION ARROW (Desktop only) */}
          {currentIndex > 0 && (
            <div className="absolute left-4 z-50 hidden md:block">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate(mediaMessages[currentIndex - 1].messageId);
                }}
                className={`p-3 bg-black/40 hover:bg-black/70 rounded-full text-white transition-all cursor-pointer border border-white/5 ${
                  showControls ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'
                }`}
                aria-label="Previous Media"
              >
                <ChevronLeft className="h-7 w-7" />
              </button>
            </div>
          )}

          {/* MEDIA RENDERERS */}
          <div
            className="flex items-center justify-center p-4 transition-transform duration-100 ease-out"
            style={{
              transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
              cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
            }}
            onDoubleClick={handleDoubleClick}
            onClick={(e) => e.stopPropagation()} // Stop propagation to container click toggle
          >
            {/* 1. IMAGE VIEWER */}
            {isImage && (
              <img
                src={activeMessage.text}
                alt={activeMessage.fileName || 'Attachment'}
                className="max-w-full max-h-[85vh] object-contain select-none rounded-sm shadow-2xl transition-shadow"
                draggable={false}
              />
            )}

            {/* 2. VIDEO VIEWER */}
            {isVideo && (
              <video
                ref={videoRef}
                src={activeMessage.text}
                className="max-w-full max-h-[85vh] object-contain rounded-md shadow-2xl"
                controls
                autoPlay
                playsInline
              />
            )}

            {/* 3. PDF PREVIEW / DOC VIEWER */}
            {isPDF && (
              <div className="flex flex-col items-center bg-zinc-900 border border-zinc-800 text-center rounded-2xl p-8 max-w-sm shadow-2xl">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-500 mb-4">
                  <FileTextIcon className="h-10 w-10" />
                </div>
                <h4 className="text-white font-bold truncate max-w-[280px]">
                  {activeMessage.fileName || 'Document.pdf'}
                </h4>
                <p className="text-white/60 text-xs mt-1.5 mb-6">
                  {formatSize(activeMessage.fileSize)} • PDF Document
                </p>
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="w-full flex items-center justify-center space-x-2 py-3.5 bg-primary text-white rounded-xl font-semibold cursor-pointer hover:bg-primary-hover active:scale-95 transition-all disabled:opacity-50"
                >
                  <Download className="h-5 w-5" />
                  <span>{downloading ? 'Downloading...' : 'Download PDF'}</span>
                </button>
              </div>
            )}

            {/* 4. OTHER GENERIC FILES */}
            {!isImage && !isVideo && !isPDF && (
              <div className="flex flex-col items-center bg-zinc-900 border border-zinc-800 text-center rounded-2xl p-8 max-w-sm shadow-2xl">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
                  <FileTextIcon className="h-10 w-10" />
                </div>
                <h4 className="text-white font-bold truncate max-w-[280px]">
                  {activeMessage.fileName || 'Attachment File'}
                </h4>
                <p className="text-white/60 text-xs mt-1.5 mb-6">
                  {formatSize(activeMessage.fileSize)} • File Attachment
                </p>
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="w-full flex items-center justify-center space-x-2 py-3.5 bg-primary text-white rounded-xl font-semibold cursor-pointer hover:bg-primary-hover active:scale-95 transition-all disabled:opacity-50"
                >
                  <Download className="h-5 w-5" />
                  <span>{downloading ? 'Downloading...' : 'Download File'}</span>
                </button>
              </div>
            )}
          </div>

          {/* RIGHT NAVIGATION ARROW (Desktop only) */}
          {currentIndex < mediaMessages.length - 1 && (
            <div className="absolute right-4 z-50 hidden md:block">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate(mediaMessages[currentIndex + 1].messageId);
                }}
                className={`p-3 bg-black/40 hover:bg-black/70 rounded-full text-white transition-all cursor-pointer border border-white/5 ${
                  showControls ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'
                }`}
                aria-label="Next Media"
              >
                <ChevronRight className="h-7 w-7" />
              </button>
            </div>
          )}
        </div>

        {/* BOTTOM PANEL CONTROLS BAR */}
        <motion.div
          initial={{ y: 50 }}
          animate={{ y: showControls ? 0 : 100 }}
          transition={{ duration: 0.25 }}
          className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-center px-4 z-50 pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center space-x-6">
            {/* Zoom Controls (Images only) */}
            {isImage && (
              <>
                <button
                  onClick={() => setScale(prev => Math.max(1, prev - 0.5))}
                  disabled={scale <= 1}
                  className="p-2 hover:bg-white/10 rounded-full text-white transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Zoom Out"
                >
                  <ZoomOut className="h-5 w-5" />
                </button>

                <button
                  onClick={() => {
                    setScale(1);
                    setPosition({ x: 0, y: 0 });
                  }}
                  disabled={scale === 1}
                  className="p-2 hover:bg-white/10 rounded-full text-white transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Reset Zoom"
                >
                  <RotateCcw className="h-5 w-5" />
                </button>

                <button
                  onClick={() => setScale(prev => Math.min(5, prev + 0.5))}
                  disabled={scale >= 5}
                  className="p-2 hover:bg-white/10 rounded-full text-white transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Zoom In"
                >
                  <ZoomIn className="h-5 w-5" />
                </button>
              </>
            )}

            {/* Video Playback Speed controls (Video only) */}
            {isVideo && (
              <div className="flex items-center space-x-2 text-white bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-semibold">
                <span className="opacity-65">Speed:</span>
                <select
                  value={videoSpeed}
                  onChange={handleSpeedChange}
                  className="bg-transparent border-none outline-none text-white font-bold cursor-pointer pr-1"
                >
                  <option value="0.5" className="bg-zinc-950 text-white">0.5x</option>
                  <option value="1.0" className="bg-zinc-950 text-white">1x</option>
                  <option value="1.5" className="bg-zinc-950 text-white">1.5x</option>
                  <option value="2.0" className="bg-zinc-950 text-white">2x</option>
                </select>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Internal Local Icon Components
function FileTextIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}
