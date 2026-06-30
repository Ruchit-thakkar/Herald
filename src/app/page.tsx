'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { ShieldCheck } from 'lucide-react';

export default function RootGatewayPage() {
  const { loading } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-text-primary">
      <div className="flex flex-col items-center space-y-4">
        {/* Brand Logo Animation */}
        <div className="relative flex h-16 w-16 items-center justify-center rounded-[20px] overflow-hidden shadow-md bg-surface border border-border-primary/50">
          <img src="https://ik.imagekit.io/devnext/Harald%20?updatedAt=1782817476464" alt="Herald Logo" className="h-full w-full object-cover" />
        </div>
        
        <h1 className="text-xl font-bold tracking-tight text-text-primary">Herald</h1>
        <div className="flex items-center space-y-2 flex-col">
          <div className="h-1 w-24 overflow-hidden rounded-full bg-surface border border-border-primary/50">
            <div className="h-full w-1/2 animate-infinite-scroll rounded-full bg-primary" style={{
              animation: 'loading-bar 1.5s ease-in-out infinite'
            }}></div>
          </div>
          <span className="text-[10px] font-semibold tracking-wider text-text-secondary uppercase">
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
