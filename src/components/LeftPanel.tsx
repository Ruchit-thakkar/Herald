'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { ref, onValue, get } from 'firebase/database';
import { 
  ShieldCheck, Search, Plus, User as UserIcon, Settings as SettingsIcon, LogOut, 
  ChevronRight, Circle, RefreshCw
} from 'lucide-react';

interface RecipientProfile {
  uid: string;
  username: string;
  displayName: string;
  photoURL?: string | null;
  status?: 'online' | 'offline';
  lastSeen?: number;
}

interface ConversationItem {
  conversationId: string;
  lastMessage: string;
  lastSenderId: string;
  updatedAt: number;
  recipient: RecipientProfile;
}

export default function LeftPanel() {
  const router = useRouter();
  const params = useParams();
  const { user, profile, logout } = useAuth();
  
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const menuRef = useRef<HTMLDivElement>(null);
  const activeConversationId = params?.conversationId as string;

  // Handle outside click to close profile menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch conversations and recipient details in real time
  useEffect(() => {
    if (!user) return;

    const userConvRef = ref(db, `userConversations/${user.uid}`);
    setLoading(true);

    const unsubscribe = onValue(userConvRef, (snapshot) => {
      if (!snapshot.exists()) {
        setConversations([]);
        setLoading(false);
        return;
      }

      const data = snapshot.val();
      const rawItems = Object.values(data) as any[];

      // Resolve participants and attach listener for user details and presence
      const resolvedList: ConversationItem[] = rawItems.map((item) => {
        // Find recipient UID
        const recipientUid = Object.keys(item.participants).find(uid => uid !== user.uid) || '';
        
        return {
          conversationId: item.conversationId,
          lastMessage: typeof item.lastMessage === 'object' ? item.lastMessage?.text || '' : item.lastMessage || '',
          lastSenderId: typeof item.lastMessage === 'object' ? item.lastMessage?.senderId || '' : item.lastSenderId || '',
          updatedAt: item.updatedAt || item.createdAt || Date.now(),
          recipient: {
            uid: recipientUid,
            username: item.participants[recipientUid]?.username || 'User',
            displayName: item.participants[recipientUid]?.displayName || 'Herald User',
            photoURL: item.participants[recipientUid]?.photoURL || null,
            status: 'offline'
          }
        };
      });

      // Sort newest first
      resolvedList.sort((a, b) => b.updatedAt - a.updatedAt);
      setConversations(resolvedList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching chats:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Nested listener for real-time recipient status updates (presence and profile updates)
  const [recipientUpdates, setRecipientUpdates] = useState<{ [uid: string]: { status?: 'online'|'offline'; photoURL?: string|null; displayName?: string; username?: string } }>({});
  
  useEffect(() => {
    if (conversations.length === 0) return;

    const unsubscribes: (() => void)[] = [];

    conversations.forEach((conv) => {
      const rUid = conv.recipient.uid;
      if (!rUid) return;

      // 1. Listen to presence
      const presenceRef = ref(db, `presence/${rUid}`);
      const unsubPresence = onValue(presenceRef, (snap) => {
        const isOnline = snap.exists() && snap.val()?.online === true;
        setRecipientUpdates(prev => ({
          ...prev,
          [rUid]: {
            ...prev[rUid],
            status: isOnline ? 'online' : 'offline'
          }
        }));
      });
      unsubscribes.push(unsubPresence);

      // 2. Listen to profile info (avatar/displayName changes)
      const profileRef = ref(db, `users/${rUid}`);
      const unsubProfile = onValue(profileRef, (snap) => {
        if (snap.exists()) {
          const uData = snap.val();
          setRecipientUpdates(prev => ({
            ...prev,
            [rUid]: {
              ...prev[rUid],
              photoURL: uData.photoURL,
              displayName: uData.displayName,
              username: uData.username || ''
            }
          }));
        }
      });
      unsubscribes.push(unsubProfile);
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [conversations]);

  // Formatter for timestamps
  const formatTime = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    
    // Check if today
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // Check if yesterday
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    
    // Default date format
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Filter conversations locally based on search input
  const filteredConversations = conversations.map(conv => {
    const update = recipientUpdates[conv.recipient.uid];
    return {
      ...conv,
      recipient: {
        ...conv.recipient,
        displayName: update?.displayName || conv.recipient.displayName,
        photoURL: update?.photoURL !== undefined ? update?.photoURL : conv.recipient.photoURL,
        status: update?.status || conv.recipient.status,
        username: update?.username || conv.recipient.username
      }
    };
  }).filter(conv => {
    const searchLower = searchQuery.toLowerCase();
    return (
      conv.recipient.displayName.toLowerCase().includes(searchLower) ||
      conv.recipient.username.toLowerCase().includes(searchLower)
    );
  });

  const getInitials = (name?: string | null) => {
    if (!name || typeof name !== 'string') return '?';
    return name
      .split(' ')
      .filter(Boolean)
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Profile avatar trigger logic for click/hover
  const handleAvatarClick = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleAvatarMouseEnter = () => {
    if (window.innerWidth >= 768) {
      setIsMenuOpen(true);
    }
  };

  const handleAvatarMouseLeave = () => {
    if (window.innerWidth >= 768) {
      setIsMenuOpen(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col border-r border-slate-900 bg-[#0B0F19] text-white">
      {/* Top Header */}
      <div className="relative flex h-16 items-center justify-between px-5 border-b border-slate-900">
        <div className="flex items-center space-x-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shadow-sm">
            <img src="https://ik.imagekit.io/devnext/Harald" alt="Herald Logo" className="h-full w-full object-cover" />
          </div>
          <span className="text-lg font-bold tracking-tight text-gradient">Herald</span>
        </div>

        {/* User Profile Menu Dropdown */}
        <div 
          ref={menuRef}
          className="relative z-20"
          onMouseEnter={handleAvatarMouseEnter}
          onMouseLeave={handleAvatarMouseLeave}
        >
          <button 
            onClick={handleAvatarClick}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 border border-slate-700 hover:border-emerald-500 overflow-hidden cursor-pointer transition-colors"
          >
            {profile?.photoURL ? (
              <img 
                src={profile.photoURL} 
                alt={profile.displayName || 'Me'} 
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-xs font-bold text-slate-300">
                {profile ? getInitials(profile.displayName) : 'ME'}
              </span>
            )}
          </button>

          {/* Hover/Click Dropdown Menu */}
          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-850 bg-[#0F1626] p-1.5 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150">
              <button 
                onClick={() => { router.push('/profile'); setIsMenuOpen(false); }}
                className="flex w-full items-center space-x-2.5 rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors text-left"
              >
                <UserIcon className="h-4.5 w-4.5 text-slate-400" />
                <span>Profile</span>
              </button>
              <button 
                onClick={() => { router.push('/settings'); setIsMenuOpen(false); }}
                className="flex w-full items-center space-x-2.5 rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors text-left"
              >
                <SettingsIcon className="h-4.5 w-4.5 text-slate-400" />
                <span>Settings</span>
              </button>
              <div className="my-1 border-t border-slate-800"></div>
              <button 
                onClick={() => { logout(); setIsMenuOpen(false); }}
                className="flex w-full items-center space-x-2.5 rounded-lg px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors text-left"
              >
                <LogOut className="h-4.5 w-4.5 text-red-400" />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input 
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-850 bg-[#0A0E1A] py-2 pl-9 pr-4 text-sm text-white placeholder-slate-600 outline-none hover:border-slate-800 focus:border-emerald-500/50 transition-colors"
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-2 pb-20">
        {loading ? (
          <div className="flex flex-col items-center justify-center pt-20 space-y-3">
            <RefreshCw className="h-6 w-6 animate-spin text-emerald-500/50" />
            <span className="text-xs text-slate-500 uppercase tracking-widest font-semibold animate-pulse">Syncing chats</span>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-24 text-center px-4">
            <span className="text-sm font-medium text-slate-500">No conversations found</span>
            <p className="text-xs text-slate-600 mt-1 max-w-xs">
              {searchQuery ? 'Try matching username or display name' : 'Click the button below to start a chat.'}
            </p>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isActive = activeConversationId === conv.conversationId;
            const initials = getInitials(conv.recipient.displayName);
            
            return (
              <button
                key={conv.conversationId}
                onClick={() => router.push(`/chat/${conv.conversationId}`)}
                className={`relative flex w-full items-center space-x-3 rounded-xl px-3 py-3 mt-1.5 transition-all text-left ${
                  isActive 
                    ? 'bg-[#151D30] border border-slate-800/80 shadow-md shadow-black/10' 
                    : 'bg-transparent border border-transparent hover:bg-slate-900/60'
                }`}
              >
                {/* Recipient Avatar */}
                <div className="relative h-11 w-11 shrink-0 rounded-full bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center">
                  {conv.recipient.photoURL ? (
                    <img 
                      src={conv.recipient.photoURL} 
                      alt={conv.recipient.displayName} 
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-semibold text-slate-300">{initials}</span>
                  )}
                  
                  {/* Status Indicator Dot */}
                  {conv.recipient.status === 'online' && (
                    <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border border-[#0B0F19] bg-emerald-500"></span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-sm font-semibold text-white">
                      {conv.recipient.displayName}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {formatTime(conv.updatedAt)}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="truncate text-xs text-slate-400">
                      {conv.lastSenderId === user?.uid ? 'You: ' : ''}{conv.lastMessage || 'No messages yet'}
                    </p>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Floating Action Button '+' */}
      <button 
        onClick={() => router.push('/new-chat')}
        className="absolute bottom-5 right-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 hover:shadow-emerald-500/30 hover:-translate-y-0.5 transition-all duration-150 cursor-pointer active:translate-y-0 active:scale-95"
        title="Start New Chat"
      >
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
}
