'use client';

import React, { useEffect, useRef } from 'react';
import { useCall } from '@/context/CallContext';
import { 
  Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, ShieldAlert, 
  Signal, User, AlertTriangle, Video, VideoOff, RefreshCw 
} from 'lucide-react';

export default function CallOverlay() {
  const {
    callState,
    callType,
    caller,
    receiver,
    isMuted,
    isSpeaker,
    isVideoEnabled,
    isRemoteVideoEnabled,
    cameraFacing,
    callDuration,
    micStatus,
    connectionQuality,
    callError,
    localStream,
    remoteStream,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    toggleSpeaker,
    toggleCamera,
    switchCamera,
    dismissError
  } = useCall();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Hook up video streams to local and remote video elements
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, callState]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, callState]);

  if (callState === 'idle') return null;

  // Render Calling Error View
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
  const isVideo = callType === 'video';

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-between bg-zinc-950 text-white select-none overflow-hidden backdrop-blur-md">
      
      {/* 1. VIDEO VIEWPORT BACKGROUND FOR VIDEO CALLS */}
      {isVideo && callState !== 'ringing' && (
        <div className="absolute inset-0 z-0 bg-black flex items-center justify-center">
          {callState === 'connected' ? (
            /* Connected Mode - Display Remote Video */
            isRemoteVideoEnabled && remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              /* Remote video disabled - Show fallback avatar */
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="h-28 w-28 sm:h-36 sm:w-36 rounded-full overflow-hidden border border-white/10 bg-zinc-800 flex items-center justify-center shadow-2xl">
                  {activeUser?.photoURL ? (
                    <img src={activeUser.photoURL} alt={activeUser.displayName} className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-16 w-16 text-white/30" />
                  )}
                </div>
                <span className="text-xs text-white/50">{activeUser?.displayName} turned off camera</span>
              </div>
            )
          ) : (
            /* Calling Mode - Local camera preview */
            isVideoEnabled && localStream ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover opacity-80"
              />
            ) : (
              /* Local camera preview disabled */
              <div className="h-24 w-24 rounded-full bg-zinc-800 flex items-center justify-center">
                <User className="h-10 w-10 text-white/40" />
              </div>
            )
          )}

          {/* Picture-in-Picture local camera thumbnail (Active call only) */}
          {callState === 'connected' && (
            <div className="absolute top-20 right-4 sm:top-24 sm:right-6 z-20 h-36 w-24 sm:h-44 sm:w-32 rounded-2xl overflow-hidden border border-white/20 bg-zinc-900 shadow-2xl flex items-center justify-center">
              {isVideoEnabled && localStream ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="h-8 w-8 text-white/30" />
              )}
            </div>
          )}
        </div>
      )}

      {/* 2. TOP METADATA PANEL */}
      <div className="z-10 flex flex-col items-center space-y-2 mt-16 px-6 text-center drop-shadow-lg">
        {/* Connection status/quality banner */}
        {callState === 'connected' && (
          <div className="flex items-center space-x-1.5 text-[10px] sm:text-xs text-white/80 bg-black/40 border border-white/10 rounded-full px-3 py-1 mb-2 backdrop-blur-md">
            <Signal className={`h-3 w-3 sm:h-3.5 sm:w-3.5 ${connectionQuality === 'good' ? 'text-success' : 'text-error animate-pulse'}`} />
            <span>Connection: {connectionQuality === 'good' ? 'Good' : connectionQuality === 'poor' ? 'Poor' : 'Connecting'}</span>
          </div>
        )}

        {/* Microphone Permission status warning */}
        {micStatus === 'denied' && (
          <div className="flex items-center space-x-2 text-xs text-error bg-error/15 border border-error/20 rounded-xl px-4 py-2 mb-2 max-w-xs backdrop-blur-md">
            <ShieldAlert className="h-4.5 w-4.5 shrink-0" />
            <span>Microphone access was denied. Please check settings.</span>
          </div>
        )}

        {/* Call State Title */}
        <span className="text-[10px] sm:text-xs uppercase tracking-widest font-semibold text-white/60">
          {callState === 'calling' 
            ? `${isVideo ? 'Video' : 'Voice'} Calling` 
            : callState === 'ringing' 
            ? `Incoming ${isVideo ? 'Video' : 'Voice'} Call` 
            : callState === 'ended' 
            ? 'Call Ended' 
            : `${isVideo ? 'Video' : 'Voice'} Call`}
        </span>

        {/* User Display Name */}
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white drop-shadow-md">
          {activeUser?.displayName || 'Herald User'}
        </h2>

        {/* Call Timer / Dynamic Subtext */}
        <span className="text-xs sm:text-sm font-semibold text-white/80 drop-shadow-md">
          {callState === 'calling' && 'Calling...'}
          {callState === 'ringing' && 'Incoming Call...'}
          {callState === 'connected' && formatTime(callDuration)}
          {callState === 'ended' && 'Ended'}
          {callState === 'rejected' && 'Declined'}
          {callState === 'missed' && 'No Answer'}
          {callState === 'cancelled' && 'Cancelled'}
        </span>
      </div>

      {/* 3. CENTER PROFILE AVATAR FOR VOICE CALLS AND RINGING STATES */}
      {(!isVideo || callState === 'ringing') && (
        <div className="z-10 flex items-center justify-center my-6">
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
      )}

      {/* Spacer to push controls down */}
      {!isVideo && <div />}

      {/* 4. BOTTOM CONTROL BUTTONS */}
      <div className="z-10 flex flex-col items-center space-y-6 w-full max-w-md mx-auto px-6 mb-12">
        
        {/* Call Action Controls */}
        <div className="flex items-center justify-center gap-4 sm:gap-6 w-full bg-black/30 border border-white/5 rounded-3xl p-4 sm:p-5 backdrop-blur-md shadow-2xl">
          
          {callState === 'ringing' ? (
            /* INCOMING CALL VIEW BUTTONS */
            <div className="flex items-center justify-center gap-8 w-full">
              {/* Decline Button */}
              <button
                onClick={declineCall}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-error hover:bg-error/95 hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg cursor-pointer"
                title="Decline Call"
              >
                <PhoneOff className="h-6 w-6 text-white" />
              </button>

              {/* Accept Button */}
              <button
                onClick={acceptCall}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-success hover:bg-success/95 hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg cursor-pointer animate-bounce"
                title="Accept Call"
              >
                <Phone className="h-6 w-6 text-white" />
              </button>
            </div>
          ) : (callState === 'rejected' || callState === 'missed' || callState === 'cancelled' || callState === 'ended') ? (
            /* COMPLETED / ENDED VIEW BUTTONS */
            <button
              onClick={dismissError}
              className="flex h-10 px-6 items-center justify-center rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 text-white text-xs font-bold transition-all duration-200 cursor-pointer w-full"
            >
              Dismiss
            </button>
          ) : (
            /* ACTIVE & OUTGOING CALL VIEW BUTTONS */
            <>
              {/* Mute Toggle */}
              <button
                onClick={toggleMute}
                className={`flex h-11 w-11 items-center justify-center rounded-full border transition-all duration-200 cursor-pointer ${
                  isMuted 
                    ? 'bg-white text-zinc-900 border-white hover:bg-white/90' 
                    : 'bg-white/10 border-white/20 hover:bg-white/20 text-white'
                }`}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>

              {/* Camera Switch (Video Call only) */}
              {isVideo && (
                <button
                  onClick={switchCamera}
                  disabled={!isVideoEnabled}
                  className="flex h-11 w-11 items-center justify-center rounded-full border bg-white/10 border-white/20 hover:bg-white/20 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer"
                  title="Switch Camera (Front/Rear)"
                >
                  <RefreshCw className="h-5 w-5" />
                </button>
              )}

              {/* End Call / Cancel Button */}
              <button
                onClick={endCall}
                className="flex h-13 w-13 items-center justify-center rounded-full bg-error hover:bg-error/95 hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg cursor-pointer"
                title="End Call"
              >
                <PhoneOff className="h-6 w-6 text-white" />
              </button>

              {/* Camera Toggle (Video Call only) */}
              {isVideo && (
                <button
                  onClick={toggleCamera}
                  className={`flex h-11 w-11 items-center justify-center rounded-full border transition-all duration-200 cursor-pointer ${
                    !isVideoEnabled 
                      ? 'bg-white text-zinc-900 border-white hover:bg-white/90' 
                      : 'bg-white/10 border-white/20 hover:bg-white/20 text-white'
                  }`}
                  title={isVideoEnabled ? 'Turn camera off' : 'Turn camera on'}
                >
                  {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                </button>
              )}

              {/* Speaker Toggle */}
              <button
                onClick={toggleSpeaker}
                className={`flex h-11 w-11 items-center justify-center rounded-full border transition-all duration-200 cursor-pointer ${
                  isSpeaker 
                    ? 'bg-white text-zinc-900 border-white hover:bg-white/90' 
                    : 'bg-white/10 border-white/20 hover:bg-white/20 text-white'
                }`}
                title={isSpeaker ? 'Switch to earpiece' : 'Switch to speaker'}
              >
                {isSpeaker ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
              </button>
            </>
          )}

        </div>
      </div>

    </div>
  );
}
