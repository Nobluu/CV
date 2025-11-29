import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  
  // Get the redirect URL that NextAuth would generate
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  const callbackUrl = `${baseUrl}/api/auth/callback/google`
  
  const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent'
  }).toString()
  
  return NextResponse.json({
    baseUrl,
    callbackUrl,
    clientId: process.env.GOOGLE_CLIENT_ID || 'NOT SET',
    oauthUrl,
    message: 'This is the callback URL that should be in Google Console'
  })
}