'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { ref, onValue, set, push, remove, get, update, onDisconnect } from 'firebase/database';

export type CallState = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended' | 'rejected' | 'missed' | 'cancelled';

export interface CallUser {
  uid: string;
  displayName: string;
  photoURL?: string | null;
}

interface CallContextType {
  callState: CallState;
  caller: CallUser | null;
  receiver: CallUser | null;
  conversationId: string | null;
  isMuted: boolean;
  isSpeaker: boolean;
  callDuration: number;
  micStatus: 'prompt' | 'granted' | 'denied';
  connectionQuality: 'good' | 'poor' | 'searching';
  callError: string | null;
  startCall: (convoId: string, recipient: { uid: string; displayName: string; photoURL?: string | null }) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  dismissError: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) throw new Error('useCall must be used within a CallProvider');
  return context;
};

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile } = useAuth();

  const [callState, setCallState] = useState<CallState>('idle');
  const [caller, setCaller] = useState<CallUser | null>(null);
  const [receiver, setReceiver] = useState<CallUser | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [micStatus, setMicStatus] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [connectionQuality, setConnectionQuality] = useState<'good' | 'poor' | 'searching'>('searching');
  const [callError, setCallError] = useState<string | null>(null);

  // WebRTC refs
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  // Synthesized Ringtone refs
  const ringtoneIntervalRef = useRef<number | null>(null);
  const ringtoneContextRef = useRef<AudioContext | null>(null);

  // Timers and locks
  const callTimerIntervalRef = useRef<number | null>(null);
  const callTimeoutRef = useRef<number | null>(null);
  const isInitiatorRef = useRef(false);
  const rejectionTimeoutRef = useRef<number | null>(null);

  // Global listener for incoming calls inside userConversations
  useEffect(() => {
    if (!user?.uid) {
      console.log('[Calling Diagnostics] Call listener idle: user details not resolved yet.');
      return;
    }

    const userConvRef = ref(db, `userConversations/${user.uid}`);
    console.log('[Calling Diagnostics] Call listener started. Path: userConversations/' + user.uid);
    
    const unsub = onValue(userConvRef, (snap) => {
      console.log('[Calling Diagnostics] userConversations listener snapshot change:', snap.exists());
      
      if (snap.exists()) {
        const conversations = snap.val();
        let foundCall = false;
        
        Object.keys(conversations).forEach((convoId) => {
          const conv = conversations[convoId];
          const incoming = conv?.incomingCall;
          
          if (incoming && incoming.status === 'calling') {
            foundCall = true;
            if (callState === 'idle') {
              console.log('[Calling Diagnostics] Incoming call detected from:', incoming.callerId, 'for conversation:', convoId);
              setConversationId(convoId);
              setCaller({
                uid: incoming.callerId,
                displayName: incoming.callerName,
                photoURL: incoming.callerPhoto
              });
              setReceiver({
                uid: user.uid,
                displayName: profile?.displayName || 'Herald User',
                photoURL: profile?.photoURL
              });
              setCallState('ringing');
              isInitiatorRef.current = false;
              setCallError(null);
              console.log('[Calling Diagnostics] Incoming UI displayed. Initiating ringtone.');
              startRingtone();
              
              // Auto-terminate call after 30 seconds if unanswered (Missed Call)
              if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
              callTimeoutRef.current = window.setTimeout(() => {
                console.log('[Calling Diagnostics] Ringing timeout reached. Declaring missed call.');
                handleMissedCall(convoId, incoming.callerId);
              }, 30000);
            }
          }
        });

        // If we were ringing but the incoming call node is deleted or not calling anymore, caller cancelled or call timed out
        if (!foundCall && callState === 'ringing') {
          console.log('[Calling Diagnostics] Incoming call alert removed by caller. Cleaning up.');
          cleanupCall('cancelled');
        }
      } else {
        if (callState === 'ringing') {
          console.log('[Calling Diagnostics] No conversations found. Cleaning up ringing call.');
          cleanupCall('cancelled');
        }
      }
    }, (err) => {
      console.error('[Calling Diagnostics] Database Security Rules Denied read on userConversations path:', err);
    });

    return () => {
      console.log('[Calling Diagnostics] Cleaning up call listener for user:', user.uid);
      unsub();
    };
  }, [user?.uid, callState, profile]);

  // Synchronize state machine via /conversations/${conversationId}/activeCall
  useEffect(() => {
    if (!conversationId) return;

    const callStatusRef = ref(db, `conversations/${conversationId}/activeCall`);
    console.log('[Calling Diagnostics] Attaching status listener on conversations/' + conversationId + '/activeCall');
    
    const unsub = onValue(callStatusRef, (snap) => {
      if (!snap.exists()) {
        console.log('[Calling Diagnostics] Active call session snapshot deleted from DB.');
        if (callState !== 'idle' && callState !== 'ended') {
          cleanupCall('ended');
        }
        return;
      }
      const data = snap.val();
      const status = data.status as CallState;
      console.log('[Calling Diagnostics] Call session status updated in DB:', status);

      if (status === 'connected' && (callState === 'calling' || callState === 'ringing')) {
        console.log('[Calling Diagnostics] Transitioning to connected state.');
        setCallState('connected');
        stopRingtone();
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        startCallDurationTimer();
        setConnectionQuality('good');
      } else if (status === 'rejected') {
        console.log('[Calling Diagnostics] Call rejected by receiver.');
        stopRingtone();
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        setCallState('rejected');
        rejectionTimeoutRef.current = window.setTimeout(() => {
          cleanupCall('rejected');
        }, 3000);
      } else if (status === 'cancelled') {
        console.log('[Calling Diagnostics] Call cancelled by caller.');
        cleanupCall('cancelled');
      } else if (status === 'missed') {
        console.log('[Calling Diagnostics] Call missed/timed out.');
        cleanupCall('missed');
      } else if (status === 'ended') {
        console.log('[Calling Diagnostics] Call ended by remote peer.');
        cleanupCall('ended');
      }
    }, (err) => {
      console.error('[Calling Diagnostics] Database Security Rules Denied read on activeCall path:', err);
    });

    return () => {
      console.log('[Calling Diagnostics] Detaching status listener on conversations/' + conversationId + '/activeCall');
      unsub();
    };
  }, [conversationId, callState]);

  // Ringtone generator using Web Audio API (US Dual frequency standard)
  const startRingtone = () => {
    if (typeof window === 'undefined') return;
    try {
      if (ringtoneIntervalRef.current) return;
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      ringtoneIntervalRef.current = window.setInterval(() => {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        osc1.frequency.value = 440;
        osc2.frequency.value = 480;
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + 1.8);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.0);
        osc1.start();
        osc2.start();
        osc1.stop(ctx.currentTime + 2.0);
        osc2.stop(ctx.currentTime + 2.0);
      }, 4000);
      ringtoneContextRef.current = ctx;
    } catch (e) {
      console.error('Audio synthesizer failed to load:', e);
    }
  };

  const stopRingtone = () => {
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }
    if (ringtoneContextRef.current) {
      ringtoneContextRef.current.close().catch(() => {});
      ringtoneContextRef.current = null;
    }
  };

  const startCallDurationTimer = () => {
    if (callTimerIntervalRef.current) clearInterval(callTimerIntervalRef.current);
    setCallDuration(0);
    callTimerIntervalRef.current = window.setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  };

  // WebRTC Setup Helper
  const setupPeerConnection = async (convoId: string) => {
    console.log('[Calling Diagnostics] Setting up RTCPeerConnection for:', convoId);
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionRef.current = pc;

    pc.onconnectionstatechange = () => {
      console.log('[Calling Diagnostics] WebRTC connection state changed:', pc.connectionState);
      switch (pc.connectionState) {
        case 'connected':
          setConnectionQuality('good');
          break;
        case 'disconnected':
        case 'failed':
          setConnectionQuality('poor');
          break;
        default:
          setConnectionQuality('searching');
      }
    };

    pc.ontrack = (event) => {
      console.log('[Calling Diagnostics] Received remote audio stream track.');
      if (!remoteAudioRef.current) {
        const audio = new Audio();
        audio.autoplay = true;
        remoteAudioRef.current = audio;
      }
      remoteAudioRef.current.srcObject = event.streams[0];
    };

    // Capture Local Audio Stream
    try {
      console.log('[Calling Diagnostics] Requesting local microphone permission.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setMicStatus('granted');
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      console.log('[Calling Diagnostics] Microphone stream captured and added to tracks.');
    } catch (err) {
      setMicStatus('denied');
      console.warn('[Calling Diagnostics] Microphone access denied or busy:', err);
      return null;
    }

    // Set up ICE Signaling inside conversations activeCall
    const candidatesPath = isInitiatorRef.current ? 'receiverCandidates' : 'callerCandidates';
    const remoteCandidatesPath = isInitiatorRef.current ? 'callerCandidates' : 'receiverCandidates';

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[Calling Diagnostics] Found local ICE candidate. Saving candidate to DB.');
        try {
          const candidateRef = push(ref(db, `conversations/${convoId}/activeCall/${candidatesPath}`));
          set(candidateRef, event.candidate.toJSON());
        } catch (err) {
          console.error('[Calling Diagnostics] Failed to upload ICE candidate:', err);
        }
      }
    };

    // Listen to remote candidates
    onValue(ref(db, `conversations/${convoId}/activeCall/${remoteCandidatesPath}`), (snap) => {
      if (!snap.exists()) return;
      snap.forEach((child) => {
        const candidate = new RTCIceCandidate(child.val());
        pc.addIceCandidate(candidate).catch(e => console.warn('Error adding ICE Candidate:', e));
      });
    });

    return pc;
  };

  // Start Voice Call
  const startCall = async (convoId: string, recipient: { uid: string; displayName: string; photoURL?: string | null }) => {
    if (!recipient || !recipient.uid) {
      console.error('[Calling Diagnostics] CRITICAL: Cannot start call. Recipient user ID is missing!', recipient);
      setCallError('Calling failed: Recipient details not resolved.');
      return;
    }

    if (callState !== 'idle' || !user?.uid) {
      console.warn('[Calling Diagnostics] startCall blocked: calling system is busy or user is unauthenticated.');
      return;
    }

    console.log('[Calling Diagnostics] Initiating call to:', recipient.uid, 'in conversation:', convoId);
    setConversationId(convoId);
    setReceiver({
      uid: recipient.uid,
      displayName: recipient.displayName,
      photoURL: recipient.photoURL
    });
    setCaller({
      uid: user.uid,
      displayName: profile?.displayName || 'Herald User',
      photoURL: profile?.photoURL
    });
    setCallState('calling');
    isInitiatorRef.current = true;
    setCallError(null);
    startRingtone();

    const callRef = ref(db, `conversations/${convoId}/activeCall`);
    const incomingRef = ref(db, `userConversations/${recipient.uid}/${convoId}/incomingCall`);

    // Register onDisconnect cleanup triggers on accessible paths
    onDisconnect(callRef).remove();
    onDisconnect(incomingRef).remove();

    // Set Call signaling status
    try {
      console.log('[Calling Diagnostics] Creating call metadata under conversation node...');
      await set(callRef, {
        callerId: user.uid,
        receiverId: recipient.uid,
        status: 'calling',
        timestamp: Date.now()
      });
      console.log('[Calling Diagnostics] Call session metadata successfully written.');
    } catch (err) {
      console.error('[Calling Diagnostics] Firebase set() failed on activeCall path:', err);
      setCallError('Database error: Unable to create call session.');
      cleanupCall('ended');
      return;
    }

    // Alert receiver inside their user conversations node
    try {
      console.log('[Calling Diagnostics] Alerting receiver inside userConversations...');
      await set(incomingRef, {
        callId: convoId,
        callerId: user.uid,
        callerName: profile?.displayName || 'Herald User',
        callerPhoto: profile?.photoURL || '',
        status: 'calling',
        timestamp: Date.now()
      });
      console.log('[Calling Diagnostics] Receiver call alert successfully written.');
    } catch (err) {
      console.error('[Calling Diagnostics] Firebase set() failed on recipient incomingCall path:', err);
      setCallError('Database error: Security rules blocked call alert.');
      await remove(callRef).catch(() => {});
      cleanupCall('ended');
      return;
    }

    // Create RTCPeerConnection & SDP Offer
    try {
      const pc = await setupPeerConnection(convoId);
      if (!pc) {
        setCallError('Microphone permission denied or device busy. Please enable microphone access in your browser settings.');
        setCallState('ended');
        await remove(incomingRef).catch(() => {});
        await remove(callRef).catch(() => {});
        cleanupCall('ended');
        return;
      }
      
      console.log('[Calling Diagnostics] Formulating SDP Offer.');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await set(ref(db, `conversations/${convoId}/activeCall/offer`), {
        sdp: offer.sdp,
        type: offer.type
      });

      // Listen for SDP Answer
      onValue(ref(db, `conversations/${convoId}/activeCall/answer`), async (snap) => {
        if (!snap.exists()) return;
        const answer = new RTCSessionDescription(snap.val());
        console.log('[Calling Diagnostics] Received SDP Answer from receiver. Setting remote description.');
        await pc.setRemoteDescription(answer);
      });
    } catch (err) {
      console.warn('Failed to initiate calling stream:', err);
      setCallError('WebRTC connection setup failed.');
      setCallState('ended');
      await remove(incomingRef).catch(() => {});
      await remove(callRef).catch(() => {});
      cleanupCall('ended');
      return;
    }

    // Set 30-second answer timeout
    callTimeoutRef.current = window.setTimeout(() => {
      handleMissedCall(convoId, recipient.uid);
    }, 30000);
  };

  // Accept Incoming Call
  const acceptCall = async () => {
    if (callState !== 'ringing' || !conversationId) return;

    console.log('[Calling Diagnostics] Accept pressed.');
    stopRingtone();
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    setCallState('connected');
    setCallError(null);

    const callRef = ref(db, `conversations/${conversationId}/activeCall`);
    onDisconnect(callRef).remove();

    try {
      const pc = await setupPeerConnection(conversationId);
      if (!pc) {
        setCallError('Microphone permission denied or device busy. Please enable microphone access in your browser settings.');
        setCallState('ended');
        await remove(ref(db, `userConversations/${user?.uid}/${conversationId}/incomingCall`)).catch(() => {});
        cleanupCall('ended');
        return;
      }

      // Fetch Caller Offer
      const offerSnap = await get(ref(db, `conversations/${conversationId}/activeCall/offer`));
      if (offerSnap.exists()) {
        const offer = new RTCSessionDescription(offerSnap.val());
        console.log('[Calling Diagnostics] Setting WebRTC remote description from caller offer.');
        await pc.setRemoteDescription(offer);

        console.log('[Calling Diagnostics] Formulating SDP Answer.');
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        // Upload SDP Answer and set call status to connected
        await set(ref(db, `conversations/${conversationId}/activeCall/answer`), {
          sdp: answer.sdp,
          type: answer.type
        });
        await update(callRef, {
          status: 'connected'
        });
        
        // Remove incoming alert node
        await remove(ref(db, `userConversations/${user?.uid}/${conversationId}/incomingCall`)).catch(() => {});

        startCallDurationTimer();
        setConnectionQuality('good');
      }
    } catch (err) {
      console.warn('Failed to answer call:', err);
      setCallError('WebRTC answer formulation failed.');
      setCallState('ended');
      await remove(ref(db, `userConversations/${user?.uid}/${conversationId}/incomingCall`)).catch(() => {});
      cleanupCall('ended');
    }
  };

  // Decline/Reject Call
  const declineCall = async () => {
    if (!conversationId) return;
    console.log('[Calling Diagnostics] Decline pressed.');
    stopRingtone();
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);

    try {
      await set(ref(db, `conversations/${conversationId}/activeCall/status`), 'rejected');
      await remove(ref(db, `userConversations/${user?.uid}/${conversationId}/incomingCall`)).catch(() => {});
    } catch (err) {
      console.error('[Calling Diagnostics] Failed to reject call node in DB:', err);
    }
    cleanupCall('rejected');
  };

  // End active call
  const endCall = async () => {
    if (!conversationId) return;
    console.log('[Calling Diagnostics] Call ended locally.');
    stopRingtone();
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);

    try {
      if (callState === 'calling' || callState === 'ringing') {
        // Cancel call request
        await set(ref(db, `conversations/${conversationId}/activeCall/status`), 'cancelled');
        if (receiver?.uid) {
          await remove(ref(db, `userConversations/${receiver.uid}/${conversationId}/incomingCall`)).catch(() => {});
        }
        cleanupCall('cancelled');
      } else {
        // End connected call
        await set(ref(db, `conversations/${conversationId}/activeCall/status`), 'ended');
        cleanupCall('ended');
      }
    } catch (err) {
      console.error('[Calling Diagnostics] Failed to end call node in DB:', err);
      cleanupCall('ended');
    }
  };

  // Timeout triggers Missed Call event
  const handleMissedCall = async (convoId: string, recipientId: string) => {
    stopRingtone();
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);

    if (isInitiatorRef.current) {
      console.log('[Calling Diagnostics] Call unanswered. Storing missed call event.');
      try {
        await set(ref(db, `conversations/${convoId}/activeCall/status`), 'missed');
        await remove(ref(db, `userConversations/${recipientId}/${convoId}/incomingCall`)).catch(() => {});
        
        // Store Missed Call event inside conversation messages
        const msgRef = ref(db, `messages/${convoId}`);
        const newMsgRef = push(msgRef);
        await set(ref(db, `messages/${convoId}/${newMsgRef.key}`), {
          senderId: user?.uid,
          text: 'Voice Call unanswered',
          type: 'text',
          timestamp: Date.now(),
          status: 'sent'
        });
      } catch (err) {
        console.error('[Calling Diagnostics] Failed to write missed call event in DB:', err);
      }
    }

    cleanupCall('missed');
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        console.log('[Calling Diagnostics] Microphone mute toggled. Muted:', !audioTrack.enabled);
      }
    }
  };

  const toggleSpeaker = () => {
    setIsSpeaker(!isSpeaker);
    console.log('[Calling Diagnostics] Speaker routing toggled. Speaker:', !isSpeaker);
  };

  const dismissError = () => {
    console.log('[Calling Diagnostics] Error dismissed by user. Returning to idle.');
    setCallError(null);
    setCallState('idle');
    setCaller(null);
    setReceiver(null);
    setConversationId(null);
    setCallDuration(0);
    setIsMuted(false);
    setIsSpeaker(false);
  };

  const cleanupCall = (finalState: CallState) => {
    console.log('[Calling Diagnostics] Performing WebRTC & Signaling local resource cleanup.');
    stopRingtone();
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    if (callTimerIntervalRef.current) clearInterval(callTimerIntervalRef.current);
    if (rejectionTimeoutRef.current) clearTimeout(rejectionTimeoutRef.current);

    // Stop all media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current = null;
    }

    // Close WebRTC Peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Cancel onDisconnect handlers
    if (conversationId) {
      onDisconnect(ref(db, `conversations/${conversationId}/activeCall`)).cancel();
      if (receiver?.uid) {
        onDisconnect(ref(db, `userConversations/${receiver.uid}/${conversationId}/incomingCall`)).cancel();
      }
      if (user?.uid) {
        onDisconnect(ref(db, `userConversations/${user.uid}/${conversationId}/incomingCall`)).cancel();
      }
      
      // Clean database nodes on initiator side
      if (isInitiatorRef.current && (finalState === 'ended' || finalState === 'rejected' || finalState === 'cancelled' || finalState === 'missed')) {
        console.log('[Calling Diagnostics] Initiator clearing database call session.');
        remove(ref(db, `conversations/${conversationId}/activeCall`)).catch(() => {});
      }
    }

    if (finalState !== 'ended' && finalState !== 'rejected') {
      setCallState('idle');
      setCaller(null);
      setReceiver(null);
      setConversationId(null);
      setCallDuration(0);
      setIsMuted(false);
      setIsSpeaker(false);
    } else if (finalState === 'ended') {
      setCallState('idle');
      setCaller(null);
      setReceiver(null);
      setConversationId(null);
      setCallDuration(0);
      setIsMuted(false);
      setIsSpeaker(false);
    } else if (finalState === 'rejected' && callState === 'rejected') {
      setCallState('idle');
      setCaller(null);
      setReceiver(null);
      setConversationId(null);
      setCallDuration(0);
      setIsMuted(false);
      setIsSpeaker(false);
    }
  };

  return (
    <CallContext.Provider
      value={{
        callState,
        caller,
        receiver,
        conversationId,
        isMuted,
        isSpeaker,
        micStatus,
        callDuration,
        connectionQuality,
        callError,
        startCall,
        acceptCall,
        declineCall,
        endCall,
        toggleMute,
        toggleSpeaker,
        dismissError
      }}
    >
      {children}
    </CallContext.Provider>
  );
};
