import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { ref as rtdbRef, get, query, orderByChild, endAt, remove } from 'firebase/database';

export async function POST(request: Request) {
  // 1. Authorize using a custom header secret
  const secretHeader = request.headers.get('x-cleanup-secret');
  const cleanupSecret = process.env.CLEANUP_SECRET;

  if (!cleanupSecret) {
    console.error('CLEANUP_SECRET is not configured in server environment variables');
    return NextResponse.json(
      { error: 'Server configuration error: CLEANUP_SECRET is missing.' },
      { status: 500 }
    );
  }

  if (!secretHeader || secretHeader !== cleanupSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  
  try {
    // 2. Query expired file metadata from Realtime Database expiringUploads node
    const expiringRef = rtdbRef(db, 'expiringUploads');
    const q = query(expiringRef, orderByChild('expiresAt'), endAt(now));
    const snapshot = await get(q);

    const deletedFiles: Array<{ messageId: string; fileId: string }> = [];
    const failedFiles: Array<{ messageId: string; error: string }> = [];

    const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
    if (!privateKey) {
      console.error('ImageKit Private Key is missing from server environment');
      return NextResponse.json(
        { error: 'Server configuration error: ImageKit Private Key missing.' },
        { status: 500 }
      );
    }
    const authHeader = `Basic ${Buffer.from(privateKey + ':').toString('base64')}`;

    if (snapshot.exists()) {
      const expiredData = snapshot.val();

      // Loop through each expired index entry
      for (const messageId of Object.keys(expiredData)) {
        const item = expiredData[messageId];
        const { conversationId, fileId } = item;

        // 3. Delete from ImageKit
        if (fileId) {
          try {
            const deleteUrl = `https://api.imagekit.io/v1/files/${fileId}`;
            const ikRes = await fetch(deleteUrl, {
              method: 'DELETE',
              headers: {
                'Authorization': authHeader
              }
            });

            // ImageKit returns 204 No Content on success, or 404 if file is already gone.
            if (!ikRes.ok && ikRes.status !== 404) {
              const errText = await ikRes.text();
              throw new Error(`ImageKit deletion failed with status ${ikRes.status}: ${errText}`);
            }
          } catch (ikErr: any) {
            console.error(`Failed to delete file from ImageKit for fileId ${fileId}:`, ikErr);
            failedFiles.push({ messageId, error: ikErr?.message || 'ImageKit API deletion failure' });
            continue; // Skip database deletion if storage delete failed to avoid orphaned storage files!
          }
        }

        // 4. Delete from Realtime Database messages path
        try {
          if (conversationId) {
            const rtdbPath = `messages/${conversationId}/${messageId}`;
            await remove(rtdbRef(db, rtdbPath));
          }
        } catch (rtdbErr: any) {
          console.error(`Failed to delete Realtime Database message at messages/${conversationId}/${messageId}:`, rtdbErr);
          failedFiles.push({ messageId, error: rtdbErr?.message || 'Realtime Database message deletion failure' });
          continue; // Skip cleaning the index to retry later if it failed
        }

        // 5. Delete index entry from expiringUploads
        try {
          await remove(rtdbRef(db, `expiringUploads/${messageId}`));
        } catch (idxErr: any) {
          console.error(`Failed to delete cleanup index at expiringUploads/${messageId}:`, idxErr);
        }

        deletedFiles.push({ messageId, fileId });
      }
    }

    return NextResponse.json({
      success: true,
      processedCount: snapshot.exists() ? Object.keys(snapshot.val()).length : 0,
      deletedCount: deletedFiles.length,
      deletedFiles,
      failedFiles
    });

  } catch (error: any) {
    console.error('Error running cleanup routine:', error);
    return NextResponse.json({ error: 'Cleanup failed: ' + error.message }, { status: 500 });
  }
}
