'use client';

import React, { useEffect, useRef, useState } from 'react';
import { LogOut, RefreshCw, X } from 'lucide-react';

interface LogoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function LogoutModal({ isOpen, onClose, onConfirm }: LogoutModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Focus the cancel button on mount for accessibility
    cancelBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }

      if (e.key === 'Tab') {
        if (!modalRef.current) return;
        
        // Find all focusable children inside the modal
        const focusableElements = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex="0"]'
        );
        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (e.shiftKey) { // Shift + Tab
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else { // Tab
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleConfirmClick = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await onConfirm();
    } catch (error) {
      console.error('Logout error:', error);
      setIsProcessing(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Only close if user clicked directly on the backdrop container, not on the modal card
    if (e.target === e.currentTarget && !isProcessing) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-md px-4 py-6 animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div 
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-title"
        className="w-full max-w-sm rounded-[20px] border border-border-primary bg-card-bg p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200 ease-out"
      >
        {/* Header Title & Close Button */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2.5 text-error">
            <LogOut className="h-5 w-5" />
            <h3 id="logout-title" className="text-lg font-bold text-text-primary">
              Log out?
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="rounded-full p-1.5 text-text-secondary hover:bg-surface hover:text-text-primary transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Close"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Message */}
        <p className="text-sm text-text-secondary leading-relaxed mb-6">
          Are you sure you want to log out of your Herald account?
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row-reverse sm:space-x-3 sm:space-x-reverse space-y-2 sm:space-y-0">
          <button
            ref={confirmBtnRef}
            onClick={handleConfirmClick}
            disabled={isProcessing}
            className="flex items-center justify-center w-full sm:w-auto rounded-xl bg-error hover:bg-error/90 px-4 py-2.5 text-sm font-semibold text-white transition-all shadow-sm shadow-error/15 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover-scale"
          >
            {isProcessing ? (
              <span className="flex items-center space-x-2">
                <RefreshCw className="h-4 w-4 animate-spin text-white" />
                <span>Logging out...</span>
              </span>
            ) : (
              <span>Log Out</span>
            )}
          </button>

          <button
            ref={cancelBtnRef}
            onClick={onClose}
            disabled={isProcessing}
            className="flex items-center justify-center w-full sm:w-auto rounded-xl bg-background border border-border-primary hover:bg-surface px-4 py-2.5 text-sm font-semibold text-text-primary transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover-scale"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
