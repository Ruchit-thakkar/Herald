import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function GET() {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY || process.env.IMAGEKIT_PUBLIC_KEY;

  if (!privateKey) {
    console.error('ImageKit Private Key is missing from environment variables');
    return NextResponse.json(
      { error: 'Server configuration error: ImageKit Private Key missing.' },
      { status: 500 }
    );
  }

  try {
    // Generate UUID token
    const token = crypto.randomUUID();
    
    // Generate Unix timestamp in seconds (30 minutes expiry)
    const expire = Math.floor(Date.now() / 1000) + 1800;

    // Create HMAC-SHA1 signature of token + expire using privateKey
    const signature = crypto
      .createHmac('sha1', privateKey)
      .update(token + expire)
      .digest('hex');

    return NextResponse.json({
      token,
      expire,
      signature,
      publicKey,
    });
  } catch (error: any) {
    console.error('Error generating ImageKit authentication parameters:', error);
    return NextResponse.json(
      { error: 'Failed to generate authentication parameters.' },
      { status: 500 }
    );
  }
}
