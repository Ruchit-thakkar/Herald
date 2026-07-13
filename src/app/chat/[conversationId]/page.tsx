'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { auth, db } from '@/lib/firebase';
import MediaViewer from '@/components/MediaViewer';
import { ref, onValue, push, update, get, set, remove } from 'firebase/database';
import LeftPanel from '@/components/LeftPanel';
import ChatHeader, { RecipientProfile } from '@/components/chat/ChatHeader';
import ChatMessages, { Message } from '@/components/chat/ChatMessages';
import ChatComposer from '@/components/chat/ChatComposer';
import { ShieldAlert, X } from 'lucide-react';

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
  const [errorBanner, setErrorBanner] = useState('');
  const [conversation, setConversation] = useState<any>(null);

  const xhrRefs = useRef<{ [tempId: string]: XMLHttpRequest }>({});

  // Sync layout dimensions to Visual Viewport directly to bypass React render lags.
  // Using direct DOM manipulation prevents asynchronous React rendering cycles,
  // ensuring the Chat Composer stays pinned to the keyboard with 0ms delay.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const visualViewport = window.visualViewport;

    const handler = () => {
      const wrapper = document.getElementById('chat-right-panel-wrapper');
      if (wrapper) {
        const isMobile = window.innerWidth < 768; // Tailwind md breakpoint is 768px
        if (isMobile) {
          wrapper.style.position = 'absolute';
          wrapper.style.top = `${visualViewport.offsetTop}px`;
          wrapper.style.left = `${visualViewport.offsetLeft}px`;
          wrapper.style.width = `${visualViewport.width}px`;
          wrapper.style.height = `${visualViewport.height}px`;
        } else {
          // Reset styling for desktop layouts so they use normal CSS flow
          wrapper.style.position = '';
          wrapper.style.top = '';
          wrapper.style.left = '';
          wrapper.style.width = '';
          wrapper.style.height = '';
        }
      }
    };

    visualViewport.addEventListener('resize', handler);
    visualViewport.addEventListener('scroll', handler);
    window.addEventListener('resize', handler);

    // Run initial alignment
    handler();

    return () => {
      visualViewport.removeEventListener('resize', handler);
      visualViewport.removeEventListener('scroll', handler);
      window.removeEventListener('resize', handler);
    };
  }, []);

  // Prevent scroll of document body when mobile virtual keyboard triggers viewport offset
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const preventDocumentScroll = () => {
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };

    const handleFocus = () => {
      setTimeout(() => {
        window.scrollTo(0, 0);
      }, 30);
    };

    window.addEventListener('scroll', preventDocumentScroll, { passive: true });
    window.addEventListener('focusin', handleFocus, { passive: true });

    return () => {
      window.removeEventListener('scroll', preventDocumentScroll);
      window.removeEventListener('focusin', handleFocus);
    };
  }, []);

  // Update receiver active conversation focus mapping
  useEffect(() => {
    if (!user?.uid || !conversationId) return;
    const activeRef = ref(db, `activeConversation/${user.uid}`);
    set(activeRef, conversationId);
    return () => {
      remove(activeRef).catch(e => console.error('Error removing active conversation:', e));
    };
  }, [user?.uid, conversationId]);

  // Fetch Conversation metadata and Recipient details
  useEffect(() => {
    if (!user || !conversationId) return;

    const convRef = ref(db, `conversations/${conversationId}`);
    get(convRef).then((snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setConversation(data);
        const recipientUid = Object.keys(data.participants).find(uid => uid !== user.uid) || '';

        if (recipientUid) {
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

      await set(ref(db, `messages/${conversationId}/${newMsgRef.key}`), msgPayload);
      await set(ref(db, `conversations/${conversationId}`), conversationMeta);

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

      fetch('/api/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: recipient.uid,
          conversationId,
          messageText: text,
          messageType: type,
          fileName,
          senderName: profile.displayName || user.displayName || 'Someone',
          senderPhoto: profile.photoURL || ''
        })
      }).catch(err => console.error('Error calling send-push API:', err));

      setInputText('');
    } catch (err: any) {
      console.error('Error sending message:', err);
      triggerError('Failed to send message.');
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

      const cleanupPath = `expiringUploads/${messageId}`;
      const cleanupPayload = {
        conversationId,
        fileId: fileMetadata.fileId,
        expiresAt: fileMetadata.expiresAt,
        senderId: user.uid,
        receiverId: recipient.uid
      };
      await set(ref(db, cleanupPath), cleanupPayload);

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

      fetch('/api/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: recipient.uid,
          conversationId,
          messageText: fileUrl,
          messageType: type,
          fileName: fileMetadata.fileName,
          senderName: profile.displayName || user.displayName || 'Someone',
          senderPhoto: profile.photoURL || ''
        })
      }).catch(err => console.error('Error calling send-push API for file:', err));

    } catch (err: any) {
      console.error('Error saving file metadata:', err);
      throw err;
    }
  };

  const validateFile = (file: File) => {
    if (file.size === 0) return 'File is empty.';
    const MAX_SIZE = 25 * 1024 * 1024;
    if (file.size > MAX_SIZE) return 'File is too large (max 25MB).';
    const blockedExtensions = ['.exe', '.bat', '.cmd', '.sh', '.msi', '.com', '.vbs', '.scr'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (blockedExtensions.includes(ext)) return 'Executable files are not allowed.';
    const blockedMimeTypes = ['application/x-msdownload', 'application/x-sh', 'application/x-bash', 'application/x-csh', 'application/x-dosexec'];
    if (blockedMimeTypes.includes(file.type)) return 'Executable files are not allowed.';
    return null;
  };

  const startUploadFlow = async (tempMsg: Message) => {
    const tempId = tempMsg.messageId;
    const file = tempMsg.rawFile!;

    setActiveUploads(prev =>
      prev.map(m => (m.messageId === tempId ? { ...m, status: 'uploading', progress: 0 } : m))
    );

    try {
      const authRes = await fetch('/api/imagekit-auth');
      if (!authRes.ok) throw new Error('Failed to get upload credentials');
      const authData = await authRes.json();
      const { token, expire, signature, publicKey } = authData;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileName', file.name);
      formData.append('publicKey', publicKey);
      formData.append('signature', signature);
      formData.append('token', token);
      formData.append('expire', expire.toString());
      formData.append('folder', 'Herald/uploads');

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

            setActiveUploads(prev =>
              prev.map(m => (m.messageId === tempId ? { ...m, status: 'sending', progress: 100 } : m))
            );

            const fileType: 'image' | 'video' | 'file' = file.type.startsWith('image/')
              ? 'image'
              : file.type.startsWith('video/')
              ? 'video'
              : 'file';

            const uploadedAt = Date.now();
            const expiresAt = uploadedAt + 24 * 60 * 60 * 1000;

            const finalMessageId = push(ref(db, `messages/${conversationId}`)).key || `file_${Date.now()}`;
            const fileMetadata = { fileId, fileName: file.name, fileSize: file.size, mimeType: file.type, uploadedAt, expiresAt };

            await handleSendFileMessage(finalMessageId, url, fileType, fileMetadata);

            setActiveUploads(prev => prev.filter(m => m.messageId !== tempId));
            delete xhrRefs.current[tempId];
          } catch (err) {
            console.error('Error completing file metadata save:', err);
            setActiveUploads(prev => prev.map(m => (m.messageId === tempId ? { ...m, status: 'failed' } : m)));
          }
        } else {
          setActiveUploads(prev => prev.map(m => (m.messageId === tempId ? { ...m, status: 'failed' } : m)));
        }
      };

      xhr.onerror = () => {
        setActiveUploads(prev => prev.map(m => (m.messageId === tempId ? { ...m, status: 'failed' } : m)));
      };

      xhr.send(formData);
    } catch (err) {
      console.error('Upload process crash:', err);
      setActiveUploads(prev => prev.map(m => (m.messageId === tempId ? { ...m, status: 'failed' } : m)));
    }
  };

  const uploadAttachment = async (file: File) => {
    const errorMsg = validateFile(file);
    if (errorMsg) {
      triggerError(errorMsg);
      return;
    }
    if (!user || !recipient || !conversationId) return;

    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const fileType = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file';

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

  const formatLastSeen = (timestamp?: number) => {
    if (!timestamp) return 'Offline';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);

    if (diffMins < 1) return 'Online';
    if (diffMins < 60) return `Active ${diffMins}m ago`;
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
      window.open(url, '_blank');
    }
  };

  const getRemainingTimeText = (expiresAt?: number) => {
    if (!expiresAt) return '';
    const diff = expiresAt - Date.now();
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / (60 * 60 * 1000));
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
  };

  return (
    <div className="fixed inset-0 flex w-screen h-screen bg-background text-text-primary overflow-hidden select-none">
      {/* Left Panel - Hidden on mobile when viewing a conversation */}
      <div className="hidden md:block md:w-[400px] shrink-0 h-full relative border-r border-border-primary">
        <LeftPanel />
      </div>

      {/* Right Panel - Active Chat Screen */}
      <div
        id="chat-right-panel-wrapper"
        className="
          flex flex-col flex-1 bg-background overflow-hidden
          fixed inset-x-0 bottom-0 md:relative md:inset-auto md:h-full md:transform-none
          [will-change:top,height,width,left]
        "
      >
        <div className="flex flex-col w-full h-full bg-surface overflow-hidden relative">
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

          {/* Chat Header Component */}
          <ChatHeader
            recipient={recipient}
            onBack={() => router.push("/home")}
            formatLastSeen={formatLastSeen}
          />

          {/* Chat Messages Component */}
          <ChatMessages
            messages={messages}
            activeUploads={activeUploads}
            currentUserId={user?.uid}
            loading={loadingMessages}
            onCancelUpload={handleCancelUpload}
            onRetryUpload={handleRetryUpload}
            onViewMedia={(messageId) => router.push(`${window.location.pathname}?mediaId=${messageId}`)}
            formatFileSize={formatFileSize}
            handleDownloadFile={handleDownloadFile}
            getRemainingTimeText={getRemainingTimeText}
          />

          {/* Chat Composer Component */}
          <ChatComposer
            inputText={inputText}
            setInputText={setInputText}
            sending={sending}
            onSendMessage={(text) => handleSendMessage(text, 'text')}
            onUploadFile={uploadAttachment}
            recipientDisplayName={recipient?.displayName}
          />
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
