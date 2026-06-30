'use client';

import { db } from './firebase';
import { ref, set, remove } from 'firebase/database';

export function isPushSupported() {
  if (typeof window === 'undefined') return false;
  
  const isSWSupported = 'serviceWorker' in navigator;
  const isPushManagerSupported = 'PushManager' in window;
  const isNotificationSupported = 'Notification' in window;
  
  console.log('[Push Diagnostics] Browser Support check:', {
    serviceWorker: isSWSupported,
    PushManager: isPushManagerSupported,
    Notification: isNotificationSupported
  });
  
  return isSWSupported && isPushManagerSupported && isNotificationSupported;
}

export function getLocalNotificationSettings() {
  if (typeof window === 'undefined') {
    return { enabled: true, sound: true, vibration: true, previews: true };
  }
  const raw = localStorage.getItem('herald_notification_settings');
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // fallback
    }
  }
  return { enabled: true, sound: true, vibration: true, previews: true };
}

export function saveLocalNotificationSettings(settings: {
  enabled: boolean;
  sound: boolean;
  vibration: boolean;
  previews: boolean;
}) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('herald_notification_settings', JSON.stringify(settings));
}

export async function registerPushNotifications(uid: string) {
  console.log('[Push Diagnostics] Initializing FCM registration process for user:', uid);

  if (!isPushSupported()) {
    console.warn('[Push Diagnostics] Push notifications are not supported by this browser.');
    return;
  }

  const settings = getLocalNotificationSettings();
  if (!settings.enabled) {
    console.log('[Push Diagnostics] Push notifications are disabled in user settings.');
    try {
      await remove(ref(db, `users/${uid}/notificationToken`));
    } catch (err) {
      console.error('[Push Diagnostics] Error cleaning token on settings disable:', err);
    }
    return;
  }

  // Log VAPID key status
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  console.log('[Push Diagnostics] VAPID Key configuration status:', {
    hasKey: !!vapidKey,
    keyLength: vapidKey ? vapidKey.length : 0
  });

  if (!vapidKey) {
    console.error('[Push Diagnostics] VAPID Key (NEXT_PUBLIC_FIREBASE_VAPID_KEY) is missing in environment variables. FCM registration aborted.');
    return;
  }

  try {
    // 1. Register the custom service worker passing client config to it dynamically
    const config = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
    };
    
    const queryParams = new URLSearchParams(config).toString();
    console.log('[Push Diagnostics] Registering Service Worker with dynamic config parameters...');
    const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${queryParams}`, {
      scope: '/'
    });
    console.log('[Push Diagnostics] Service Worker registration status:', {
      scope: registration.scope,
      active: !!registration.active,
      installing: !!registration.installing,
      waiting: !!registration.waiting
    });

    // 2. Request permission (only if default)
    console.log('[Push Diagnostics] Current Notification Permission state:', Notification.permission);
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      console.log('[Push Diagnostics] RequestPermission user selection result:', permission);
      if (permission !== 'granted') {
        console.log('[Push Diagnostics] Permission denied or closed by user.');
        return;
      }
    } else if (Notification.permission === 'denied') {
      console.warn('[Push Diagnostics] Notification permission is set to denied. User must reset permissions in browser settings to enable.');
      return;
    }

    // 3. Get FCM Token dynamically
    console.log('[Push Diagnostics] Loading Firebase Messaging SDK modules...');
    const { getMessaging, getToken } = await import('firebase/messaging');
    const { app } = await import('./firebase');
    const messaging = getMessaging(app);
    console.log('[Push Diagnostics] Messaging SDK instance initialized successfully.');

    console.log('[Push Diagnostics] Requesting FCM registration token from Google Push Service...');
    const token = await getToken(messaging, {
      serviceWorkerRegistration: registration,
      vapidKey
    });

    if (token) {
      console.log('[Push Diagnostics] FCM Registration Token generated successfully:', token);
      // 4. Save to Realtime Database
      await set(ref(db, `users/${uid}/notificationToken`), token);
      console.log('[Push Diagnostics] Token successfully saved to Realtime Database at path: users/' + uid + '/notificationToken');
    } else {
      console.warn('[Push Diagnostics] Google returned empty/null FCM token.');
    }
  } catch (error: any) {
    console.error('[Push Diagnostics] CRITICAL: FCM Registration failed. Details:', {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      stack: error?.stack
    });
    
    if (error?.message?.includes('push service error') || error?.name === 'AbortError') {
      console.error('[Push Diagnostics] AbortError detected. This is usually caused by an invalid/mismatched VAPID key (NEXT_PUBLIC_FIREBASE_VAPID_KEY) or if the browser push service cannot connect.');
    }
  }
}

export async function unregisterPushNotifications(uid: string) {
  if (typeof window === 'undefined') return;
  console.log('[Push Diagnostics] Unregistering notifications and removing token for user:', uid);
  try {
    await remove(ref(db, `users/${uid}/notificationToken`));
    console.log('[Push Diagnostics] Token successfully removed from Realtime Database.');
  } catch (err) {
    console.error('[Push Diagnostics] Error unregistering push token:', err);
  }
}
