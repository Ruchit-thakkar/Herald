'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { auth, db } from '@/lib/firebase';
import { ref, get, child, query, orderByKey, startAt, endAt, limitToFirst, update, set } from 'firebase/database';
import { ChevronLeft, Search, User as UserIcon, MessageSquarePlus, RefreshCw, X, ShieldAlert } from 'lucide-react';

interface SearchResult {
  uid: string;
  username: string;
  displayName: string;
  photoURL?: string | null;
}

export default function NewChatPage() {
  const router = useRouter();
  const { user, profile } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    // Clean search input: lowercase and remove leading '@'
    let cleanQuery = searchQuery.trim().toLowerCase();
    if (cleanQuery.startsWith('@')) {
      cleanQuery = cleanQuery.slice(1);
    }
    
    if (!cleanQuery) return;

    setSearching(true);
    setResults([]);
    setErrorMessage('');

    try {
      const usernamesRef = ref(db, 'usernames');
      const prefixQuery = query(
        usernamesRef,
        orderByKey(),
        startAt(cleanQuery),
        endAt(cleanQuery + '\uf8ff'),
        limitToFirst(15)
      );

      const snap = await get(prefixQuery);
      if (snap.exists()) {
        const resolved: SearchResult[] = [];
        
        // Loop through usernames and fetch user details
        const promises: Promise<void>[] = [];
        
        snap.forEach((childSnap) => {
          const uName = childSnap.key;
          const uVal = childSnap.val();
          
          if (uVal.uid !== user.uid) { // Exclude ourselves
            const detailPromise = get(ref(db, `users/${uVal.uid}`)).then((userSnap) => {
              if (userSnap.exists()) {
                const uData = userSnap.val();
                resolved.push({
                  uid: uVal.uid,
                  username: uName,
                  displayName: uData.displayName || 'Herald User',
                  photoURL: uData.photoURL || null
                });
              }
            });
            promises.push(detailPromise);
          }
        });

        await Promise.all(promises);
        setResults(resolved);

        if (resolved.length === 0) {
          setErrorMessage('No users found matching that username.');
        }
      } else {
        setErrorMessage('No users found matching that username.');
      }
    } catch (err) {
      console.error('Error searching global users:', err);
      setErrorMessage('Failed to search database. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const handleStartChat = async (targetUser: SearchResult) => {
    // 1. Verify authenticated user is available before any database write
    if (!auth.currentUser || !user || !profile) {
      setErrorMessage('Session expired or unauthorized. Please log in again.');
      return;
    }

    setLoadingConv(true);
    setErrorMessage('');

    // Generate unique conversationId by sorting UIDs
    const sortedUids = [user.uid, targetUser.uid].sort();
    const convId = sortedUids.join('_');

    try {
      const dbRef = ref(db);
      const convCheck = await get(child(dbRef, `userConversations/${user.uid}/${convId}`));

      // If conversation already exists, just redirect
      if (convCheck.exists()) {
        router.push(`/chat/${convId}`);
        return;
      }

      // 2. Create the conversation in ONE atomic operation with all required fields matching the rules
      const conversationData = {
        participants: {
          [user.uid]: true,
          [targetUser.uid]: true
        },
        type: 'direct' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastMessage: {
          text: '',
          senderId: '',
          timestamp: Date.now()
        }
      };

      // Log auth.currentUser.uid and path before writing
      console.log(`[Firebase Auth] Write initiated by auth.currentUser.uid: ${auth.currentUser.uid}`);
      console.log(`[Firebase Path] Writing complete conversation schema to: conversations/${convId}`);

      // Set conversation in conversations node first
      await set(ref(db, `conversations/${convId}`), conversationData);

      // 3. Create the userConversations updates in a single atomic operation
      console.log(`[Firebase Auth] Write initiated by auth.currentUser.uid: ${auth.currentUser.uid}`);
      console.log(`[Firebase Path] Writing metadata index to: userConversations/${user.uid}/${convId} and userConversations/${targetUser.uid}/${convId}`);

      const userConvUpdates: any = {};
      userConvUpdates[`userConversations/${user.uid}/${convId}`] = {
        ...conversationData,
        conversationId: convId
      };
      userConvUpdates[`userConversations/${targetUser.uid}/${convId}`] = {
        ...conversationData,
        conversationId: convId
      };

      await update(ref(db), userConvUpdates);

      router.push(`/chat/${convId}`);
    } catch (err: any) {
      console.error('Error starting conversation:', err);
      // Log the exact error path and details
      const failPath = err?.path || `conversations/${convId} or userConversations`;
      console.error(`[Firebase Error] Failed to write to path: ${failPath} for UID: ${auth.currentUser?.uid}`);
      
      setErrorMessage(`Failed to start conversation. Permission denied at ${failPath}.`);
      setLoadingConv(false);
    }
  };

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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#080C14] px-4 py-8 md:py-16 text-white">
      <div className="w-full max-w-lg space-y-6">
        
        {/* Navigation & Header */}
        <div className="flex items-center justify-between pb-2">
          <button 
            onClick={() => router.back()}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F1626] border border-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-slate-500 uppercase tracking-widest">
            New Conversation
          </span>
          <div className="w-10"></div> {/* spacer */}
        </div>

        {/* Card Panel */}
        <div className="rounded-2xl border border-card-border bg-[#0F1626] p-6 md:p-8 shadow-2xl backdrop-blur-md">
          {errorMessage && (
            <div className="mb-6 rounded-lg bg-red-500/10 border border-red-500/20 p-3.5 text-sm text-red-400 flex items-start space-x-2">
              <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Global User Search Form */}
          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Search Global Users
              </label>
              <div className="relative flex space-x-2">
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500 font-semibold select-none">
                    @
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="search by username (e.g. ruchit)"
                    className="block w-full rounded-xl border border-slate-800 bg-[#0A0E1A] py-3.5 pl-8 pr-4 text-sm text-white placeholder-slate-650 outline-none hover:border-slate-750 focus:border-emerald-500 transition-colors"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={searching || !searchQuery.trim()}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-md hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  {searching ? (
                    <RefreshCw className="h-5 w-5 animate-spin" />
                  ) : (
                    <Search className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
          </form>

          {/* Results List */}
          <div className="mt-8 space-y-4">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Search Results
            </h4>

            {loadingConv ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <RefreshCw className="h-6 w-6 animate-spin text-emerald-500" />
                <span className="text-xs text-slate-400 font-medium">Initializing secure chat...</span>
              </div>
            ) : results.length > 0 ? (
              <div className="divide-y divide-slate-900 overflow-hidden rounded-xl border border-slate-850 bg-[#0A0E1A]">
                {results.map((target) => (
                  <button
                    key={target.uid}
                    onClick={() => handleStartChat(target)}
                    className="flex w-full items-center justify-between px-4 py-3.5 hover:bg-slate-900/60 text-left transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="h-10 w-10 shrink-0 rounded-full bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center">
                        {target.photoURL ? (
                          <img src={target.photoURL} alt={target.displayName} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-sm font-semibold text-slate-300">
                            {getInitials(target.displayName)}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate leading-tight">
                          {target.displayName}
                        </p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          @{target.username}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 border border-slate-800 text-slate-400 group-hover:text-emerald-400 group-hover:border-emerald-500/30 transition-all">
                      <MessageSquarePlus className="h-4.5 w-4.5" />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-slate-850 rounded-xl">
                <UserIcon className="h-8 w-8 text-slate-700 mb-2" />
                <p className="text-xs text-slate-500 max-w-xs">
                  {searchQuery ? 'No search hits.' : 'Type a username above to search globally across Herald.'}
                </p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
