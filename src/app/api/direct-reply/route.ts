import { NextResponse } from 'next/server';
import { adminDb, adminMessaging } from '@/lib/firebaseAdmin';

export async function POST(request: Request) {
  try {
    const { conversationId, senderId, receiverId, text } = await request.json();

    if (!conversationId || !senderId || !receiverId || !text) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (!adminDb) {
      return NextResponse.json({ error: 'Firebase Admin SDK database is not configured' }, { status: 500 });
    }

    // 1. Generate unique message key
    const messagesRef = adminDb.ref(`messages/${conversationId}`);
    const newMessageRef = messagesRef.push();
    const messageId = newMessageRef.key;

    if (!messageId) {
      throw new Error('Failed to generate message key');
    }

    const timestamp = Date.now();
    const msgPayload = {
      senderId,
      text,
      type: 'text',
      timestamp,
      status: 'sent'
    };

    // 2. Fetch original conversation metadata
    const conversationRef = adminDb.ref(`conversations/${conversationId}`);
    const conversationSnap = await conversationRef.once('value');
    const conversationData = conversationSnap.val() || {};

    const conversationMeta = {
      participants: {
        [senderId]: true,
        [receiverId]: true
      },
      type: 'direct',
      createdAt: conversationData.createdAt || timestamp,
      updatedAt: timestamp,
      lastMessage: {
        text,
        senderId,
        timestamp
      }
    };

    // 3. Write message payload and metadata in parallel
    await Promise.all([
      newMessageRef.set(msgPayload),
      conversationRef.set(conversationMeta),
      adminDb.ref(`userConversations/${senderId}/${conversationId}`).set({
        ...conversationMeta,
        conversationId
      }),
      adminDb.ref(`userConversations/${receiverId}/${conversationId}`).set({
        ...conversationMeta,
        conversationId
      })
    ]);

    console.log(`[Direct Reply] Saved reply ${messageId} from ${senderId} to ${receiverId}`);

    // 4. Send a notification back to the original sender (receiverId) if they are offline/inactive
    if (adminMessaging) {
      try {
        const tokenSnap = await adminDb.ref(`users/${receiverId}/notificationToken`).once('value');
        const token = tokenSnap.val();

        if (token) {
          const presenceSnap = await adminDb.ref(`presence/${receiverId}`).once('value');
          const isOnline = presenceSnap.val()?.online === true;

          const activeConvSnap = await adminDb.ref(`activeConversation/${receiverId}`).once('value');
          const activeConv = activeConvSnap.val();

          // Suppress if online and viewing
          if (!(isOnline && activeConv === conversationId)) {
            // Fetch sender profile details to customize push (since reply is text, no format check needed)
            const senderSnap = await adminDb.ref(`users/${senderId}`).once('value');
            const senderData = senderSnap.val() || {};

            const messagePayload = {
              token,
              data: {
                title: senderData.displayName || 'Direct Reply',
                body: text,
                icon: senderData.photoURL || '/icon-192.png',
                conversationId,
                senderId: receiverId, // receiver maps back as sender of next reply
                recipientId: senderId
              },
              android: {
                priority: 'high' as const,
                ttl: 86400 * 1000
              },
              webpush: {
                headers: {
                  Urgency: 'high'
                }
              }
            };
            await adminMessaging.send(messagePayload);
            console.log(`[Direct Reply] Forwarded outgoing push to ${receiverId}`);
          }
        }
      } catch (pushErr: any) {
        console.error('[Direct Reply] Non-blocking push send error:', pushErr);
        if (
          pushErr.code === 'messaging/registration-token-not-registered' ||
          pushErr.code === 'messaging/invalid-registration-token'
        ) {
          console.log(`[Direct Reply] Deleting invalid/expired token for recipient ${receiverId}`);
          await adminDb.ref(`users/${receiverId}/notificationToken`).remove();
        }
      }
    }

    return NextResponse.json({ success: true, messageId });

  } catch (error: any) {
    console.error('[Direct Reply API] Error processing direct reply:', error);
    return NextResponse.json({ error: 'Internal Server Error: ' + error.message }, { status: 500 });
  }
}
