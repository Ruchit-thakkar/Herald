'use client';

import React from 'react';
import LeftPanel from '@/components/LeftPanel';
import { MessageSquare } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex h-screen w-screen bg-background text-text-primary overflow-hidden">
      {/* Left Panel - Conversation list (Always visible on Home route) */}
      <div className="w-full md:w-[400px] shrink-0 h-full relative">
        <LeftPanel />
      </div>

      {/* Right Panel - Empty State (Only visible on desktop/tablet) */}
      <div className="hidden md:flex flex-col flex-1 h-full items-center justify-center text-center bg-background px-6 border-l border-border-primary">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface border border-border-primary shadow-lg mb-4">
          <MessageSquare className="h-7 w-7 text-text-secondary" />
        </div>
        <h3 className="text-lg font-bold text-text-primary tracking-tight">Select a conversation</h3>
        <p className="text-sm text-text-secondary mt-1 max-w-sm">
          Choose from your active chats or click the floating "+" button to start messaging someone new.
        </p>
      </div>
    </div>
  );
}
