/* eslint-disable no-undef */
// Static Firebase Messaging Service Worker (Official Firebase Architecture)

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyB859jwTl_j-V6Qnkgxev3h-urIvzf3JNo",
  authDomain: "herald-490fb.firebaseapp.com",
  projectId: "herald-490fb",
  storageBucket: "herald-490fb.firebasestorage.app",
  messagingSenderId: "820023329237",
  appId: "1:820023329237:web:f6e710857c15b5c8c27d5c"
});

const messaging = firebase.messaging();
console.log('[SW] Firebase Messaging Compat SDK initialized successfully.');

// 1. Official Firebase background message handler (No custom 'push' listener to prevent overrides)
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload);
  
  const data = payload.data;
  if (!data) return;

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

  self.registration.showNotification(title, options);
});

// 2. Notification click listener for action buttons and navigation focus
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
              senderId: recipientId,
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
