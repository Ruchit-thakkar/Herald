'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { ShieldCheck } from 'lucide-react';

export default function RootGatewayPage() {
  const { loading } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#080C14] text-white">
      <div className="flex flex-col items-center space-y-4">
        {/* Brand Logo Animation */}
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 to-emerald-400 shadow-xl shadow-emerald-500/20 animate-pulse">
          <ShieldCheck className="h-9 w-9 text-white" />
        </div>
        
        <h1 className="text-xl font-bold tracking-tight text-gradient">Herald</h1>
        <div className="flex items-center space-y-1 flex-col">
          <div className="h-1 w-24 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full w-1/2 animate-infinite-scroll rounded-full bg-emerald-500" style={{
              animation: 'loading-bar 1.5s ease-in-out infinite'
            }}></div>
          </div>
          <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
            Verifying Session
          </span>
        </div>
      </div>

      <style jsx global>{`
        @keyframes loading-bar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}
