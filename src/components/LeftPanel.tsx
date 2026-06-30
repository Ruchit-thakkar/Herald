'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { ref, onValue, get } from 'firebase/database';
import {
  ShieldCheck, Search, Plus, User as UserIcon, Settings as SettingsIcon, LogOut,
  ChevronRight, Circle, RefreshCw, Sun, Moon
} from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

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
  const { theme, toggleTheme } = useTheme();

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
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
  const [recipientUpdates, setRecipientUpdates] = useState<{ [uid: string]: { status?: 'online' | 'offline'; photoURL?: string | null; displayName?: string; username?: string } }>({});

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

  // Profile avatar trigger logic for click/hover with close delay hold (2s-3s)
  const handleAvatarClick = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsMenuOpen(!isMenuOpen);
  };

  const handleAvatarMouseEnter = () => {
    if (window.innerWidth >= 768) {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      setIsMenuOpen(true);
    }
  };

  const handleAvatarMouseLeave = () => {
    if (window.innerWidth >= 768) {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      // Hold open for 2.5 seconds before closing
      hoverTimeoutRef.current = setTimeout(() => {
        setIsMenuOpen(false);
      }, 1000);
    }
  };

  return (
    <div className="flex h-full w-full flex-col border-r border-border-primary bg-surface text-text-primary">
      {/* Top Header */}
      <div className="relative flex h-16 items-center justify-between px-5 border-b border-border-primary">
        <div className="flex items-center space-x-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl overflow-hidden bg-card-bg border border-border-primary shadow-sm">
            <img src="https://ik.imagekit.io/devnext/Harald%20?updatedAt=1782817476464" alt="Herald Logo" className="h-full w-full object-cover" />
          </div>
          <span className="text-lg font-bold tracking-tight text-gradient">Herald</span>
        </div>

        <div className="flex items-center space-x-3">
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-background border border-border-primary text-text-secondary hover:text-text-primary hover:border-text-secondary cursor-pointer hover-scale"
            title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {theme === 'dark' ? (
              <Sun className="h-4.5 w-4.5 animate-in spin-in-90 duration-300" />
            ) : (
              <Moon className="h-4.5 w-4.5 animate-in spin-in-90 duration-300" />
            )}
          </button>

          {/* User Profile Menu Dropdown */}
          <div
            ref={menuRef}
            className="relative z-20"
            onMouseEnter={handleAvatarMouseEnter}
            onMouseLeave={handleAvatarMouseLeave}
          >
            <button
              onClick={handleAvatarClick}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface border border-border-primary hover:border-primary overflow-hidden cursor-pointer hover-scale"
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
              <div className="absolute right-0 mt-2 w-48 rounded-2xl border border-border-primary/60 bg-card-bg/95 p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
                <button
                  onClick={() => { router.push('/profile'); setIsMenuOpen(false); }}
                  className="flex w-full items-center space-x-2.5 rounded-xl px-3 py-2.5 text-sm text-text-secondary hover:bg-surface hover:text-text-primary transition-all duration-200 text-left cursor-pointer hover:pl-4"
                >
                  <UserIcon className="h-4.5 w-4.5 text-text-secondary" />
                  <span>Profile</span>
                </button>
                <button
                  onClick={() => { router.push('/settings'); setIsMenuOpen(false); }}
                  className="flex w-full items-center space-x-2.5 rounded-xl px-3 py-2.5 text-sm text-text-secondary hover:bg-surface hover:text-text-primary transition-all duration-200 text-left cursor-pointer hover:pl-4"
                >
                  <SettingsIcon className="h-4.5 w-4.5 text-text-secondary" />
                  <span>Settings</span>
                </button>
                <div className="my-1 border-t border-border-primary/60"></div>
                <button
                  onClick={() => { logout(); setIsMenuOpen(false); }}
                  className="flex w-full items-center space-x-2.5 rounded-xl px-3 py-2.5 text-sm text-error hover:bg-error/10 hover:text-error transition-all duration-200 text-left cursor-pointer hover:pl-4"
                >
                  <LogOut className="h-4.5 w-4.5 text-error" />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-border-primary bg-background py-2 pl-9 pr-4 text-sm text-text-primary placeholder-text-secondary/50 outline-none hover:border-text-secondary focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200"
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-2 pb-20">
        {loading ? (
          <div className="flex flex-col items-center justify-center pt-20 space-y-3">
            <RefreshCw className="h-6 w-6 animate-spin text-primary/50" />
            <span className="text-xs text-text-secondary uppercase tracking-widest font-semibold animate-pulse">Syncing chats</span>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-24 text-center px-4">
            <span className="text-sm font-medium text-text-secondary">No conversations found</span>
            <p className="text-xs text-text-secondary/70 mt-1 max-w-xs">
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
                className={`relative flex w-full items-center space-x-3.5 rounded-2xl px-4 py-3.5 mt-2 transition-all duration-200 text-left border cursor-pointer ${
                  isActive 
                    ? 'bg-card-bg border-border-primary/80 shadow-md shadow-slate-100/10' 
                    : 'bg-transparent border-transparent hover:bg-card-bg/40 hover:border-border-primary/20'
                }`}
              >
                {/* Recipient Avatar */}
                <div className="relative h-12 w-12 shrink-0 rounded-full bg-surface border border-border-primary/60 overflow-hidden flex items-center justify-center">
                  {conv.recipient.photoURL ? (
                    <img 
                      src={conv.recipient.photoURL} 
                      alt={conv.recipient.displayName} 
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-semibold text-text-secondary">{initials}</span>
                  )}
                  
                  {/* Status Indicator Dot */}
                  {conv.recipient.status === 'online' && (
                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface bg-success"></span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-sm font-bold text-text-primary">
                      {conv.recipient.displayName}
                    </span>
                    <span className="text-[10px] text-text-secondary font-medium tracking-tight">
                      {formatTime(conv.updatedAt)}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between mt-1">
                    <p className="truncate text-xs text-text-secondary/90 flex-1 mr-2">
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
        className="absolute bottom-5 right-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20 cursor-pointer hover-scale"
        title="Start New Chat"
      >
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
}
