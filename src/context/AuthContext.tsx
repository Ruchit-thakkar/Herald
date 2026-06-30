'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { ref, get, child, onValue, onDisconnect, set, serverTimestamp } from 'firebase/database';
import { auth, db } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { CheckCircle } from 'lucide-react';
import LogoutModal from '@/components/LogoutModal';

export interface UserProfile {
  uid: string;
  username: string;
  displayName: string;
  email: string;
  createdAt: number;
  updatedAt: number;
  photoURL?: string | null;
  status?: 'online' | 'offline';
  lastSeen?: number;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  logout: () => void;
  refreshProfile: () => Promise<UserProfile | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  logout: () => {},
  refreshProfile: async () => null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [showLogoutToast, setShowLogoutToast] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const fetchProfile = async (uid: string): Promise<UserProfile | null> => {
    try {
      const dbRef = ref(db);
      const snapshot = await get(child(dbRef, `users/${uid}`));
      if (snapshot.exists()) {
        return snapshot.val() as UserProfile;
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
    return null;
  };

  const refreshProfile = async (): Promise<UserProfile | null> => {
    if (!auth.currentUser) return null;
    const p = await fetchProfile(auth.currentUser.uid);
    if (p) {
      setProfile(p);
    }
    return p;
  };

  const performLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setProfile(null);
      setIsLogoutModalOpen(false);
      setShowLogoutToast(true);
      setTimeout(() => setShowLogoutToast(false), 3000);
      router.push('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const logout = () => {
    setIsLogoutModalOpen(true);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const p = await fetchProfile(currentUser.uid);
        setProfile(p);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Real-time presence tracking
  useEffect(() => {
    if (!user) return;

    const connectedRef = ref(db, '.info/connected');
    const myPresenceRef = ref(db, `presence/${user.uid}`);

    const unsubscribe = onValue(connectedRef, async (snap) => {
      if (snap.val() === true) {
        try {
          await set(myPresenceRef, {
            online: true,
            lastSeen: serverTimestamp()
          });

          await onDisconnect(myPresenceRef).set({
            online: false,
            lastSeen: serverTimestamp()
          });
        } catch (e) {
          console.error('Error setting presence:', e);
        }
      }
    });

    return () => {
      unsubscribe();
      try {
        set(myPresenceRef, {
          online: false,
          lastSeen: serverTimestamp()
        });
      } catch (e) {
        console.error('Error marking presence offline:', e);
      }
    };
  }, [user]);

  // Route protection
  useEffect(() => {
    if (loading) return;

    const isPublicPath = pathname === '/login' || pathname === '/register';

    if (!user) {
      if (!isPublicPath) {
        router.replace('/login');
      }
    } else {
      if (!profile) {
        if (pathname !== '/setup-username') {
          router.replace('/setup-username');
        }
      } else {
        if (isPublicPath || pathname === '/setup-username' || pathname === '/') {
          router.replace('/home');
        }
      }
    }
  }, [user, profile, loading, pathname, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0F19] text-white">
        <div className="flex flex-col items-center space-y-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-500"></div>
          <p className="text-sm font-medium tracking-widest text-slate-400 uppercase animate-pulse">
            Loading Herald
          </p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, logout, refreshProfile }}>
      {children}
      <LogoutModal 
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirm={performLogout}
      />
      {showLogoutToast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center space-x-2 rounded-xl bg-success/15 border border-success/30 px-4 py-3 text-sm font-semibold text-success shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-5 duration-200">
          <CheckCircle className="h-5 w-5 text-success" />
          <span>Logged out successfully.</span>
        </div>
      )}
    </AuthContext.Provider>
  );
};
