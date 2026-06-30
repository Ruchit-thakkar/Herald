'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { ShieldCheck, Mail, Lock, ArrowRight, RefreshCw } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      // Success. AuthContext will detect new user with no profile and auto-route to /setup-username
    } catch (err: any) {
      console.error('Registration error:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('This email address is already registered.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters.');
      } else {
        setError(err.message || 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    setLoading(true);
    setError('');

    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      // AuthContext handles redirect to /setup-username if profile is null, or /home if profile exists
    } catch (err: any) {
      console.error('Google register error:', err);
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
            Create Account
          </h2>
          <p className="mt-2 text-center text-sm text-text-secondary">
            Get started with Herald today
          </p>
        </div>

        {/* Register Card */}
        <div className="rounded-2xl border border-border-primary bg-card-bg p-8 shadow-2xl backdrop-blur-md">
          {error && (
            <div className="mb-6 rounded-lg bg-error/10 border border-error/20 p-3 text-sm text-error">
              {error}
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-5">
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
                  className="block w-full rounded-lg border border-border-primary bg-background py-3.5 pl-10 pr-3 text-text-primary placeholder-text-secondary/50 outline-none hover:border-text-secondary focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-5 w-5 text-text-secondary" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full rounded-lg border border-border-primary bg-background py-3.5 pl-10 pr-3 text-text-primary placeholder-text-secondary/50 outline-none hover:border-text-secondary focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-5 w-5 text-text-secondary" />
                </div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full rounded-lg border border-border-primary bg-background py-3.5 pl-10 pr-3 text-text-primary placeholder-text-secondary/50 outline-none hover:border-text-secondary focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full justify-center rounded-lg bg-primary hover:bg-primary-hover px-4 py-3.5 text-sm font-semibold text-white focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md"
            >
              {loading ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <span className="flex items-center">
                  Register <ArrowRight className="ml-2 h-4 w-4" />
                </span>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border-primary"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card-bg px-2 text-text-secondary font-medium">Or sign up with</span>
            </div>
          </div>

          {/* Google SSO */}
          <button
            onClick={handleGoogleRegister}
            disabled={loading}
            className="flex w-full justify-center items-center rounded-lg border border-border-primary bg-background hover:bg-surface px-4 py-3.5 text-sm font-semibold text-text-primary focus:outline-none disabled:opacity-50 transition-all duration-200 cursor-pointer"
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
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-primary hover:text-primary-hover transition-colors">
              Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
