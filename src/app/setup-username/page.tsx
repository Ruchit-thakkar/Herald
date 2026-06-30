'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { ref, get, child, update, serverTimestamp } from 'firebase/database';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { User as UserIcon, ArrowRight, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';

export default function SetupUsernamePage() {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [usernameError, setUsernameError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Route protection: if unauthenticated, redirect to login; if profile already exists, redirect to home
  useEffect(() => {
    if (!user) {
      router.replace('/login');
    } else if (profile) {
      router.replace('/home');
    }
  }, [user, profile, router]);

  // Set default Display Name from Google or Email prefix
  useEffect(() => {
    if (user && !profile) {
      const defaultName = user.displayName || user.email?.split('@')[0] || 'User';
      // Capitalize first letters for nicer Display Name presentation
      const formattedName = defaultName
        .split(/[._-]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      setDisplayName(formattedName);
    }
  }, [user, profile]);

  // Automatically generate suggestions when displayName is initialized or updated
  useEffect(() => {
    if (displayName.trim() && !username) {
      generateSuggestionsAndAutoSet(displayName);
    }
  }, [displayName]);

  const cleanUsernameString = (str: string) => {
    return str.toLowerCase().replace(/[^a-z0-9_]/g, '');
  };

  // Helper to generate 4 suggested usernames, check their availability in Firebase, and set the first free one
  const generateSuggestionsAndAutoSet = async (name: string) => {
    if (!user) return;
    setLoading(true);
    setError('');

    const base = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const prefix = base || 'user';

    // Suggestion formats: ruchit, ruchit47, ruchit_09, ruchit365
    const candidates = [
      prefix,
      `${prefix}${Math.floor(Math.random() * 90 + 10)}`,
      `${prefix}_09`,
      `${prefix}${Math.floor(Math.random() * 900 + 100)}`
    ];

    const available: string[] = [];
    const dbRef = ref(db);

    try {
      for (const cand of candidates) {
        if (cand.length < 3) continue;
        const snap = await get(child(dbRef, `usernames/${cand}`));
        if (!snap.exists()) {
          available.push(cand);
        }
      }

      // If we don't have enough, generate random additions
      let attempts = 0;
      while (available.length < 4 && attempts < 15) {
        attempts++;
        const randName = `${prefix}${Math.floor(Math.random() * 9000 + 1000)}`;
        const snap = await get(child(dbRef, `usernames/${randName}`));
        if (!snap.exists() && !available.includes(randName)) {
          available.push(randName);
        }
      }

      const finalSuggestions = available.slice(0, 4);
      setSuggestions(finalSuggestions);

      // Pre-fill the username field with the first suggestion if it hasn't been modified yet
      if (finalSuggestions.length > 0) {
        setUsername(finalSuggestions[0]);
        setUsernameStatus('available');
        setUsernameError('');
      }
    } catch (err) {
      console.error('Error generating suggestions:', err);
    } finally {
      setLoading(false);
    }
  };

  // Check username availability when manually editing the field
  const checkUsernameAvailability = async (uName: string) => {
    const cleanUName = cleanUsernameString(uName);
    if (cleanUName.length < 3) {
      setUsernameStatus('idle');
      setUsernameError('Username must be at least 3 characters.');
      return;
    }

    setUsernameStatus('checking');
    setUsernameError('');

    try {
      const dbRef = ref(db);
      const snapshot = await get(child(dbRef, `usernames/${cleanUName}`));

      if (snapshot.exists()) {
        setUsernameStatus('taken');
        setUsernameError('Username already taken.');
      } else {
        setUsernameStatus('available');
      }
    } catch (err) {
      console.error('Error checking username:', err);
      setUsernameError('Failed to verify username availability.');
      setUsernameStatus('idle');
    }
  };

  // Save profile to database
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const cleanUName = cleanUsernameString(username);
    if (!displayName.trim()) {
      setError('Display Name is required.');
      return;
    }
    if (cleanUName.length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (usernameStatus !== 'available') {
      setError('Please select or input an available username.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      // Double check username availability in atomic-like context
      const dbRef = ref(db);
      const snapshot = await get(child(dbRef, `usernames/${cleanUName}`));

      if (snapshot.exists()) {
        setUsernameStatus('taken');
        setError('Username was just taken. Please select another one.');
        setSaving(false);
        return;
      }

      // Write atomically to both /users/{uid} and /usernames/{username}
      const updates: any = {};
      updates[`/users/${user.uid}`] = {
        uid: user.uid,
        username: cleanUName,
        displayName: displayName.trim(),
        email: user.email || '',
        photoURL: user.photoURL || null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'online',
        lastSeen: Date.now()
      };
      updates[`/usernames/${cleanUName}`] = {
        uid: user.uid
      };

      await update(ref(db), updates);

      // Refresh AuthContext profile state
      await refreshProfile();
      
      // AuthContext will automatically redirect user to /home
    } catch (err: any) {
      console.error('Error completing username setup:', err);
      setError(err?.message || 'Failed to complete profile creation.');
    } finally {
      setSaving(false);
    }
  };

  const handleSuggestionClick = (sugg: string) => {
    setUsername(sugg);
    setUsernameStatus('available');
    setUsernameError('');
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      router.replace('/login');
    } catch (e) {
      console.error('Signout error:', e);
    } finally {
      setLoading(false);
    }
  };

  if (!user || profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-text-primary">
        <div className="flex flex-col items-center space-y-4">
          <RefreshCw className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-medium tracking-widest text-text-secondary uppercase animate-pulse">
            Loading profile wizard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8 text-text-primary">
      <div className="w-full max-w-md space-y-8">
        
        {/* Header */}
        <div className="flex flex-col items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl overflow-hidden bg-slate-900 border border-border-primary shadow-lg">
            <img src="https://ik.imagekit.io/devnext/Harald%20?updatedAt=1782817476464" alt="Herald Logo" className="h-full w-full object-cover" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold tracking-tight text-text-primary text-gradient">
            Set Up Profile
          </h2>
          <p className="mt-2 text-center text-sm text-text-secondary">
            Choose your display name and unique username
          </p>
        </div>

        {/* Card Wrapper */}
        <div className="rounded-2xl border border-border-primary bg-card-bg p-8 shadow-2xl backdrop-blur-md">
          {error && (
            <div className="mb-6 rounded-lg bg-error/10 border border-error/20 p-3 text-sm text-error">
              {error}
            </div>
          )}

          <div className="flex justify-between items-center mb-6">
            <span className="text-xs font-semibold text-primary uppercase tracking-widest">
              Register Successful
            </span>
            <button
              onClick={handleLogout}
              className="text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-6">
            {/* Display Name Input */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ruchit Thakkar"
                className="block w-full rounded-lg border border-border-primary bg-background py-3.5 px-4 text-text-primary placeholder-text-secondary/50 outline-none hover:border-text-secondary focus:border-primary transition-colors"
                required
              />
            </div>

            {/* Username Input */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Username
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-text-secondary font-semibold select-none">
                  @
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    const cleanVal = cleanUsernameString(e.target.value);
                    setUsername(cleanVal);
                    checkUsernameAvailability(cleanVal);
                  }}
                  placeholder="ruchit"
                  className="block w-full rounded-lg border border-border-primary bg-background py-3.5 pl-8 pr-4 text-text-primary placeholder-text-secondary/50 outline-none hover:border-text-secondary focus:border-primary transition-colors"
                  required
                />
              </div>
            </div>

            {/* Availability Indicator */}
            {usernameStatus === 'checking' && (
              <p className="text-xs text-text-secondary flex items-center space-x-1.5">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                <span>Checking availability...</span>
              </p>
            )}

            {usernameStatus === 'available' && (
              <p className="text-xs text-success flex items-center space-x-1.5">
                <CheckCircle className="h-4 w-4" />
                <span>Username is available!</span>
              </p>
            )}

            {usernameError && (
              <div className="rounded-lg bg-error/10 border border-error/20 p-3 text-xs text-error flex items-start space-x-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{usernameError}</span>
              </div>
            )}

            {/* Suggestions Block */}
            {suggestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-text-secondary">Suggestions:</p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((sugg) => (
                    <button
                      key={sugg}
                      type="button"
                      onClick={() => handleSuggestionClick(sugg)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all duration-150 cursor-pointer ${
                        username === sugg
                          ? 'bg-primary/20 border-primary text-primary'
                          : 'bg-background border-border-primary text-text-secondary hover:border-text-secondary hover:text-text-primary'
                      }`}
                    >
                      @{sugg}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Save Button */}
            <button
              type="submit"
              disabled={saving || loading || usernameStatus !== 'available' || !displayName.trim()}
              className="flex w-full justify-center rounded-lg bg-primary hover:bg-primary-hover px-4 py-3.5 text-sm font-semibold text-white focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md"
            >
              {saving ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <span className="flex items-center">
                  Save & Continue <ArrowRight className="ml-2 h-4 w-4" />
                </span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
