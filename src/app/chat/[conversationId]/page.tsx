'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { auth, db } from '@/lib/firebase';
import MediaViewer from '@/components/MediaViewer';
import { ref, onValue, push, update, get, set } from 'firebase/database';
import LeftPanel from '@/components/LeftPanel';
import EmojiPicker from '@/components/EmojiPicker';
import {
  ChevronLeft, Send, Smile, Paperclip, MoreVertical, ShieldAlert,
  Image as ImageIcon, File as FileIcon, X, RefreshCw,
  Download, ExternalLink, Play, FileText, Clock, AlertCircle
} from 'lucide-react';

interface Message {
  messageId: string;
  senderId: string;
  text: string;
  type: 'text' | 'image' | 'video' | 'file';
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  fileId?: string;
  uploadedAt?: number;
  expiresAt?: number;
  timestamp: number;
  status: 'sent' | 'delivered' | 'read' | 'uploading' | 'sending' | 'failed';
  progress?: number;
  rawFile?: File;
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
  const searchParams = useSearchParams();
  const { user, profile } = useAuth();

  const conversationId = params?.conversationId as string;
  const viewedMediaId = searchParams ? searchParams.get('mediaId') : null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [activeUploads, setActiveUploads] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [recipient, setRecipient] = useState<RecipientProfile | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [sending, setSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorBanner, setErrorBanner] = useState('');
  const [conversation, setConversation] = useState<any>(null);

  const xhrRefs = useRef<{ [tempId: string]: XMLHttpRequest }>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const initialScrollDoneRef = useRef(false);
  const prevMessagesLengthRef = useRef(0);

  const emojiList = ['😀', '😂', '😍', '👍', '🔥', '🚀', '🎉', '❤️', '😭', '😊', '👏', '🤔', '👀', '✨', '💯', '👋'];

