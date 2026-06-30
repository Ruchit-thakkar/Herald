'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { auth, db, storage } from '@/lib/firebase';
import { ref, onValue, push, update, get, set } from 'firebase/database';
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import LeftPanel from '@/components/LeftPanel';
import { 
  ChevronLeft, Send, Smile, Paperclip, MoreVertical, ShieldAlert,
  Image as ImageIcon, File as FileIcon, X, RefreshCw
} from 'lucide-react';

interface Message {
  messageId: string;
  senderId: string;
  text: string;
  type: 'text' | 'image' | 'file';
  fileName?: string;
  timestamp: number;
  status: 'sent' | 'delivered' | 'read';
}

interface RecipientProfile {
  uid: string;
  username: string;
  displayName: string;
  photoURL?: string | null;
  status?: 'online' | 'offline';
  lastSeen?: number;
}

export default function ChatDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile } = useAuth();
  
  const conversationId = params?.conversationId as string;

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [recipient, setRecipient] = useState<RecipientProfile | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [sending, setSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorBanner, setErrorBanner] = useState('');
  const [conversation, setConversation] = useState<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  const emojiList = ['😀', '😂', '😍', '👍', '🔥', '🚀', '🎉', '❤️', '😭', '😊', '👏', '🤔', '👀', '✨', '💯', '👋'];

  // Handle click outside to close emoji picker
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch Conversation metadata and Recipient details
  useEffect(() => {
    if (!user || !conversationId) return;

    // Get the conversation metadata to find participants
    const convRef = ref(db, `conversations/${conversationId}`);
    
    get(convRef).then((snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setConversation(data);
        const recipientUid = Object.keys(data.participants).find(uid => uid !== user.uid) || '';
        
        if (recipientUid) {
          // Listen to recipient profile and presence in real-time
          const userRef = ref(db, `users/${recipientUid}`);
          const presenceRef = ref(db, `presence/${recipientUid}`);

          const unsubUser = onValue(userRef, (userSnap) => {
            if (userSnap.exists()) {
              const uData = userSnap.val();
              setRecipient(prev => ({
                uid: recipientUid,
                username: uData.username || 'user',
                displayName: uData.displayName || 'Herald User',
                photoURL: uData.photoURL || null,
                status: prev?.status || 'offline',
                lastSeen: uData.lastSeen || 0
              }));
            }
          });

          const unsubPresence = onValue(presenceRef, (presenceSnap) => {
            const isOnline = presenceSnap.exists() && presenceSnap.val()?.online === true;
            const lastSeenVal = presenceSnap.val()?.lastSeen || Date.now();
            setRecipient(prev => prev ? {
              ...prev,
              status: isOnline ? 'online' : 'offline',
              lastSeen: lastSeenVal
            } : null);
          });

          return () => {
            unsubUser();
            unsubPresence();
          };
        }
      } else {
        // Conversation doesn't exist, go back
        router.replace('/home');
      }
    }).catch(err => {
      console.error('Error loading conversation:', err);
      setErrorBanner('Failed to load conversation details.');
    });
  }, [user, conversationId, router]);

  // Fetch Messages in real-time
  useEffect(() => {
    if (!conversationId) return;
    setLoadingMessages(true);

    const messagesRef = ref(db, `messages/${conversationId}`);
    const unsubscribe = onValue(messagesRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list = Object.keys(data).map((key) => ({
          messageId: key,
          ...data[key]
        })) as Message[];
        
        // Sort chronologically
        list.sort((a, b) => a.timestamp - b.timestamp);
        setMessages(list);
      } else {
        setMessages([]);
      }
      setLoadingMessages(false);
    }, (error) => {
      console.error('Error fetching messages:', error);
      setErrorBanner('Permission denied or failed to load message history.');
      setLoadingMessages(false);
    });

    return () => unsubscribe();
  }, [conversationId]);

  const triggerError = (msg: string) => {
    setErrorBanner(msg);
    setTimeout(() => {
      setErrorBanner(prev => prev === msg ? '' : prev);
    }, 5000);
  };

  const handleSendMessage = async (text: string, type: 'text' | 'image' | 'file' = 'text', fileName?: string) => {
    // 1. Verify authenticated user is available before any database write
    if (!auth.currentUser || !user || !profile || !conversationId || !recipient) return;

    setSending(true);
    try {
      const msgRef = ref(db, `messages/${conversationId}`);
      const newMsgRef = push(msgRef);

      const msgPayload = {
        senderId: user.uid,
        text,
        type,
        timestamp: Date.now(),
        status: 'sent' as const,
        ...(fileName ? { fileName } : {})
      };

      const conversationMeta = {
        participants: {
          [user.uid]: true,
          [recipient.uid]: true
        },
        type: 'direct' as const,
        createdAt: conversation?.createdAt || Date.now(),
        updatedAt: Date.now(),
        lastMessage: {
          text: type === 'text' ? text : `Sent an ${type}`,
          senderId: user.uid,
          timestamp: Date.now()
        }
      };

      // 2. Write the message payload to messages list
      console.log(`[Firebase Auth] Write initiated by auth.currentUser.uid: ${auth.currentUser.uid}`);
      console.log(`[Firebase Path] Writing message to: messages/${conversationId}/${newMsgRef.key}`);
      await set(ref(db, `messages/${conversationId}/${newMsgRef.key}`), msgPayload);

      // 3. Write to shared conversation path (atomic set with required fields)
      console.log(`[Firebase Auth] Write initiated by auth.currentUser.uid: ${auth.currentUser.uid}`);
      console.log(`[Firebase Path] Updating conversation metadata: conversations/${conversationId}`);
      await set(ref(db, `conversations/${conversationId}`), conversationMeta);

      // 4. Write to userConversations lists (in a single atomic update)
      console.log(`[Firebase Auth] Write initiated by auth.currentUser.uid: ${auth.currentUser.uid}`);
      console.log(`[Firebase Path] Updating userConversations for both users`);
      const userConvUpdates: any = {};
      userConvUpdates[`userConversations/${user.uid}/${conversationId}`] = {
        ...conversationMeta,
        conversationId
      };
      userConvUpdates[`userConversations/${recipient.uid}/${conversationId}`] = {
        ...conversationMeta,
        conversationId
      };
      await update(ref(db), userConvUpdates);

      setInputText('');
    } catch (err: any) {
      console.error('Error sending message:', err);
      const failPath = err?.path || `messages/${conversationId} or conversations or userConversations`;
      console.error(`[Firebase Error] Failed message send write at path: ${failPath} for UID: ${auth.currentUser?.uid}`);
      triggerError(`Failed to send message. Permission denied at ${failPath}.`);
    } finally {
      setSending(false);
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = inputText.trim();
    if (!cleanText) return;
    handleSendMessage(cleanText, 'text');
  };

  const handleEmojiClick = (emoji: string) => {
    setInputText(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  // Handle file/image attachment uploads (supports real Firebase storage with base64 fallback)
  const handleAttachmentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setErrorBanner('');

    const isImage = file.type.startsWith('image/');
    const fileType = isImage ? 'image' : 'file';

    try {
      // 1. Try Firebase Storage Upload
      const storageRef = sRef(storage, `conversations/${conversationId}/${Date.now()}_${file.name}`);
      const snap = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snap.ref);
      await handleSendMessage(downloadURL, fileType, file.name);
    } catch (err: any) {
      console.warn('Firebase Storage upload failed, falling back to base64 encoding...', err);
      
      // 2. Fallback to Base64 in Realtime Database (with a limit check of ~2MB)
      if (file.size > 2 * 1024 * 1024) {
        triggerError('File is too large. Max size is 2MB for fallback encoding.');
        setUploading(false);
        return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64String = event.target?.result as string;
        if (base64String) {
          await handleSendMessage(base64String, fileType, file.name);
        } else {
          triggerError('Failed to read attached file.');
        }
      };
      reader.onerror = () => {
        triggerError('Failed to read attached file.');
      };
      reader.readAsDataURL(file);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Helper to format presence last seen text
  const formatLastSeen = (timestamp?: number) => {
    if (!timestamp) return 'Offline';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);

    if (diffMins < 1) return 'Online';
    if (diffMins < 60) return `Active ${diffMins}m ago`;
    
    // Check if today
    if (date.toDateString() === now.toDateString()) {
      return `Last seen today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return `Last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  };

  return (
    <div className="flex h-screen w-screen bg-background text-text-primary overflow-hidden">
      
      {/* Left Panel - Hidden on mobile when viewing a conversation */}
      <div className="hidden md:block md:w-[400px] shrink-0 h-full relative">
        <LeftPanel />
      </div>

      {/* Right Panel - Active Chat Screen */}
      <div className="flex flex-col flex-1 h-full bg-background relative">
        
        {/* Error Alert Banner */}
        {errorBanner && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center space-x-3 rounded-xl bg-error/10 border border-error/30 px-5 py-3 text-xs text-error shadow-2xl backdrop-blur-md">
            <ShieldAlert className="h-4.5 w-4.5 shrink-0" />
            <span className="font-semibold">{errorBanner}</span>
            <button onClick={() => setErrorBanner('')} className="text-error hover:text-text-primary pl-2">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Chat Header */}
        <div className="flex h-16 items-center justify-between border-b border-border-primary px-4 md:px-6 bg-surface">
          <div className="flex items-center space-x-3 min-w-0">
            {/* Back Button (Mobile only) */}
            <button 
              onClick={() => router.push('/home')}
              className="md:hidden flex h-9 w-9 items-center justify-center rounded-xl bg-background border border-border-primary text-text-secondary hover:text-text-primary active:scale-95 transition-all"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            {/* Recipient Info */}
            {recipient && (
              <div className="flex items-center space-x-3 min-w-0">
                <div className="relative h-10 w-10 shrink-0 rounded-full bg-surface border border-border-primary overflow-hidden flex items-center justify-center">
                  {recipient.photoURL ? (
                    <img src={recipient.photoURL} alt={recipient.displayName} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm font-semibold text-text-secondary">
                      {recipient.displayName
                        ? recipient.displayName.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2)
                        : '?'}
                    </span>
                  )}
                  {recipient.status === 'online' && (
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-surface bg-success"></span>
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold truncate text-text-primary leading-tight">
                    {recipient.displayName}
                  </h4>
                  <p className="text-[10px] text-text-secondary truncate mt-0.5">
                    {recipient.status === 'online' ? 'Online' : formatLastSeen(recipient.lastSeen)}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-surface text-text-secondary hover:text-text-primary transition-colors cursor-pointer">
              <MoreVertical className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Message History */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          {loadingMessages ? (
            <div className="flex flex-col items-center justify-center h-full space-y-3">
              <RefreshCw className="h-7 w-7 animate-spin text-primary/50" />
              <span className="text-xs text-text-secondary font-semibold tracking-wider uppercase animate-pulse">Syncing Conversation</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface border border-border-primary text-text-secondary mb-3">
                <Send className="h-5 w-5 rotate-45" />
              </div>
              <h4 className="text-sm font-bold text-text-secondary">Say Hello!</h4>
              <p className="text-xs text-text-secondary/70 max-w-xs mt-1">
                This is the beginning of your conversation. Send a message to start chatting.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === user?.uid;
              const formattedTime = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

              return (
                <div 
                  key={msg.messageId}
                  className="flex w-full mt-1.5 transition-all duration-150"
                  style={{ justifyContent: isMe ? 'flex-end' : 'flex-start' }}
                >
                  <div 
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm transition-all duration-150 ${
                      isMe 
                        ? 'bg-primary text-white rounded-br-none font-medium' 
                        : 'bg-surface text-text-primary rounded-bl-none border border-border-primary'
                    }`}
                  >
                    {/* Render Image Message */}
                    {msg.type === 'image' && (
                      <div className="relative rounded-lg overflow-hidden max-w-full mb-1 border border-border-primary/50">
                        <img 
                          src={msg.text} 
                          alt="Attachment" 
                          className="max-h-60 object-contain hover:opacity-90 transition-opacity cursor-pointer"
                          onClick={() => window.open(msg.text, '_blank')}
                        />
                      </div>
                    )}

                    {/* Render File Message */}
                    {msg.type === 'file' && (
                      <div className={`flex items-center space-x-3 p-2.5 rounded-lg mb-1 max-w-full ${isMe ? 'bg-white/10' : 'bg-background border border-border-primary'}`}>
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isMe ? 'bg-white/10 text-white' : 'bg-surface text-primary'}`}>
                          <FileIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-xs font-semibold leading-tight ${isMe ? 'text-white' : 'text-text-primary'}`}>
                            {msg.fileName || 'Attached File'}
                          </p>
                          <a 
                            href={msg.text} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className={`text-[10px] underline font-semibold mt-1 inline-block ${isMe ? 'text-blue-100 hover:text-white' : 'text-primary hover:text-primary-hover'}`}
                          >
                            Download File
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Render Text Message */}
                    {msg.type === 'text' && (
                      <p className="text-sm whitespace-pre-wrap break-words leading-relaxed select-text">
                        {msg.text}
                      </p>
                    )}

                    {/* Timestamp Info */}
                    <div className={`flex items-center justify-end space-x-1.5 mt-1 text-[9px] ${isMe ? 'text-white/70' : 'text-text-secondary/70'}`}>
                      <span>{formattedTime}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Attachment Upload State Overlay */}
        {uploading && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center z-10 animate-fade-in">
            <div className="flex flex-col items-center space-y-3 bg-card-bg border border-border-primary p-6 rounded-2xl shadow-2xl">
              <RefreshCw className="h-7 w-7 animate-spin text-primary" />
              <span className="text-xs font-bold text-text-primary tracking-widest uppercase">Uploading Attachment</span>
            </div>
          </div>
        )}

        {/* Input Bar Area */}
        <div className="border-t border-border-primary px-4 py-3 bg-surface">
          <form onSubmit={handleTextSubmit} className="flex items-center space-x-3 relative">
            
            {/* Attachment Button */}
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleAttachmentChange}
              className="hidden"
            />
            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background border border-border-primary hover:border-text-secondary text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              title="Attach Image/File"
            >
              <Paperclip className="h-4.5 w-4.5" />
            </button>

            {/* Emoji Trigger */}
            <div ref={emojiRef} className="relative">
              <button 
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all cursor-pointer ${
                  showEmojiPicker 
                    ? 'bg-primary/10 border-primary text-primary' 
                    : 'bg-background border-border-primary text-text-secondary hover:border-text-secondary hover:text-text-primary'
                }`}
                title="Add Emoji"
              >
                <Smile className="h-4.5 w-4.5" />
              </button>

              {/* Popover Emoji Panel */}
              {showEmojiPicker && (
                <div className="absolute bottom-12 left-0 w-64 rounded-xl border border-border-primary bg-card-bg p-2.5 shadow-2xl z-20 grid grid-cols-6 gap-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
                  {emojiList.map((emo) => (
                    <button
                      key={emo}
                      type="button"
                      onClick={() => handleEmojiClick(emo)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-lg hover:bg-surface active:scale-90 transition-all cursor-pointer"
                    >
                      {emo}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Text Input Field */}
            <input 
              type="text"
              placeholder="Type a message..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 rounded-xl border border-border-primary bg-background py-2.5 px-4 text-sm text-text-primary placeholder-text-secondary/50 outline-none hover:border-text-secondary focus:border-primary transition-colors"
            />

            {/* Send Action */}
            <button 
              type="submit"
              disabled={sending || !inputText.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-md hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <Send className="h-4.5 w-4.5" />
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
