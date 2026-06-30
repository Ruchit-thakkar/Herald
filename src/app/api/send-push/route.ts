import { NextResponse } from 'next/server';
import { adminDb, adminMessaging } from '@/lib/firebaseAdmin';

export async function POST(request: Request) {
  let recipientId: string | undefined;
  try {
    const body = await request.json();
    recipientId = body.recipientId;
    const {
      conversationId,
      messageText,
      messageType,
      fileName,
      senderName,
      senderPhoto
    } = body;

    if (!recipientId || !conversationId || !messageText || !messageType) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (!adminDb || !adminMessaging) {
      console.warn('[Push API] Firebase Admin SDK is not fully configured.');
      return NextResponse.json({ success: false, reason: 'Admin SDK not initialized' }, { status: 200 });
    }

    // 1. Fetch recipient token, presence, and active conversation from Realtime Database
    const tokenSnap = await adminDb.ref(`users/${recipientId}/notificationToken`).once('value');
    const token = tokenSnap.val();

    if (!token) {
      return NextResponse.json({ success: true, reason: 'Recipient has no push token registered' });
    }

    const presenceSnap = await adminDb.ref(`presence/${recipientId}`).once('value');
    const presence = presenceSnap.val();
    const isOnline = presence?.online === true;

    const activeConvSnap = await adminDb.ref(`activeConversation/${recipientId}`).once('value');
    const activeConv = activeConvSnap.val();

    // 2. Suppress system notification if receiver is online and looking at the same conversation
    if (isOnline && activeConv === conversationId) {
      return NextResponse.json({ success: true, reason: 'Recipient is currently active in the chat' });
    }

    // 3. Format body preview based on WhatsApp-style rules
    let bodyText = messageText;
    if (messageType === 'image') {
      bodyText = '📷 Photo';
    } else if (messageType === 'video') {
      bodyText = '🎥 Video';
    } else if (messageType === 'file') {
      bodyText = `📄 ${fileName || 'Document'}`;
    }

    // 4. Construct high-priority FCM payload
    const messagePayload = {
      token,
      data: {
        title: senderName || 'New Message',
        body: bodyText,
        icon: senderPhoto || '/icon-192.png',
        conversationId,
        senderId: recipientId, // Receiver of this push is original sender for SW reply
        recipientId: senderName, // Map original sender details for SW context
      },
      android: {
        priority: 'high' as const,
        ttl: 86400 * 1000 // 24 hours
      },
      webpush: {
        headers: {
          Urgency: 'high'
        }
      }
    };

    console.log(`[Push API] Sending FCM notification to ${recipientId} for chat ${conversationId}`);
    const response = await adminMessaging.send(messagePayload);
    return NextResponse.json({ success: true, response });

  } catch (error: any) {
    console.error('[Push API] Error sending push notification:', error);

    // Auto-remove invalid or expired tokens
    if (
      error.code === 'messaging/registration-token-not-registered' ||
      error.code === 'messaging/invalid-registration-token'
    ) {
      console.log(`[Push API] Deleting invalid/expired token for recipient ${recipientId}`);
      if (adminDb && recipientId) {
        await adminDb.ref(`users/${recipientId}/notificationToken`).remove();
      }
    }

    return NextResponse.json({ error: 'FCM sending failed: ' + error.message, code: error.code }, { status: 500 });
  }
}
