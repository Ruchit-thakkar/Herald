'use client';

import React from 'react';
import { useCall } from '@/context/CallContext';
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, ShieldAlert, Signal, User, AlertTriangle } from 'lucide-react';

export default function CallOverlay() {
  const {
    callState,
    caller,
    receiver,
    isMuted,
    isSpeaker,
    callDuration,
    micStatus,
    connectionQuality,
    callError,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    toggleSpeaker,
    dismissError
  } = useCall();

  if (callState === 'idle') return null;

  // Render Calling Error View if there is a persistent error
  if (callError) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 text-white p-6 md:p-12 select-none animate-fade-in backdrop-blur-xl">
        <div className="flex flex-col items-center max-w-sm w-full bg-zinc-900 border border-white/10 rounded-3xl p-6 sm:p-8 text-center shadow-2xl space-y-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-error/15 text-error">
            <AlertTriangle className="h-7 w-7" />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-bold text-white">Call Failed</h3>
            <p className="text-xs text-white/60 leading-relaxed">
              {callError}
            </p>
          </div>

          <button
            onClick={dismissError}
            className="w-full py-3 px-4 rounded-xl bg-white hover:bg-zinc-100 text-zinc-950 text-xs font-bold transition-all duration-200 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  // Format call duration (e.g. 01:24)
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const activeUser = callState === 'ringing' ? caller : receiver;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-black/90 text-white p-6 md:p-12 select-none animate-fade-in backdrop-blur-lg">
      
      {/* 1. TOP HEADER & METADATA */}
      <div className="flex flex-col items-center space-y-2 mt-12 text-center">
        
        {/* Connection status/quality banner */}
        {callState === 'connected' && (
          <div className="flex items-center space-x-1.5 text-xs text-white/60 bg-white/5 border border-white/10 rounded-full px-3 py-1 mb-4">
            <Signal className={`h-3.5 w-3.5 ${connectionQuality === 'good' ? 'text-success' : 'text-error animate-pulse'}`} />
            <span>Connection: {connectionQuality === 'good' ? 'Good' : connectionQuality === 'poor' ? 'Poor' : 'Connecting'}</span>
          </div>
        )}

        {/* Microphone Permission status warning */}
        {micStatus === 'denied' && (
          <div className="flex items-center space-x-2 text-xs text-error bg-error/15 border border-error/20 rounded-xl px-4 py-2 mb-4 max-w-xs">
            <ShieldAlert className="h-4.5 w-4.5 shrink-0" />
            <span>Microphone access was denied. Please check device browser settings.</span>
          </div>
        )}

        {/* Call State Title */}
        <span className="text-xs uppercase tracking-widest font-semibold text-white/50 animate-pulse">
          {callState === 'calling' && 'Outgoing Call'}
          {callState === 'ringing' && 'Incoming Voice Call'}
          {callState === 'connected' && 'Active Voice Call'}
          {callState === 'ended' && 'Call Ended'}
          {callState === 'rejected' && 'Call Declined'}
          {callState === 'missed' && 'Missed Call'}
          {callState === 'cancelled' && 'Call Cancelled'}
        </span>

        {/* User Display Name */}
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
          {activeUser?.displayName || 'Herald User'}
        </h2>

        {/* Call Timer / Dynamic Subtext */}
        <span className="text-sm font-semibold text-white/60 mt-1.5 animate-fade-in">
          {callState === 'calling' && 'Calling...'}
          {callState === 'ringing' && 'Incoming Call...'}
          {callState === 'connected' && formatTime(callDuration)}
          {callState === 'ended' && 'Ended'}
          {callState === 'rejected' && 'Declined'}
          {callState === 'missed' && 'No Answer'}
          {callState === 'cancelled' && 'Cancelled'}
        </span>
      </div>

      {/* 2. CENTER PROFILE AVATAR */}
      <div className="flex items-center justify-center my-6">
        <div className="relative flex items-center justify-center">
          {/* Pulsing visual calling indicator circles */}
          {(callState === 'calling' || callState === 'ringing') && (
            <>
              <div className="absolute h-40 w-40 sm:h-48 sm:w-48 rounded-full bg-primary/20 animate-ping opacity-75" />
              <div className="absolute h-48 w-48 sm:h-56 sm:w-56 rounded-full bg-primary/10 animate-pulse" />
            </>
          )}
          
          {/* Avatar Image / Placeholder */}
          <div className="relative h-28 w-28 sm:h-36 sm:w-36 rounded-full overflow-hidden border border-white/20 bg-zinc-800 flex items-center justify-center shadow-2xl">
            {activeUser?.photoURL ? (
              <img
                src={activeUser.photoURL}
                alt={activeUser.displayName}
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="h-16 w-16 text-white/40" />
            )}
          </div>
        </div>
      </div>

      {/* 3. BOTTOM CONTROL BUTTONS */}
      <div className="flex flex-col items-center space-y-8 w-full max-w-sm mb-12">
        
        {/* Call Action Controls */}
        <div className="flex items-center justify-center gap-6 sm:gap-8 w-full">
          
          {callState === 'ringing' ? (
            /* INCOMING CALL VIEW BUTTONS */
            <>
              {/* Decline Button */}
              <button
                onClick={declineCall}
                className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-error hover:bg-error/95 hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg cursor-pointer"
                title="Decline Call"
              >
                <PhoneOff className="h-6 w-6 text-white" />
              </button>

              {/* Accept Button */}
              <button
                onClick={acceptCall}
                className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-success hover:bg-success/95 hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg cursor-pointer animate-bounce"
                title="Accept Call"
              >
                <Phone className="h-6 w-6 text-white" />
              </button>
            </>
          ) : (callState === 'rejected' || callState === 'missed' || callState === 'cancelled' || callState === 'ended') ? (
            /* COMPLETED / ENDED VIEW BUTTONS */
            <button
              onClick={dismissError}
              className="flex h-12 px-6 items-center justify-center rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 text-white text-xs font-bold transition-all duration-200 cursor-pointer animate-fade-in"
            >
              Dismiss
            </button>
          ) : (
            /* ACTIVE & OUTGOING CALL VIEW BUTTONS */
            <>
              {/* Mute Toggle */}
              <button
                onClick={toggleMute}
                disabled={callState !== 'connected'}
                className={`flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full border transition-all duration-200 cursor-pointer ${
                  isMuted 
                    ? 'bg-white text-zinc-900 border-white hover:bg-white/90' 
                    : 'bg-white/10 border-white/20 hover:bg-white/20 text-white disabled:opacity-40 disabled:cursor-not-allowed'
                }`}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? <MicOff className="h-5.5 w-5.5" /> : <Mic className="h-5.5 w-5.5" />}
              </button>

              {/* End Call / Cancel Button */}
              <button
                onClick={endCall}
                className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-error hover:bg-error/95 hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg cursor-pointer animate-fade-in"
                title="End Call"
              >
                <PhoneOff className="h-6 w-6 text-white" />
              </button>

              {/* Speaker Toggle */}
              <button
                onClick={toggleSpeaker}
                disabled={callState !== 'connected'}
                className={`flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full border transition-all duration-200 cursor-pointer ${
                  isSpeaker 
                    ? 'bg-white text-zinc-900 border-white hover:bg-white/90' 
                    : 'bg-white/10 border-white/20 hover:bg-white/20 text-white disabled:opacity-40 disabled:cursor-not-allowed'
                }`}
                title={isSpeaker ? 'Switch to earpiece' : 'Switch to speaker'}
              >
                {isSpeaker ? <Volume2 className="h-5.5 w-5.5" /> : <VolumeX className="h-5.5 w-5.5" />}
              </button>
            </>
          )}

        </div>
      </div>

    </div>
  );
}
