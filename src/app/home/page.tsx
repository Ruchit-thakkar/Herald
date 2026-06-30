'use client';

import React from 'react';
import LeftPanel from '@/components/LeftPanel';
import { MessageSquare } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex h-screen w-screen bg-[#080C14] text-white overflow-hidden">
      {/* Left Panel - Conversation list (Always visible on Home route) */}
      <div className="w-full md:w-[400px] shrink-0 h-full relative">
        <LeftPanel />
      </div>

      {/* Right Panel - Empty State (Only visible on desktop/tablet) */}
      <div className="hidden md:flex flex-col flex-1 h-full items-center justify-center text-center bg-[#080C14] px-6 border-l border-slate-900/80">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 border border-slate-800 shadow-xl mb-4">
          <MessageSquare className="h-7 w-7 text-slate-500" />
        </div>
        <h3 className="text-lg font-bold text-white tracking-tight">Select a conversation</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-sm">
          Choose from your active chats or click the floating "+" button to start messaging someone new.
        </p>
      </div>
    </div>
  );
}
