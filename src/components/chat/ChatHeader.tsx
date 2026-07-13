'use client';

import React from 'react';
import { ChevronLeft, MoreVertical, Phone, Video } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCall } from '@/context/CallContext';

export interface RecipientProfile {
  uid: string;
  username: string;
  displayName: string;
  photoURL?: string | null;
  status?: 'online' | 'offline';
  lastSeen?: number;
}

interface ChatHeaderProps {
  recipient: RecipientProfile | null;
  onBack: () => void;
  formatLastSeen: (timestamp?: number) => string;
}

export default function ChatHeader({ recipient, onBack, formatLastSeen }: ChatHeaderProps) {
  const params = useParams();
  const conversationId = params?.conversationId as string;
  const { startCall, callState } = useCall();

  return (
    <div className="flex h-14 sm:h-16 items-center justify-between border-b border-border-primary bg-surface px-3 sm:px-4 md:px-6 shrink-0 z-10">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {/* Back Button (Mobile only) */}
        <button
          onClick={onBack}
          className="md:hidden flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background border border-border-primary text-text-secondary hover:text-text-primary transition-all duration-200 cursor-pointer"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        {recipient && (
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            {/* Avatar */}
            <div className="relative h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-full overflow-hidden border border-border-primary bg-surface flex items-center justify-center">
              {recipient.photoURL ? (
                <img
                  src={recipient.photoURL}
                  alt={recipient.displayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xs font-semibold text-text-secondary">
                  {recipient.displayName
                    ? recipient.displayName
                      .split(" ")
                      .filter(Boolean)
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)
                    : "?"}
                </span>
              )}

              {recipient.status === "online" && (
                <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-surface bg-success animate-pulse" />
              )}
            </div>

            {/* Name + Status */}
            <div className="min-w-0 flex-1">
              <h4 className="truncate text-xs sm:text-sm font-semibold text-text-primary">
                {recipient.displayName}
              </h4>
              <p className="truncate text-[10px] sm:text-xs text-text-secondary mt-0.5">
                {recipient.status === "online" ? "Online" : formatLastSeen(recipient.lastSeen)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Header Actions (Call buttons + More dropdown menu) */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Voice Call Button */}
        <button
          onClick={() => {
            if (recipient && conversationId) {
              startCall(conversationId, recipient);
            }
          }}
          disabled={!recipient || callState !== 'idle'}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-background transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          title="Voice Call"
        >
          <Phone className="h-4.5 w-4.5" />
        </button>

        {/* Video Call Placeholder */}
        <button
          disabled
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary/45 cursor-not-allowed"
          title="Video Call (Coming Soon)"
        >
          <Video className="h-4.5 w-4.5" />
        </button>

        <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-background transition-all duration-200">
          <MoreVertical className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
