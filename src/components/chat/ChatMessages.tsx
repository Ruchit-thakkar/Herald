'use client';

import React, { useEffect, useRef, useLayoutEffect, useMemo, useState } from 'react';
import {
  RefreshCw, X, AlertCircle, Clock, ExternalLink, Download, FileText, File as FileIcon, Send, ChevronDown
} from 'lucide-react';

export interface Message {
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
  rawFile?: File;
}

interface ChatMessagesProps {
  messages: Message[];
  activeUploads: Message[];
  currentUserId?: string;
  loading: boolean;
  onCancelUpload: (tempId: string) => void;
  onRetryUpload: (tempId: string) => void;
  onViewMedia: (messageId: string) => void;
  formatFileSize: (bytes?: number) => string;
  handleDownloadFile: (url: string, fileName: string) => Promise<void>;
  getRemainingTimeText: (expiresAt?: number) => string;
  onLoadOlderMessages?: () => Promise<void>;
  hasMoreOlder?: boolean;
  loadingOlder?: boolean;
}

export default function ChatMessages({
  messages,
  activeUploads,
  currentUserId,
  loading,
  onCancelUpload,
  onRetryUpload,
  onViewMedia,
  formatFileSize,
  handleDownloadFile,
  getRemainingTimeText,
  onLoadOlderMessages,
  hasMoreOlder = true,
  loadingOlder = false,
}: ChatMessagesProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Pagination scroll position preservation refs
  const prevScrollHeightRef = useRef<number>(0);
  const prevScrollTopRef = useRef<number>(0);

  // New incoming messages tracking states
  const [showNewIndicator, setShowNewIndicator] = useState(false);
  const prevMessagesLength = useRef<number>(messages.length);
  const isNearBottomRef = useRef<boolean>(true);

  // Set up ResizeObserver to automatically anchor scroll to bottom on initial load / upload changes
  useEffect(() => {
    const container = scrollContainerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    let isInitial = true;

    const observer = new ResizeObserver(() => {
      if (isInitial) {
        container.scrollTop = container.scrollHeight;
        isInitial = false;
        return;
      }

      // Check if user is scrolled near the bottom before dimensions resize (e.g. image completes load)
      const threshold = 200;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;

      if (isNearBottom) {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;
        });
      }
    });

    observer.observe(content);
    return () => observer.disconnect();
  }, [loading]);

  // Handle incoming new messages: scroll to bottom if user is already near bottom,
  // otherwise show the "New Messages" banner indicator overlay
  useEffect(() => {
    if (messages.length === 0) {
      prevMessagesLength.current = 0;
      return;
    }

    if (messages.length > prevMessagesLength.current) {
      const lastMessage = messages[messages.length - 1];
      const isMe = lastMessage?.senderId === currentUserId;

      if (isMe || isNearBottomRef.current) {
        requestAnimationFrame(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
          }
        });
      } else {
        setShowNewIndicator(true);
      }
    }
  }, [messages, currentUserId]);

  // Snaps to absolute bottom on initial load once loading becomes false and messages are available
  useEffect(() => {
    if (!loading && messages.length > 0) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
          }
        });
      });
    }
  }, [loading, messages.length]);

  // Preserve scroll position exactly during dynamic message insertion at the top
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (prevScrollHeightRef.current > 0) {
      const scrollDiff = container.scrollHeight - prevScrollHeightRef.current;
      if (scrollDiff > 0) {
        container.scrollTop = prevScrollTopRef.current + scrollDiff;
      }
      prevScrollHeightRef.current = 0;
      prevScrollTopRef.current = 0;
    }
  }, [messages]);

  // Handle scroll trigger: check if user scrolls to top (trigger infinite loading)
  // or scrolls to bottom (dismiss new message banner)
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const threshold = 200;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
    isNearBottomRef.current = nearBottom;

    if (nearBottom && showNewIndicator) {
      setShowNewIndicator(false);
    }

    // Scroll near the top (<= 50px) triggers paginated load, locked by loadingOlder
    if (container.scrollTop <= 50 && hasMoreOlder && !loadingOlder && onLoadOlderMessages) {
      prevScrollHeightRef.current = container.scrollHeight;
      prevScrollTopRef.current = container.scrollTop;
      onLoadOlderMessages();
    }
  };

  const renderedMessages = useMemo(() => {
    let lastDateStr = '';
    const combinedMessages = [...messages, ...activeUploads].sort((a, b) => a.timestamp - b.timestamp);

    return combinedMessages.map((msg, index) => {
      const isMe = msg.senderId === currentUserId;
      const formattedTime = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const msgDate = new Date(msg.timestamp);
      const dateStr = msgDate.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
      let showDateSeparator = false;
      if (dateStr !== lastDateStr) {
        showDateSeparator = true;
        lastDateStr = dateStr;
      }

      let separatorText = dateStr;
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      if (msgDate.toDateString() === today.toDateString()) {
        separatorText = 'Today';
      } else if (msgDate.toDateString() === yesterday.toDateString()) {
        separatorText = 'Yesterday';
      }

      const prevMsg = index > 0 ? combinedMessages[index - 1] : null;
      const isSameSender = prevMsg && prevMsg.senderId === msg.senderId;
      const isCloseTime = prevMsg && (msg.timestamp - prevMsg.timestamp < 2 * 60 * 1000);
      const isGrouped = isSameSender && isCloseTime && !showDateSeparator;

      const textPrimaryClass = isMe ? 'text-white' : 'text-text-primary';
      const textSecondaryClass = isMe ? 'text-white/80' : 'text-text-secondary';
      const textMutedClass = isMe ? 'text-white/60' : 'text-text-secondary/70';
      const iconBgClass = isMe ? 'bg-white/10 text-white' : 'bg-primary/10 text-primary';
      const fileContainerBgClass = isMe ? 'bg-white/5 border border-white/10' : 'bg-background border border-border-primary';
      const actionBtnHoverClass = isMe ? 'hover:bg-white/10' : 'hover:bg-black/5';

      return (
        <React.Fragment key={msg.messageId}>
          {showDateSeparator && (
            <div className="flex justify-center my-6 animate-fade-in select-none">
              <span className="rounded-full bg-surface border border-border-primary/80 px-3.5 py-1 text-xs font-semibold text-text-secondary/90 shadow-sm">
                {separatorText}
              </span>
            </div>
          )}

          <div
            className={`flex w-full transition-all duration-150 ${isGrouped ? 'mt-1' : 'mt-4'}`}
            style={{ justifyContent: isMe ? 'flex-end' : 'flex-start' }}
          >
            <div className="flex flex-col space-y-1 max-w-[80%] sm:max-w-[70%]">
              <div
                className={`rounded-2xl px-4 py-2.5 shadow-sm transition-all duration-150 ${isMe
                  ? 'bg-primary text-white rounded-br-sm font-normal'
                  : 'bg-surface text-text-primary rounded-bl-sm border border-border-primary/55'
                  }`}
              >
                {msg.status === 'uploading' && (
                  <div className="flex flex-col space-y-2 p-1.5 w-60 sm:w-72">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="flex items-center space-x-2">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Uploading File ({msg.progress}%)</span>
                      </span>
                      <button
                        onClick={() => onCancelUpload(msg.messageId)}
                        className="p-1 hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                        title="Cancel Upload"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="w-full bg-white/20 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-white h-full transition-all duration-200"
                        style={{ width: `${msg.progress}%` }}
                      ></div>
                    </div>
                    <span className="text-[10px] opacity-70 truncate block">{msg.fileName}</span>
                  </div>
                )}

                {msg.status === 'sending' && (
                  <div className="flex items-center space-x-2.5 p-2 w-60 sm:w-72">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span className="text-xs font-semibold">Sending...</span>
                  </div>
                )}

                {msg.status === 'failed' && (
                  <div className="flex flex-col space-y-2 p-1.5 w-60 sm:w-72">
                    <div className="flex items-center space-x-2 text-xs font-semibold text-red-200">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>Upload Failed</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => onRetryUpload(msg.messageId)}
                        className="px-3 py-1 bg-white/15 hover:bg-white/25 text-xs font-bold rounded-lg transition-colors flex items-center space-x-1 cursor-pointer"
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>Retry</span>
                      </button>
                      <button
                        onClick={() => onCancelUpload(msg.messageId)}
                        className="px-3 py-1 bg-white/5 hover:bg-white/10 text-xs font-semibold rounded-lg text-white transition-colors cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </div>
                    <span className="text-[10px] opacity-60 truncate block">{msg.fileName}</span>
                  </div>
                )}

                {(msg.status === 'sent' || msg.status === 'delivered' || msg.status === 'read' || !msg.status) && (
                  <>
                    {msg.type === 'image' && (
                      <div className="flex flex-col w-60 sm:w-72 max-w-full">
                        <div className="relative rounded-xl overflow-hidden mb-1.5 border border-white/5 aspect-auto">
                          <img
                            src={msg.text}
                            alt={msg.fileName || 'Attachment'}
                            loading="lazy"
                            className="max-h-60 w-full object-cover hover:opacity-95 transition-opacity cursor-pointer rounded-lg"
                            onClick={() => onViewMedia(msg.messageId)}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1 px-0.5 text-[10px]">
                          <div className="flex flex-col min-w-0 flex-1 mr-3">
                            <p className={`truncate font-semibold ${textPrimaryClass}`}>{msg.fileName}</p>
                            <p className={`text-[9px] ${textMutedClass}`}>{formatFileSize(msg.fileSize)}</p>
                          </div>
                          <div className="flex items-center space-x-2 shrink-0">
                            {msg.expiresAt && (
                              <span className={`flex items-center space-x-0.5 ${textMutedClass} mr-1`} title={getRemainingTimeText(msg.expiresAt)}>
                                <Clock className="h-3 w-3" />
                                <span className="truncate max-w-[65px] font-semibold">{getRemainingTimeText(msg.expiresAt).replace(' left', '')}</span>
                              </span>
                            )}
                            <button
                              onClick={() => onViewMedia(msg.messageId)}
                              className={`p-1 ${actionBtnHoverClass} rounded-full transition-colors cursor-pointer ${textSecondaryClass}`}
                              title="Open Preview"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDownloadFile(msg.text, msg.fileName || 'image.jpg')}
                              className={`p-1 ${actionBtnHoverClass} rounded-full transition-colors cursor-pointer ${textSecondaryClass}`}
                              title="Download"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {msg.type === 'video' && (
                      <div className="flex flex-col w-60 sm:w-72 max-w-full">
                        <div className="relative rounded-xl overflow-hidden mb-1.5 border border-white/5 bg-black">
                          <video
                            src={msg.text}
                            className="max-h-60 w-full object-contain rounded-lg"
                            controls
                            preload="metadata"
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1 px-0.5 text-[10px]">
                          <div className="flex flex-col min-w-0 flex-1 mr-3">
                            <p className={`truncate font-semibold ${textPrimaryClass}`}>{msg.fileName}</p>
                            <p className={`text-[9px] ${textMutedClass}`}>{formatFileSize(msg.fileSize)}</p>
                          </div>
                          <div className="flex items-center space-x-2 shrink-0">
                            {msg.expiresAt && (
                              <span className={`flex items-center space-x-0.5 ${textMutedClass} mr-1`} title={getRemainingTimeText(msg.expiresAt)}>
                                <Clock className="h-3 w-3" />
                                <span className="truncate max-w-[65px] font-semibold">{getRemainingTimeText(msg.expiresAt).replace(' left', '')}</span>
                              </span>
                            )}
                            <button
                              onClick={() => onViewMedia(msg.messageId)}
                              className={`p-1 ${actionBtnHoverClass} rounded-full transition-colors cursor-pointer ${textSecondaryClass}`}
                              title="Open Preview"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDownloadFile(msg.text, msg.fileName || 'video.mp4')}
                              className={`p-1 ${actionBtnHoverClass} rounded-full transition-colors cursor-pointer ${textSecondaryClass}`}
                              title="Download"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {msg.type === 'file' && (
                      <div className="flex flex-col w-60 sm:w-72">
                        <div className={`flex items-center space-x-3 p-3 rounded-xl ${fileContainerBgClass}`}>
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBgClass}`}>
                            {msg.mimeType === 'application/pdf' ? (
                              <FileText className="h-5 w-5" />
                            ) : (
                              <FileIcon className="h-5 w-5" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`truncate text-xs font-bold leading-tight ${textPrimaryClass}`}>
                              {msg.fileName || 'Attached File'}
                            </p>
                            <p className={`text-[10px] mt-1 ${textMutedClass}`}>
                              {formatFileSize(msg.fileSize)} • {msg.mimeType === 'application/pdf' ? 'PDF' : msg.fileName?.split('.').pop()?.toUpperCase() || 'FILE'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-2 px-0.5 text-[10px]">
                          {msg.expiresAt && (
                            <span className={`flex items-center space-x-1 ${textMutedClass}`} title={getRemainingTimeText(msg.expiresAt)}>
                              <Clock className="h-3 w-3" />
                              <span className="font-semibold">{getRemainingTimeText(msg.expiresAt)}</span>
                            </span>
                          )}
                          <div className="flex items-center space-x-3 ml-auto">
                            <button
                              onClick={() => onViewMedia(msg.messageId)}
                              className={`flex items-center space-x-1 font-semibold hover:underline cursor-pointer ${textSecondaryClass}`}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              <span>Open</span>
                            </button>
                            <button
                              onClick={() => handleDownloadFile(msg.text, msg.fileName || 'download')}
                              className={`flex items-center space-x-1 font-semibold hover:underline cursor-pointer ${textSecondaryClass}`}
                            >
                              <Download className="h-3 w-3" />
                              <span>Download</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {msg.type === 'text' && (
                      <p className="text-sm whitespace-pre-wrap break-words leading-relaxed select-text">
                        {msg.text}
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className={`flex w-full ${isMe ? 'justify-end pr-1.5' : 'justify-start pl-1.5'} text-[9px] text-text-secondary/65 font-medium`}>
                <span>{formattedTime}</span>
              </div>
            </div>
          </div>
        </React.Fragment>
      );
    });
  }, [messages, activeUploads, currentUserId, formatFileSize, getRemainingTimeText, handleDownloadFile, onViewMedia, onCancelUpload, onRetryUpload]);

  return (
    <div className="flex-grow flex-shrink flex basis-auto min-h-0 relative flex-col bg-background/30">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-grow overflow-y-auto px-4 py-3 sm:px-6 sm:py-4 space-y-4 min-h-0"
      >
        <div ref={contentRef} className="flex flex-col justify-end min-h-full pb-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center my-auto space-y-3">
              <RefreshCw className="h-6 w-6 animate-spin text-primary/50" />
              <span className="text-[10px] text-text-secondary font-semibold tracking-wider uppercase animate-pulse">
                Syncing Messages
              </span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center my-auto text-center px-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface border border-border-primary text-text-secondary mb-3">
                <Send className="h-4 w-4 rotate-45" />
              </div>
              <h4 className="text-xs sm:text-sm font-bold text-text-secondary">Say Hello!</h4>
              <p className="text-[11px] text-text-secondary/70 max-w-xs mt-1">
                This is the beginning of your conversation. Send a message to start chatting.
              </p>
            </div>
          ) : (
            renderedMessages
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Floating "New Messages" indicator overlay */}
      {showNewIndicator && (
        <button
          onClick={() => {
            if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
            }
            setShowNewIndicator(false);
          }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center space-x-2 rounded-full bg-primary hover:bg-primary-hover px-4 py-2 text-xs font-semibold text-white shadow-lg animate-bounce transition-all duration-200 cursor-pointer"
        >
          <ChevronDown className="h-4 w-4" />
          <span>New Messages</span>
        </button>
      )}
    </div>
  );
}
