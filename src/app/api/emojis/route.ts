import { NextResponse } from 'next/server';
import { getEmojis } from '@/lib/emoji';

export async function GET() {
  const emojis = getEmojis();
  return NextResponse.json(emojis);
}
