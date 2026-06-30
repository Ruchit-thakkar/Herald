'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { db, storage } from '@/lib/firebase';
import { ref, update } from 'firebase/database';
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ChevronLeft, User as UserIcon, Mail, Calendar, Lock, Camera, Check, RefreshCw, AlertTriangle } from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preset avatars for premium instant selection
  const presets = [
    'https://api.dicebear.com/7.x/bottts/svg?seed=Herald1&backgroundColor=b6e3f4',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Herald2&backgroundColor=c0aede',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Herald3&backgroundColor=d1d4f9',
    'https://api.dicebear.com/7.x/pixel-art/svg?seed=Herald4&backgroundColor=b6e3f4',
    'https://api.dicebear.com/7.x/pixel-art/svg?seed=Herald5&backgroundColor=c0aede',
    'https://api.dicebear.com/7.x/pixel-art/svg?seed=Herald6&backgroundColor=d1d4f9',
  ];

  // Set default values from profile context
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || '');
      setAvatarUrl(profile.photoURL || null);
    }
  }, [profile]);

  const handlePresetSelect = (url: string) => {
    setAvatarUrl(url);
    setSuccess(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    setError('');
    setSuccess(false);

    try {
      // 1. Try Firebase Storage upload
      const storageRef = sRef(storage, `avatars/${user.uid}/${Date.now()}_${file.name}`);
      const snap = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snap.ref);
      setAvatarUrl(downloadURL);
    } catch (err: any) {
      console.warn('Firebase Storage avatar upload failed, falling back to base64 encoding...', err);
      
      // 2. Base64 fallback (limit avatar to 1.5MB for realtime database storage)
      if (file.size > 1.5 * 1024 * 1024) {
        setError('Image file is too large. Max size is 1.5MB for profile fallback.');
        setUploading(false);
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        if (base64) {
          setAvatarUrl(base64);
        } else {
          setError('Failed to process custom image.');
        }
      };
      reader.readAsDataURL(file);
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    if (!displayName.trim()) {
      setError('Display name cannot be empty.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess(false);

    try {
      const userRef = ref(db, `users/${user.uid}`);
      await update(userRef, {
        displayName: displayName.trim(),
        photoURL: avatarUrl,
        updatedAt: Date.now()
      });

      await refreshProfile();
      setSuccess(true);
      
      // Dismiss success notice after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error saving profile changes:', err);
      setError(err?.message || 'Failed to update profile settings.');
    } finally {
      setSaving(false);
    }
  };

  const formatJoinedDate = (timestamp?: number) => {
    if (!timestamp) return 'Recently';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#080C14] px-4 py-8 md:py-16 text-white">
      <div className="w-full max-w-xl space-y-6">
        
        {/* Navigation & Header */}
        <div className="flex items-center justify-between pb-2">
          <button 
            onClick={() => router.push('/home')}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F1626] border border-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Back to Home"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-slate-500 uppercase tracking-widest">
            Profile Settings
          </span>
          <div className="w-10"></div> {/* spacer */}
        </div>

        {/* Card Body */}
        <div className="rounded-2xl border border-card-border bg-[#0F1626] p-6 md:p-8 shadow-2xl backdrop-blur-md">
          {error && (
            <div className="mb-6 rounded-lg bg-red-500/10 border border-red-500/20 p-3.5 text-sm text-red-400 flex items-start space-x-2">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3.5 text-sm text-emerald-400 flex items-start space-x-2">
              <Check className="h-5 w-5 shrink-0 mt-0.5" />
              <span>Profile updated successfully!</span>
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="space-y-6">
            
            {/* Avatar Selection Area */}
            <div className="flex flex-col items-center pb-4">
              <div className="relative group">
                <div className="h-24 w-24 rounded-full bg-slate-800 border-2 border-slate-700 overflow-hidden flex items-center justify-center shadow-xl">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar Preview" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold text-slate-350">
                      {displayName ? displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U'}
                    </span>
                  )}
                </div>
                
                {/* Upload Trigger overlay */}
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute bottom-0 right-0 p-2 rounded-full bg-emerald-500 hover:bg-emerald-600 border border-slate-900 text-white shadow-lg cursor-pointer transition-transform duration-100 hover:scale-105 active:scale-95 disabled:opacity-50"
                  title="Upload Custom Image"
                >
                  {uploading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* Preset Selection Options */}
              <div className="mt-5 w-full">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest text-center mb-3">
                  Or select a premium preset avatar
                </p>
                <div className="grid grid-cols-6 gap-2 justify-items-center max-w-sm mx-auto">
                  {presets.map((presetUrl) => {
                    const isSelected = avatarUrl === presetUrl;
                    return (
                      <button
                        key={presetUrl}
                        type="button"
                        onClick={() => handlePresetSelect(presetUrl)}
                        className={`h-11 w-11 rounded-full border-2 overflow-hidden transition-all bg-slate-900 cursor-pointer ${
                          isSelected 
                            ? 'border-emerald-500 scale-110 shadow-lg shadow-emerald-500/10' 
                            : 'border-slate-850 hover:border-slate-700'
                        }`}
                      >
                        <img src={presetUrl} alt="Avatar Preset" className="h-full w-full object-cover" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Display Name Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter Display Name"
                className="block w-full rounded-lg border border-slate-800 bg-[#0A0E1A] py-3.5 px-4 text-sm text-white placeholder-slate-650 outline-none hover:border-slate-750 focus:border-emerald-500 transition-colors"
                required
              />
            </div>

            {/* Username display (Read-Only) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">
                  Username
                </label>
                <span className="text-[10px] text-slate-500 flex items-center space-x-1 font-medium">
                  <Lock className="h-3 w-3" />
                  <span>Permanent UID</span>
                </span>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-650 font-semibold select-none">
                  @
                </span>
                <input
                  type="text"
                  value={profile?.username || ''}
                  disabled
                  className="block w-full rounded-lg border border-slate-850/80 bg-slate-950/60 py-3.5 pl-8 pr-4 text-sm text-slate-500 cursor-not-allowed select-none outline-none"
                />
              </div>
            </div>

            {/* Email display (Read-Only) */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Email Address
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-650">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  value={profile?.email || user?.email || ''}
                  disabled
                  className="block w-full rounded-lg border border-slate-850/80 bg-slate-950/60 py-3.5 pl-10 pr-4 text-sm text-slate-500 cursor-not-allowed select-none outline-none"
                />
              </div>
            </div>

            {/* Account Created Date (Read-Only) */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Account Created
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-650">
                  <Calendar className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  value={formatJoinedDate(profile?.createdAt)}
                  disabled
                  className="block w-full rounded-lg border border-slate-850/80 bg-slate-950/60 py-3.5 pl-10 pr-4 text-sm text-slate-500 cursor-not-allowed select-none outline-none"
                />
              </div>
            </div>

            {/* Save Button */}
            <button
              type="submit"
              disabled={saving || uploading}
              className="flex w-full justify-center rounded-lg bg-emerald-500 hover:bg-emerald-600 px-4 py-3.5 text-sm font-semibold text-white focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 cursor-pointer"
            >
              {saving ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <span>Save Profile Changes</span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
