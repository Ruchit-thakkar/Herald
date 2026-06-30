'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { ShieldCheck, Mail, Lock, ArrowRight, RefreshCw } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Redirect to /home or /setup-username is managed by AuthContext route protection
    } catch (err: any) {
      console.error('Login error:', err);
      if (
        err.code === 'auth/invalid-credential' || 
        err.code === 'auth/wrong-password' || 
        err.code === 'auth/user-not-found'
      ) {
        setError('Invalid email or password.');
      } else {
        setError(err.message || 'Authentication failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');

    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      // Redirect to /home or /setup-username is managed by AuthContext route protection
    } catch (err: any) {
      console.error('Google login error:', err);
      setError(err?.message || 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8 text-text-primary">
      <div className="w-full max-w-md space-y-8">
        {/* Brand Header */}
        <div className="flex flex-col items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl overflow-hidden bg-slate-900 border border-border-primary shadow-lg">
            <img src="https://ik.imagekit.io/devnext/Harald%20?updatedAt=1782817476464" alt="Herald Logo" className="h-full w-full object-cover" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold tracking-tight text-text-primary text-gradient">
            Welcome Back
          </h2>
          <p className="mt-2 text-center text-sm text-text-secondary">
            Sign in to your Herald account
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-border-primary bg-card-bg p-8 shadow-2xl backdrop-blur-md">
          {error && (
            <div className="mb-6 rounded-lg bg-error/10 border border-error/20 p-3 text-sm text-error">
              {error}
            </div>
          )}

          <form onSubmit={handleEmailLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Mail className="h-5 w-5 text-text-secondary" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="block w-full rounded-xl border border-border-primary bg-background py-3.5 pl-10 pr-3 text-text-primary placeholder-text-secondary/50 outline-none hover:border-text-secondary focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-text-secondary">
                  Password
                </label>
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-5 w-5 text-text-secondary" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full rounded-xl border border-border-primary bg-background py-3.5 pl-10 pr-3 text-text-primary placeholder-text-secondary/50 outline-none hover:border-text-secondary focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full justify-center rounded-xl bg-primary hover:bg-primary-hover px-4 py-3.5 text-sm font-semibold text-white focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md cursor-pointer hover-scale"
            >
              {loading ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <span className="flex items-center">
                  Login <ArrowRight className="ml-2 h-4 w-4" />
                </span>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border-primary"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card-bg px-2 text-text-secondary font-medium">Or continue with</span>
            </div>
          </div>

          {/* Google SSO */}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="flex w-full justify-center items-center rounded-xl border border-border-primary bg-background hover:bg-surface px-4 py-3.5 text-sm font-semibold text-text-primary focus:outline-none disabled:opacity-50 transition-all duration-200 cursor-pointer hover-scale"
          >
            <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google
          </button>

          <p className="mt-8 text-center text-sm text-text-secondary">
            Don't have an account?{' '}
            <Link href="/register" className="font-semibold text-primary hover:text-primary-hover transition-colors">
              Create Account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
