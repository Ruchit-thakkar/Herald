'use client';

import { db } from './firebase';
import { ref, set, remove } from 'firebase/database';

let registrationPromise: Promise<void> | null = null;

export async function isPushSupported() {
  if (typeof window === 'undefined') return false;
  
  const isSWSupported = 'serviceWorker' in navigator;
  const isPushManagerSupported = 'PushManager' in window;
  const isNotificationSupported = 'Notification' in window;

  if (!isSWSupported || !isPushManagerSupported || !isNotificationSupported) {
    console.warn('[Push Diagnostics] Browser lacks basic Web Push APIs support:', {
      serviceWorker: isSWSupported,
      PushManager: isPushManagerSupported,
      Notification: isNotificationSupported
    });
    return false;
  }

  try {
    const { isSupported } = await import('firebase/messaging');
    const supported = await isSupported();
    console.log('[Push Diagnostics] Official Firebase SDK browser support check (isSupported):', supported);
    return supported;
  } catch (err) {
    console.error('[Push Diagnostics] Error checking Firebase Messaging browser support:', err);
    return false;
  }
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
  if (typeof window === 'undefined') return;

  // Prevent concurrent or duplicate registration calls
  if (registrationPromise) {
    console.log('[Push Diagnostics] Registration already in progress or completed. Skipping duplicate execution.');
    return registrationPromise;
  }

  registrationPromise = (async () => {
    console.log('[Push Diagnostics] Starting FCM registration process for user:', uid);

    // 1. Verify Browser Support using official Firebase SDK checks
    const supported = await isPushSupported();
    if (!supported) {
      console.warn('[Push Diagnostics] Push notifications are not supported or disabled in this browser.');
      return;
    }

    const settings = getLocalNotificationSettings();
    if (!settings.enabled) {
      console.log('[Push Diagnostics] Push notifications are disabled in user settings.');
      try {
        await remove(ref(db, `users/${uid}/notificationToken`));
      } catch (err) {
        console.error('[Push Diagnostics] Error removing token on settings disable:', err);
      }
      return;
    }

    // 2. Verify VAPID Key availability
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    console.log('[Push Diagnostics] VAPID Key status check:', {
      configured: !!vapidKey,
      length: vapidKey ? vapidKey.length : 0
    });

    if (!vapidKey) {
      console.error('[Push Diagnostics] VAPID Key (NEXT_PUBLIC_FIREBASE_VAPID_KEY) is missing in env. Registration aborted.');
      return;
    }

    try {
      // 3. Request Notification Permission first (before registering SW or active checks)
      console.log('[Push Diagnostics] Checking Notification Permission state:', Notification.permission);
      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        console.log('[Push Diagnostics] RequestPermission user result:', permission);
        if (permission !== 'granted') {
          console.log('[Push Diagnostics] Notification permission denied or closed by user.');
          return;
        }
      } else if (Notification.permission === 'denied') {
        console.warn('[Push Diagnostics] Notification permission was previously denied. User must enable it in browser settings.');
        return;
      }

      // 4. Register the static Service Worker (no query parameters)
      console.log('[Push Diagnostics] Registering static service worker "/firebase-messaging-sw.js"...');
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/'
      });

      console.log('[Push Diagnostics] Service Worker registered. scope:', registration.scope);

      // 5. Wait for the Service Worker to be fully active and ready
      console.log('[Push Diagnostics] Waiting for Service Worker to become ready/active...');
      await navigator.serviceWorker.ready;
      
      if (!registration.active) {
        console.log('[Push Diagnostics] Service Worker registration not yet active, waiting for controllerchange...');
        await new Promise<void>((resolve) => {
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
        });
      }
      console.log('[Push Diagnostics] Service Worker is active and ready.');

      // 6. Initialize Firebase Messaging and get Token
      console.log('[Push Diagnostics] Initializing Firebase Messaging client...');
      const { getMessaging, getToken } = await import('firebase/messaging');
      const { app } = await import('./firebase');
      const messaging = getMessaging(app);

      console.log('[Push Diagnostics] Requesting FCM registration token...');
      const token = await getToken(messaging, {
        serviceWorkerRegistration: registration,
        vapidKey
      });

      if (token) {
        console.log('[Push Diagnostics] FCM registration token generated:', token);
        // 7. Save to Realtime Database
        await set(ref(db, `users/${uid}/notificationToken`), token);
        console.log('[Push Diagnostics] Token saved successfully in RTDB at path: users/' + uid + '/notificationToken');
      } else {
        console.warn('[Push Diagnostics] getToken() returned empty token.');
      }

    } catch (error: any) {
      console.error('[Push Diagnostics] CRITICAL: FCM Registration failed. Details:', {
        name: error?.name,
        message: error?.message,
        code: error?.code,
        stack: error?.stack
      });

      if (error?.code === 'messaging/token-subscribe-failed' || error?.name === 'InvalidAccessError') {
        console.error(
          '[Push Diagnostics] VAPID Key validation failed (InvalidAccessError / token-subscribe-failed). ' +
          'The VAPID Key in .env.local (NEXT_PUBLIC_FIREBASE_VAPID_KEY) is invalid, malformed, or mismatched. ' +
          'To resolve this: \n' +
          '1. Go to Firebase Console -> Project Settings -> Cloud Messaging.\n' +
          '2. Scroll down to Web configuration -> Web Push certificates.\n' +
          '3. Click "Generate Key Pair" (if not already generated).\n' +
          '4. Copy the long public key string (typically ~87 characters starting with "B") and paste it into .env.local as NEXT_PUBLIC_FIREBASE_VAPID_KEY.\n' +
          '5. Restart the Next.js development server.'
        );
      } else if (error?.name === 'AbortError') {
        console.error('[Push Diagnostics] Service worker activation or push subscription was aborted by browser.');
      }
    }
  })();

  return registrationPromise;
}

export async function unregisterPushNotifications(uid: string) {
  if (typeof window === 'undefined') return;
  console.log('[Push Diagnostics] Unregistering notifications for user:', uid);
  registrationPromise = null;
  try {
    await remove(ref(db, `users/${uid}/notificationToken`));
    console.log('[Push Diagnostics] Token successfully removed from RTDB.');
  } catch (err) {
    console.error('[Push Diagnostics] Error unregistering push token:', err);
  }
}
