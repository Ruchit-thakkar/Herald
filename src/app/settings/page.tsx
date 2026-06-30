'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { 
  ChevronLeft, Moon, Sun, Bell, Volume2, Shield, Eye, LogOut, Check 
} from 'lucide-react';

export default function SettingsPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [notifications, setNotifications] = useState(true);
  const [sounds, setSounds] = useState(true);
  const [showPresence, setShowPresence] = useState(true);
  const [readReceipts, setReadReceipts] = useState(true);
  const [savedMessage, setSavedMessage] = useState('');

  const handleThemeToggle = () => {
    toggleTheme();
    triggerSaveNotice(`${theme === 'dark' ? 'Light' : 'Dark'} theme enabled`);
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8 md:py-16 text-text-primary transition-colors duration-200">
      <div className="w-full max-w-xl space-y-6">
        
        {/* Navigation Header */}
        <div className="flex items-center justify-between pb-2">
          <button 
            onClick={() => router.push('/home')}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface border border-border-primary text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            title="Back to Home"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-text-secondary uppercase tracking-widest">
            Settings
          </span>
          <div className="w-10"></div> {/* spacer */}
        </div>

        {/* Settings Card */}
        <div className="rounded-2xl border border-border-primary bg-card-bg p-6 md:p-8 shadow-2xl backdrop-blur-md transition-colors duration-200 relative">
          
          {/* Quick status toast */}
          {savedMessage && (
            <div className="absolute top-4 right-4 flex items-center space-x-1.5 rounded-lg bg-success/10 border border-success/20 px-3 py-1.5 text-[10px] font-bold text-success animate-in fade-in zoom-in-95 duration-100">
              <Check className="h-3.5 w-3.5" />
              <span>{savedMessage}</span>
            </div>
          )}

          <div className="space-y-7">
            
            {/* Theme Section */}
            <div>
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-4">
                Appearance
              </h4>
              <div className="flex items-center justify-between p-4 rounded-xl border border-border-primary bg-background/40">
                <div className="flex items-center space-x-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface border border-border-primary text-primary">
                    {theme === 'dark' ? <Moon className="h-4.5 w-4.5" /> : <Sun className="h-4.5 w-4.5" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-text-primary">App Theme</p>
                    <p className="text-xs text-text-secondary mt-0.5">Toggle light or dark layout appearance</p>
                  </div>
                </div>
                
                {/* Theme Switcher Button */}
                <button
                  onClick={handleThemeToggle}
                  className="rounded-lg border border-border-primary bg-background hover:bg-surface px-4 py-2 text-xs font-semibold text-text-primary transition-all cursor-pointer select-none active:scale-95"
                >
                  {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                </button>
              </div>
            </div>

            {/* Notifications Section */}
            <div>
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-4">
                Notifications
              </h4>
              <div className="space-y-3">
                {/* Desktop Switch */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-border-primary bg-background/40">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface border border-border-primary text-text-secondary">
                      <Bell className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-text-primary">Desktop Alerts</p>
                      <p className="text-xs text-text-secondary mt-0.5">Receive alert notifications for new messages</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('Alerts', notifications, setNotifications)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      notifications ? 'bg-primary' : 'bg-surface border border-border-primary'
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
                <div className="flex items-center justify-between p-4 rounded-xl border border-border-primary bg-background/40">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface border border-border-primary text-text-secondary">
                      <Volume2 className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-text-primary">Sound Effects</p>
                      <p className="text-xs text-text-secondary mt-0.5">Play dynamic audio cue on incoming message</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('Sounds', sounds, setSounds)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      sounds ? 'bg-primary' : 'bg-surface border border-border-primary'
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
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-4">
                Privacy
              </h4>
              <div className="space-y-3">
                {/* Activity Status Switch */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-border-primary bg-background/40">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface border border-border-primary text-text-secondary">
                      <Eye className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-text-primary">Activity Status</p>
                      <p className="text-xs text-text-secondary mt-0.5">Let others see if you are currently online</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('Activity Status', showPresence, setShowPresence)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      showPresence ? 'bg-primary' : 'bg-surface border border-border-primary'
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
                <div className="flex items-center justify-between p-4 rounded-xl border border-border-primary bg-background/40">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface border border-border-primary text-text-secondary">
                      <Shield className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-text-primary">Read Receipts</p>
                      <p className="text-xs text-text-secondary mt-0.5">Allow senders to see when you read their text</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('Read Receipts', readReceipts, setReadReceipts)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      readReceipts ? 'bg-primary' : 'bg-surface border border-border-primary'
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
                className="flex w-full items-center justify-center space-x-2 rounded-xl bg-error/10 hover:bg-error/20 border border-error/20 py-3.5 text-sm font-semibold text-error hover:text-error transition-all duration-200 cursor-pointer"
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
