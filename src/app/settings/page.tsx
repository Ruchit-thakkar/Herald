'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { 
  ChevronLeft, Moon, Sun, Bell, Volume2, Shield, Eye, LogOut, Check 
} from 'lucide-react';

export default function SettingsPage() {
  const router = useRouter();
  const { logout } = useAuth();

  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [notifications, setNotifications] = useState(true);
  const [sounds, setSounds] = useState(true);
  const [showPresence, setShowPresence] = useState(true);
  const [readReceipts, setReadReceipts] = useState(true);
  const [savedMessage, setSavedMessage] = useState('');

  // Sync theme selection with document styling
  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    
    if (nextTheme === 'light') {
      document.documentElement.style.setProperty('--background', '#F1F5F9');
      document.documentElement.style.setProperty('--foreground', '#0F172A');
      document.documentElement.style.setProperty('--card', '#FFFFFF');
      document.documentElement.style.setProperty('--card-border', '#E2E8F0');
      document.documentElement.style.setProperty('--slate-dark', '#E2E8F0');
      document.documentElement.style.setProperty('--slate-hover', '#F8FAFC');
      triggerSaveNotice('Light theme enabled');
    } else {
      document.documentElement.style.setProperty('--background', '#080C14');
      document.documentElement.style.setProperty('--foreground', '#F8FAFC');
      document.documentElement.style.setProperty('--card', '#0F1626');
      document.documentElement.style.setProperty('--card-border', '#1E293B');
      document.documentElement.style.setProperty('--slate-dark', '#1E293B');
      document.documentElement.style.setProperty('--slate-hover', '#1E293B');
      triggerSaveNotice('Dark theme enabled');
    }
  };

  const triggerSaveNotice = (msg: string) => {
    setSavedMessage(msg);
    setTimeout(() => {
      setSavedMessage(prev => prev === msg ? '' : prev);
    }, 2000);
  };

  const handleToggle = (setting: string, currentValue: boolean, setter: React.Dispatch<React.SetStateAction<boolean>>) => {
    setter(!currentValue);
    triggerSaveNotice(`Updated ${setting}`);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#080C14] px-4 py-8 md:py-16 text-white transition-colors duration-200">
      <div className="w-full max-w-xl space-y-6">
        
        {/* Navigation Header */}
        <div className="flex items-center justify-between pb-2">
          <button 
            onClick={() => router.push('/home')}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F1626] border border-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Back to Home"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-slate-500 uppercase tracking-widest">
            Settings
          </span>
          <div className="w-10"></div> {/* spacer */}
        </div>

        {/* Settings Card */}
        <div className="rounded-2xl border border-card-border bg-[#0F1626] p-6 md:p-8 shadow-2xl backdrop-blur-md transition-colors duration-200 relative">
          
          {/* Quick status toast */}
          {savedMessage && (
            <div className="absolute top-4 right-4 flex items-center space-x-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-[10px] font-bold text-emerald-400 animate-in fade-in zoom-in-95 duration-100">
              <Check className="h-3.5 w-3.5" />
              <span>{savedMessage}</span>
            </div>
          )}

          <div className="space-y-7">
            
            {/* Theme Section */}
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
                Appearance
              </h4>
              <div className="flex items-center justify-between p-4 rounded-xl border border-slate-850 bg-[#0A0E1A]/40">
                <div className="flex items-center space-x-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 border border-slate-800 text-emerald-400">
                    {theme === 'dark' ? <Moon className="h-4.5 w-4.5" /> : <Sun className="h-4.5 w-4.5" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">App Theme</p>
                    <p className="text-xs text-slate-500 mt-0.5">Toggle light or dark layout appearance</p>
                  </div>
                </div>
                
                {/* Theme Switcher Button */}
                <button
                  onClick={toggleTheme}
                  className="rounded-lg border border-slate-800 bg-[#0A0E1A] hover:bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-all cursor-pointer select-none active:scale-95"
                >
                  {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                </button>
              </div>
            </div>

            {/* Notifications Section */}
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
                Notifications
              </h4>
              <div className="space-y-3">
                {/* Desktop Switch */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-850 bg-[#0A0E1A]/40">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 border border-slate-800 text-slate-400">
                      <Bell className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">Desktop Alerts</p>
                      <p className="text-xs text-slate-500 mt-0.5">Receive alert notifications for new messages</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('Alerts', notifications, setNotifications)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      notifications ? 'bg-emerald-500' : 'bg-slate-850'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        notifications ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Sound Switch */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-850 bg-[#0A0E1A]/40">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 border border-slate-800 text-slate-400">
                      <Volume2 className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">Sound Effects</p>
                      <p className="text-xs text-slate-500 mt-0.5">Play dynamic audio cue on incoming message</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('Sounds', sounds, setSounds)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      sounds ? 'bg-emerald-500' : 'bg-slate-850'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        sounds ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Privacy Section */}
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
                Privacy
              </h4>
              <div className="space-y-3">
                {/* Presence Switch */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-850 bg-[#0A0E1A]/40">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 border border-slate-800 text-slate-400">
                      <Eye className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">Activity Status</p>
                      <p className="text-xs text-slate-500 mt-0.5">Let others see if you are currently online</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('Activity Status', showPresence, setShowPresence)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      showPresence ? 'bg-emerald-500' : 'bg-slate-850'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        showPresence ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Read Receipts Switch */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-850 bg-[#0A0E1A]/40">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 border border-slate-800 text-slate-400">
                      <Shield className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">Read Receipts</p>
                      <p className="text-xs text-slate-500 mt-0.5">Allow senders to see when you read their text</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('Read Receipts', readReceipts, setReadReceipts)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      readReceipts ? 'bg-emerald-500' : 'bg-slate-850'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        readReceipts ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Logout Section */}
            <div className="pt-2">
              <button
                onClick={logout}
                className="flex w-full items-center justify-center space-x-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 py-3.5 text-sm font-semibold text-red-400 hover:text-red-300 transition-all duration-200 cursor-pointer"
              >
                <LogOut className="h-4.5 w-4.5" />
                <span>Log Out of Herald</span>
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
