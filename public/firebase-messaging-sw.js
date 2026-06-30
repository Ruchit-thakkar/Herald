/* eslint-disable no-undef */
// Dynamic Firebase Messaging Service Worker

// 1. Parse configuration parameters from URL
const params = new URL(self.location).searchParams;
const firebaseConfig = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
};

if (firebaseConfig.apiKey && firebaseConfig.messagingSenderId) {
  try {
    // Import Firebase Compat scripts for FCM compatibility
    importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
    importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

    firebase.initializeApp(firebaseConfig);
    // Initialize messaging so that getToken() can successfully hand-shake with this worker
    const messaging = firebase.messaging();
    console.log('[SW] Firebase Messaging Compat SDK initialized successfully.');
  } catch (err) {
    console.error('[SW] Failed to initialize Firebase Compat SDK inside Service Worker:', err);
  }
}

// 2. Custom push listener for custom banners and inline reply action buttons
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const rawData = event.data.json();
    console.log('[SW] Push event payload received:', rawData);

    const data = rawData.data || rawData;

    const title = data.title || 'New Message';
    const body = data.body || '';
    const icon = data.icon || '/icon-192.png';
    const conversationId = data.conversationId;
    const senderId = data.senderId;
    const recipientId = data.recipientId;

    const options = {
      body,
      icon,
      badge: '/badge.png',
      tag: conversationId || 'herald-notification',
      renotify: true,
      data: {
        conversationId,
        senderId,
        recipientId
      },
      actions: [
        { action: 'reply', title: 'Reply', type: 'text', placeholder: 'Type a reply...' },
        { action: 'open_chat', title: 'Open Chat' }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (err) {
    console.error('[SW] Error displaying push notification:', err);
  }
});

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const action = event.action;

  if (action === 'reply') {
    const replyText = event.reply;
    const { conversationId, senderId, recipientId } = notification.data || {};

    if (replyText && conversationId) {
      event.waitUntil((async () => {
        try {
          const res = await fetch('/api/direct-reply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversationId,
              senderId: recipientId, // Original recipient of message is now sender of the reply
              receiverId: senderId,
              text: replyText
            })
          });
          if (!res.ok) {
            console.error('[SW] Direct reply request failed status:', res.status);
          }
        } catch (err) {
          console.error('[SW] Error sending direct reply:', err);
        }
      })());
    }
    notification.close();
    return;
  }

  // Otherwise, default notification click or 'open_chat' action
  notification.close();

  const conversationId = notification.data ? notification.data.conversationId : null;
  const targetUrl = conversationId ? `/chat/${conversationId}` : '/home';

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      if (client.url.includes(self.location.origin) && 'focus' in client) {
        await client.navigate(targetUrl);
        return client.focus();
      }
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }
  })());
});
