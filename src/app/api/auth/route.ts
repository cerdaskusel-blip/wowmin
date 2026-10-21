import { NextRequest, NextResponse } from 'next/server';
import { identity, requireOrigin, failure } from '@/lib/server';
export async function POST(req: NextRequest) {
  try {
    requireOrigin(req);
    await identity(req);
    const response = NextResponse.json({ serverNow: Date.now() });
    response.cookies.set('__session', req.headers.get('authorization')!.slice(7), {
      httpOnly: true,
      secure: req.nextUrl.protocol === 'https:',
      sameSite: 'strict',
      path: '/',
      maxAge: 3500,
    });
    return response;
  } catch (e) {
    return failure(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    requireOrigin(req);
    const response = NextResponse.json({ ok: true });
    response.cookies.set('__session', '', {
      httpOnly: true,
      secure: req.nextUrl.protocol === 'https:',
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    });
    return response;
  } catch (e) {
    return failure(e);
  }
}