  // Helper to scroll to the very bottom
  const scrollToBottom = (behavior: 'smooth' | 'auto' = 'smooth') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  };

  // Check if scroll position is within 150px of the bottom
  const isNearBottom = () => {
    const container = scrollContainerRef.current;
    if (!container) return true;
    const threshold = 150;
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <= threshold
    );
  };

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

  // Smart scroll logic: handles initial loading and incoming/outgoing messages
  useEffect(() => {
    if (messages.length === 0) return;

    // 1. Initial Load: instantly scroll to bottom
    if (!initialScrollDoneRef.current) {
      setTimeout(() => {
        scrollToBottom('auto');
      }, 50);
      initialScrollDoneRef.current = true;
    } else if (messages.length > prevMessagesLengthRef.current) {
      // 2. New message added
      const lastMessage = messages[messages.length - 1];
      const isMe = lastMessage?.senderId === user?.uid;

      if (isMe || isNearBottom()) {
        setTimeout(() => {
          scrollToBottom('smooth');
        }, 50);
      }
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages, user?.uid]);

  // Sync layout dimensions to Visual Viewport (exact WhatsApp keyboard shifting)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    let rAFId: number | null = null;
    let lastHeight = 0;
    let lastOffset = 0;

    const handler = () => {
      if (rAFId) cancelAnimationFrame(rAFId);

      rAFId = requestAnimationFrame(() => {
        const viewport = window.visualViewport;
        if (!viewport) return;

        const currentHeight = viewport.height;
        const currentOffset = viewport.offsetTop;

        // Skip writing to DOM if dimensions haven't changed meaningfully
        if (Math.abs(currentHeight - lastHeight) < 0.5 && Math.abs(currentOffset - lastOffset) < 0.5) {
          return;
        }

        const wrapper = document.getElementById('chat-right-panel-wrapper');
        if (wrapper) {
          wrapper.style.height = `${currentHeight}px`;
          wrapper.style.transform = `translateY(${currentOffset}px)`;
        }

        lastHeight = currentHeight;
        lastOffset = currentOffset;

        // Reset document scroll to prevent Safari header shifting
        window.scrollTo(0, 0);

        // Keep scrolled to bottom if near bottom
        if (isNearBottom()) {
          requestAnimationFrame(() => {
            scrollToBottom('auto');
          });
        }
      });
    };

    // Global scroll listener block to prevent document scrolling on mobile focus
    const handleScrollEvent = () => {
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };

    window.visualViewport.addEventListener('resize', handler);
    window.visualViewport.addEventListener('scroll', handler);
    window.addEventListener('scroll', handleScrollEvent, { passive: true });

    // Run initial viewport alignment
    handler();

    return () => {
      if (rAFId) cancelAnimationFrame(rAFId);
      window.visualViewport?.removeEventListener('resize', handler);
      window.visualViewport?.removeEventListener('scroll', handler);
      window.removeEventListener('scroll', handleScrollEvent);
    };
  }, []);

  // Fetch Conversation metadata and Recipient details
  useEffect(() => {
    if (!user || !conversationId) return;
    initialScrollDoneRef.current = false;

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

  const handleSendMessage = async (text: string, type: 'text' | 'image' | 'video' | 'file' = 'text', fileName?: string) => {
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

  const handleSendFileMessage = async (
    messageId: string,
    fileUrl: string,
    type: 'image' | 'video' | 'file',
    fileMetadata: {
      fileId: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      uploadedAt: number;
      expiresAt: number;
    }
  ) => {
    if (!auth.currentUser || !user || !profile || !conversationId || !recipient) return;

    try {
      // 1. Write metadata to Realtime Database message node
      const rtdbPath = `messages/${conversationId}/${messageId}`;
      const rtdbPayload = {
        senderId: user.uid,
        text: fileUrl,
        type,
        fileName: fileMetadata.fileName,
        fileId: fileMetadata.fileId,
        fileSize: fileMetadata.fileSize,
        mimeType: fileMetadata.mimeType,
        timestamp: fileMetadata.uploadedAt,
        expiresAt: fileMetadata.expiresAt,
        status: 'sent' as const
      };
      await set(ref(db, rtdbPath), rtdbPayload);

      // 2. Write metadata index to expiringUploads node for easy cleanup querying
      const cleanupPath = `expiringUploads/${messageId}`;
      const cleanupPayload = {
        conversationId,
        fileId: fileMetadata.fileId,
        expiresAt: fileMetadata.expiresAt,
        senderId: user.uid,
        receiverId: recipient.uid
      };
      await set(ref(db, cleanupPath), cleanupPayload);

      // 3. Update Conversation Meta
      const conversationMeta = {
        participants: {
          [user.uid]: true,
          [recipient.uid]: true
        },
        type: 'direct' as const,
        createdAt: conversation?.createdAt || Date.now(),
        updatedAt: Date.now(),
        lastMessage: {
          text: `Sent a ${type}`,
          senderId: user.uid,
          timestamp: Date.now()
        }
      };
      await set(ref(db, `conversations/${conversationId}`), conversationMeta);

      // 4. Update userConversations indices
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

    } catch (err: any) {
      console.error('Error saving file metadata to databases:', err);
      throw err;
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = inputText.trim();
    if (!cleanText) return;
    handleSendMessage(cleanText, 'text');
    inputRef.current?.focus();
  };

  const handleEmojiClick = (emoji: string) => {
    setInputText(prev => prev + emoji);
    setShowEmojiPicker(false);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const validateFile = (file: File) => {
    if (file.size === 0) {
      return 'File is empty.';
    }
    const MAX_SIZE = 25 * 1024 * 1024; // 25MB
    if (file.size > MAX_SIZE) {
      return 'File is too large. Maximum size allowed is 25MB.';
    }
    // Block executable extensions
    const blockedExtensions = ['.exe', '.bat', '.cmd', '.sh', '.msi', '.com', '.vbs', '.scr'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (blockedExtensions.includes(ext)) {
      return 'Executable files are not allowed for security reasons.';
    }
    const blockedMimeTypes = [
      'application/x-msdownload',
      'application/x-sh',
      'application/x-bash',
      'application/x-csh',
      'application/x-dosexec'
    ];
    if (blockedMimeTypes.includes(file.type)) {
      return 'Executable files are not allowed.';
    }
    return null;
  };

  const startUploadFlow = async (tempMsg: Message) => {
    const tempId = tempMsg.messageId;
    const file = tempMsg.rawFile!;

    // Set status to uploading
    setActiveUploads(prev =>
      prev.map(m => (m.messageId === tempId ? { ...m, status: 'uploading', progress: 0 } : m))
    );

    try {
      // 1. Fetch upload signature from API
      const authRes = await fetch('/api/imagekit-auth');
      if (!authRes.ok) {
        throw new Error('Failed to get upload credentials');
      }
      const authData = await authRes.json();
      const { token, expire, signature, publicKey } = authData;

      // 2. Construct FormData
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileName', file.name);
      formData.append('publicKey', publicKey);
      formData.append('signature', signature);
      formData.append('token', token);
      formData.append('expire', expire.toString());
      formData.append('folder', 'Herald/uploads');

      // 3. Upload with XMLHttpRequest to monitor progress
      const xhr = new XMLHttpRequest();
      xhrRefs.current[tempId] = xhr;

      xhr.open('POST', 'https://upload.imagekit.io/api/v1/files/upload', true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setActiveUploads(prev =>
            prev.map(m => (m.messageId === tempId ? { ...m, progress: percentComplete } : m))
          );
        }
      };

      xhr.onload = async () => {
        if (xhr.status === 200) {
          try {
            const resData = JSON.parse(xhr.responseText);
            const { fileId, url } = resData;

            // Transition upload state to sending
            setActiveUploads(prev =>
              prev.map(m => (m.messageId === tempId ? { ...m, status: 'sending', progress: 100 } : m))
            );

            const fileType: 'image' | 'video' | 'file' = file.type.startsWith('image/')
              ? 'image'
              : file.type.startsWith('video/')
              ? 'video'
              : 'file';

            const uploadedAt = Date.now();
            const expiresAt = uploadedAt + 24 * 60 * 60 * 1000; // 24 hours

            // Pre-generate the unique messageId using Realtime Database push syntax
            const finalMessageId = push(ref(db, `messages/${conversationId}`)).key || `file_${Date.now()}`;

            const fileMetadata = {
              fileId,
              fileName: file.name,
              fileSize: file.size,
              mimeType: file.type,
              uploadedAt,
              expiresAt
            };

            // Write metadata to Realtime Database
            await handleSendFileMessage(finalMessageId, url, fileType, fileMetadata);

            // Complete: Remove from active uploads
            setActiveUploads(prev => prev.filter(m => m.messageId !== tempId));
            delete xhrRefs.current[tempId];
          } catch (err) {
            console.error('Error completing file metadata save:', err);
            setActiveUploads(prev =>
              prev.map(m => (m.messageId === tempId ? { ...m, status: 'failed' } : m))
            );
          }
        } else {
          console.error('ImageKit error response:', xhr.responseText);
          setActiveUploads(prev =>
            prev.map(m => (m.messageId === tempId ? { ...m, status: 'failed' } : m))
          );
        }
      };

      xhr.onerror = () => {
        console.error('ImageKit upload error');
        setActiveUploads(prev =>
          prev.map(m => (m.messageId === tempId ? { ...m, status: 'failed' } : m))
        );
      };

      xhr.send(formData);

    } catch (err: any) {
      console.error('Upload process crash:', err);
      setActiveUploads(prev =>
        prev.map(m => (m.messageId === tempId ? { ...m, status: 'failed' } : m))
      );
    }
  };

  const uploadAttachment = async (file: File) => {
    const errorMsg = validateFile(file);
    if (errorMsg) {
      triggerError(errorMsg);
      return;
    }

    if (!user || !recipient || !conversationId) return;

    // Create unique temp message tracking ID
    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const fileType = file.type.startsWith('image/')
      ? 'image'
      : file.type.startsWith('video/')
      ? 'video'
      : 'file';

    const tempMsg: Message = {
      messageId: tempId,
      senderId: user.uid,
      text: '',
      type: fileType,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      timestamp: Date.now(),
      status: 'uploading',
      progress: 0,
      rawFile: file
    };

    setActiveUploads(prev => [...prev, tempMsg]);
    startUploadFlow(tempMsg);
  };

  const handleCancelUpload = (tempId: string) => {
    const xhr = xhrRefs.current[tempId];
    if (xhr) {
      xhr.abort();
      delete xhrRefs.current[tempId];
    }
    setActiveUploads(prev => prev.filter(m => m.messageId !== tempId));
  };

  const handleRetryUpload = (tempId: string) => {
    const tempMsg = activeUploads.find(m => m.messageId === tempId);
    if (tempMsg && tempMsg.rawFile) {
      startUploadFlow(tempMsg);
    }
  };

  const handleAttachmentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadAttachment(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
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

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleDownloadFile = async (url: string, fileName: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('CORS download failed, opening in new tab:', error);
      window.open(url, '_blank');
    }
  };

  const getRemainingTimeText = (expiresAt?: number) => {
    if (!expiresAt) return '';
    const diff = expiresAt - Date.now();
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / (60 * 60 * 1000));
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
    if (hours > 0) {
      return `${hours}h ${minutes}m left`;
    }
    return `${minutes}m left`;
  };

  // Memoized messages rendering to prevent expensive re-builds on input/keyboard updates
  const renderedMessages = useMemo(() => {
    let lastDateStr = '';
    const combinedMessages = [...messages, ...activeUploads].sort((a, b) => a.timestamp - b.timestamp);

    return combinedMessages.map((msg, index) => {
      const isMe = msg.senderId === user?.uid;
      const formattedTime = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Date separator logic
      const msgDate = new Date(msg.timestamp);
      const dateStr = msgDate.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
      let showDateSeparator = false;
      if (dateStr !== lastDateStr) {
        showDateSeparator = true;
        lastDateStr = dateStr;
      }

      let separatorText = dateStr;
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      if (msgDate.toDateString() === today.toDateString()) {
        separatorText = 'Today';
      } else if (msgDate.toDateString() === yesterday.toDateString()) {
        separatorText = 'Yesterday';
      }

      // Message grouping logic
      const prevMsg = index > 0 ? combinedMessages[index - 1] : null;
      const isSameSender = prevMsg && prevMsg.senderId === msg.senderId;
      const isCloseTime = prevMsg && (msg.timestamp - prevMsg.timestamp < 2 * 60 * 1000); // 2 minutes
      const isGrouped = isSameSender && isCloseTime && !showDateSeparator;

      // Theme-specific styles to fit inside colored bubbles
      const textPrimaryClass = isMe ? 'text-white' : 'text-text-primary';
      const textSecondaryClass = isMe ? 'text-white/80' : 'text-text-secondary';
      const textMutedClass = isMe ? 'text-white/60' : 'text-text-secondary/70';
      const iconBgClass = isMe ? 'bg-white/10 text-white' : 'bg-primary/10 text-primary';
      const fileContainerBgClass = isMe ? 'bg-white/5 border border-white/10' : 'bg-background border border-border-primary';
      const actionBtnHoverClass = isMe ? 'hover:bg-white/10' : 'hover:bg-black/5';

      return (
        <React.Fragment key={msg.messageId}>
          {showDateSeparator && (
            <div className="flex justify-center my-6 animate-fade-in select-none">
              <span className="rounded-full bg-surface border border-border-primary/80 px-3.5 py-1 text-xs font-semibold text-text-secondary/90 shadow-sm">
                {separatorText}
              </span>
            </div>
          )}

          <div
            className={`flex w-full transition-all duration-150 ${isGrouped ? 'mt-1' : 'mt-4'}`}
            style={{ justifyContent: isMe ? 'flex-end' : 'flex-start' }}
          >
            <div className="flex flex-col space-y-1.5 max-w-[75%]">
              <div
                className={`rounded-2xl px-4 py-2.5 shadow-sm transition-all duration-150 ${isMe
                  ? 'bg-primary text-white rounded-br-sm font-normal'
                  : 'bg-surface text-text-primary rounded-bl-sm border border-border-primary/55'
                  }`}
              >
                {/* 1. RENDER UPLOADING STATE */}
                {msg.status === 'uploading' && (
                  <div className="flex flex-col space-y-2 p-1.5 w-64 md:w-72">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="flex items-center space-x-2">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Uploading File ({msg.progress}%)</span>
                      </span>
                      <button 
                        onClick={() => handleCancelUpload(msg.messageId)}
                        className="p-1 hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                        title="Cancel Upload"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="w-full bg-white/20 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-white h-full transition-all duration-200" 
                        style={{ width: `${msg.progress}%` }}
                      ></div>
                    </div>
                    <span className="text-[10px] opacity-70 truncate block">{msg.fileName}</span>
                  </div>
                )}

                {/* 2. RENDER SENDING STATE */}
                {msg.status === 'sending' && (
                  <div className="flex items-center space-x-2.5 p-2 w-64 md:w-72">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span className="text-xs font-semibold">Sending metadata...</span>
                  </div>
                )}

                {/* 3. RENDER FAILED STATE */}
                {msg.status === 'failed' && (
                  <div className="flex flex-col space-y-2.5 p-1.5 w-64 md:w-72">
                    <div className="flex items-center space-x-2 text-xs font-semibold text-red-200">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>Upload Failed</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button 
                        onClick={() => handleRetryUpload(msg.messageId)}
                        className="px-3 py-1 bg-white/15 hover:bg-white/25 text-xs font-bold rounded-lg transition-colors flex items-center space-x-1 cursor-pointer"
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>Retry</span>
                      </button>
                      <button 
                        onClick={() => handleCancelUpload(msg.messageId)}
                        className="px-3 py-1 bg-white/5 hover:bg-white/10 text-xs font-semibold rounded-lg text-white transition-colors cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </div>
                    <span className="text-[10px] opacity-60 truncate block">{msg.fileName}</span>
                  </div>
                )}

                {/* 4. RENDER COMPLETED attachment states */}
                {(msg.status === 'sent' || msg.status === 'delivered' || msg.status === 'read' || !msg.status) && (
                  <>
                    {/* Render Image Message */}
                    {msg.type === 'image' && (
                      <div className="flex flex-col w-64 max-w-full">
                        <div className="relative rounded-xl overflow-hidden mb-1.5 border border-white/5 aspect-auto">
                          <img
                            src={msg.text}
                            alt={msg.fileName || 'Attachment'}
                            loading="lazy"
                            className="max-h-60 w-full object-cover hover:opacity-95 transition-opacity cursor-pointer rounded-lg"
                            onClick={() => router.push(`${window.location.pathname}?mediaId=${msg.messageId}`)}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1 px-0.5 text-[10px]">
                          <div className="flex flex-col min-w-0 flex-1 mr-3">
                            <p className={`truncate font-semibold ${textPrimaryClass}`}>{msg.fileName}</p>
                            <p className={`text-[9px] ${textMutedClass}`}>{formatFileSize(msg.fileSize)}</p>
                          </div>
                          <div className="flex items-center space-x-2 shrink-0">
                            {msg.expiresAt && (
                              <span className={`flex items-center space-x-0.5 ${textMutedClass} mr-1`} title={getRemainingTimeText(msg.expiresAt)}>
                                <Clock className="h-3 w-3" />
                                <span className="truncate max-w-[65px] font-semibold">{getRemainingTimeText(msg.expiresAt).replace(' left', '')}</span>
                              </span>
                            )}
                            <button 
                              onClick={() => router.push(`${window.location.pathname}?mediaId=${msg.messageId}`)} 
                              className={`p-1 ${actionBtnHoverClass} rounded-full transition-colors cursor-pointer ${textSecondaryClass}`} 
                              title="Open Preview"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                            <button 
                              onClick={() => handleDownloadFile(msg.text, msg.fileName || 'image.jpg')} 
                              className={`p-1 ${actionBtnHoverClass} rounded-full transition-colors cursor-pointer ${textSecondaryClass}`} 
                              title="Download"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Render Video Message */}
                    {msg.type === 'video' && (
                      <div className="flex flex-col w-64 max-w-full">
                        <div className="relative rounded-xl overflow-hidden mb-1.5 border border-white/5 bg-black">
                          <video
                            src={msg.text}
                            className="max-h-60 w-full object-contain rounded-lg"
                            controls
                            preload="metadata"
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1 px-0.5 text-[10px]">
                          <div className="flex flex-col min-w-0 flex-1 mr-3">
                            <p className={`truncate font-semibold ${textPrimaryClass}`}>{msg.fileName}</p>
                            <p className={`text-[9px] ${textMutedClass}`}>{formatFileSize(msg.fileSize)}</p>
                          </div>
                          <div className="flex items-center space-x-2 shrink-0">
                            {msg.expiresAt && (
                              <span className={`flex items-center space-x-0.5 ${textMutedClass} mr-1`} title={getRemainingTimeText(msg.expiresAt)}>
                                <Clock className="h-3 w-3" />
                                <span className="truncate max-w-[65px] font-semibold">{getRemainingTimeText(msg.expiresAt).replace(' left', '')}</span>
                              </span>
                            )}
                            <button 
                              onClick={() => router.push(`${window.location.pathname}?mediaId=${msg.messageId}`)} 
                              className={`p-1 ${actionBtnHoverClass} rounded-full transition-colors cursor-pointer ${textSecondaryClass}`} 
                              title="Open Preview"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                            <button 
                              onClick={() => handleDownloadFile(msg.text, msg.fileName || 'video.mp4')} 
                              className={`p-1 ${actionBtnHoverClass} rounded-full transition-colors cursor-pointer ${textSecondaryClass}`} 
                              title="Download"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Render File/PDF Message */}
                    {msg.type === 'file' && (
                      <div className="flex flex-col w-64 sm:w-72">
                        <div className={`flex items-center space-x-3 p-3 rounded-xl ${fileContainerBgClass}`}>
                          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBgClass}`}>
                            {msg.mimeType === 'application/pdf' ? (
                              <FileText className="h-5.5 w-5.5" />
                            ) : (
                              <FileIcon className="h-5.5 w-5.5" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`truncate text-xs font-bold leading-tight ${textPrimaryClass}`}>
                              {msg.fileName || 'Attached File'}
                            </p>
                            <p className={`text-[10px] mt-1 ${textMutedClass}`}>
                              {formatFileSize(msg.fileSize)} • {msg.mimeType === 'application/pdf' ? 'PDF' : msg.fileName?.split('.').pop()?.toUpperCase() || 'FILE'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-2.5 px-0.5 text-[10px]">
                          {msg.expiresAt && (
                            <span className={`flex items-center space-x-1 ${textMutedClass}`} title={getRemainingTimeText(msg.expiresAt)}>
                              <Clock className="h-3 w-3" />
                              <span className="font-semibold">{getRemainingTimeText(msg.expiresAt)}</span>
                            </span>
                          )}
                          <div className="flex items-center space-x-3 ml-auto">
                            <button 
                              onClick={() => router.push(`${window.location.pathname}?mediaId=${msg.messageId}`)} 
                              className={`flex items-center space-x-1 font-semibold hover:underline cursor-pointer ${textSecondaryClass}`}
                            >
                              <ExternalLink className="h-3 w-3" />
                              <span>Open</span>
                            </button>
                            <button 
                              onClick={() => handleDownloadFile(msg.text, msg.fileName || 'download')} 
                              className={`flex items-center space-x-1 font-semibold hover:underline cursor-pointer ${textSecondaryClass}`}
                            >
                              <Download className="h-3 w-3" />
                              <span>Download</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Render Text Message */}
                    {msg.type === 'text' && (
                      <p className="text-sm whitespace-pre-wrap break-words leading-relaxed select-text">
                        {msg.text}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Timestamp Info - Rendered Below the Bubble */}
              <div className={`flex w-full ${isMe ? 'justify-end pr-1.5' : 'justify-start pl-1.5'} text-[10px] text-text-secondary/65 font-medium`}>
                <span>{formattedTime}</span>
              </div>
            </div>
          </div>
        </React.Fragment>
      );
    });
  }, [messages, activeUploads, user?.uid]);

  return (
    <div className="fixed inset-0 flex h-[100dvh] max-h-[100dvh] w-screen bg-background text-text-primary overflow-hidden select-none">

      {/* Left Panel - Hidden on mobile when viewing a conversation */}
      <div className="hidden md:block md:w-[400px] shrink-0 h-full relative">
        <LeftPanel />
      </div>

      {/* Right Panel - Active Chat Screen */}
      <div id="chat-right-panel-wrapper" className="flex flex-col flex-1 h-full max-h-full bg-background relative p-0 overflow-hidden [will-change:height,transform]">
        <div className="flex flex-col flex-1 h-full max-h-full bg-surface border-none overflow-hidden shadow-none">

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
          <div className="flex h-16 items-center justify-between border-b border-border-primary bg-surface px-3 sm:px-4 md:px-6 lg:px-7">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">

              {/* Back Button (Mobile only) */}
              <button
                onClick={() => router.push("/home")}
                className="md:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background border border-border-primary text-text-secondary hover:text-text-primary hover:bg-surface transition-all duration-200"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              {/* Recipient */}
              {recipient && (
                <div className="flex items-center gap-3 min-w-0 flex-1">

                  {/* Avatar */}
                  <div className="relative h-10 w-10 sm:h-11 sm:w-11 shrink-0 rounded-full overflow-hidden border border-border-primary bg-surface flex items-center justify-center">
                    {recipient.photoURL ? (
                      <img
                        src={recipient.photoURL}
                        alt={recipient.displayName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-text-secondary">
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
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface bg-success" />
                    )}
                  </div>

                  {/* Name + Status */}
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm font-semibold text-text-primary">
                      {recipient.displayName}
                    </h4>

                    <p className="truncate text-xs text-text-secondary mt-0.5">
                      {recipient.status === "online"
                        ? "Online"
                        : formatLastSeen(recipient.lastSeen)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* More Button */}
            <button
              className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-text-secondary hover:text-text-primary hover:bg-background transition-all duration-200"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          </div>

          {/* Message History */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5 md:px-7 md:py-6 lg:px-8 lg:py-7 space-y-4">
            {loadingMessages ? (
              <div className="flex flex-col items-center justify-center h-full space-y-3">
                <RefreshCw className="h-7 w-7 animate-spin text-primary/50" />
                <span className="text-xs text-text-secondary font-semibold tracking-wider uppercase animate-pulse">
                  Syncing Conversation
                </span>
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
              renderedMessages
            )}
            <div ref={messagesEndRef} />
          </div>
 
          {/* Input Bar Area */}
          <div className="border-t border-border-primary bg-surface px-3 py-3 sm:px-4 sm:py-4 md:px-6 md:py-5 lg:px-7 lg:py-6">
            <form
              onSubmit={handleTextSubmit}
              className="flex items-center gap-2 sm:gap-3"
            >

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
                className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-background border border-border-primary text-text-secondary hover:text-text-primary hover:bg-surface transition-all duration-200 cursor-pointer"
                title="Attach Image/File"
              >
                <Paperclip className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
              </button>

              {/* Emoji Button */}
              <div ref={emojiRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className={`flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full border transition-all duration-200 cursor-pointer ${showEmojiPicker
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-background border-border-primary text-text-secondary hover:text-text-primary hover:bg-surface"
                    }`}
                  title="Add Emoji"
                >
                  <Smile className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                </button>

                {/* Emoji Picker */}
                {showEmojiPicker && (
                  <EmojiPicker
                    onSelect={handleEmojiClick}
                    onClose={() => setShowEmojiPicker(false)}
                  />
                )}
              </div>

              {/* Message Input */}
              <input
                ref={inputRef}
                type="text"
                placeholder={
                  recipient
                    ? `Message ${recipient.displayName}...`
                    : "Write a message..."
                }
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="
        flex-1
        min-w-0
        rounded-full
        border border-border-primary
        bg-background
        px-4 sm:px-5
        py-2.5
        text-base md:text-sm
        text-text-primary
        placeholder:text-text-secondary/50
        outline-none
        transition-all
        duration-200
        hover:border-text-secondary
        focus:border-primary
        focus:ring-2
        focus:ring-primary/20
      "
              />

              {/* Send Button */}
              <button
                type="submit"
                onMouseDown={(e) => e.preventDefault()}
                disabled={sending || !inputText.trim()}
                className="
        flex
        h-9 w-9
        sm:h-10 sm:w-10
        shrink-0
        items-center
        justify-center
        rounded-full
        bg-primary
        text-white
        shadow-sm
        transition-all
        duration-200
        hover:scale-105
        active:scale-95
        disabled:opacity-40
        disabled:cursor-not-allowed
      "
              >
                <Send className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
              </button>

            </form>
          </div>
        </div>
      </div>
      {viewedMediaId && (
        <MediaViewer
          mediaId={viewedMediaId}
          messages={messages}
          onClose={() => {
            router.back();
          }}
          onNavigate={(nextId) => {
            const cleanPath = window.location.pathname;
            router.replace(`${cleanPath}?mediaId=${nextId}`);
          }}
        />
      )}
    </div>
  );
}
