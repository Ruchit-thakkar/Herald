import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getMessaging } from 'firebase-admin/messaging';

const privateKey = process.env.FIREBASE_PRIVATE_KEY;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const projectId = process.env.FIREBASE_PROJECT_ID;

let app;

if (getApps().length === 0) {
  if (privateKey && clientEmail && projectId) {
    app = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
      databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
    });
  } else {
    console.error('Firebase Admin credentials are not fully configured in server environment');
  }
} else {
  app = getApps()[0];
}

export const adminDb = app ? getDatabase(app) : null;
export const adminMessaging = app ? getMessaging(app) : null;
