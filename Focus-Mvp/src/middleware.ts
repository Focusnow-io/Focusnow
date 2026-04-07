import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const { nextUrl } = req;

  // Read the JWT directly from the session cookie — works in edge runtime,
  // no providers or DB calls needed.
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  });

  const isLoggedIn = !!token;

  const isApiAuth = nextUrl.pathname.startsWith("/api/auth");
  const isAuthRoute = /^\/(login|register|verify-otp|check-email)(\/|$)/.test(
    nextUrl.pathname
  );

  // Always let NextAuth's own API routes through
  if (isApiAuth) return NextResponse.next();

  // Not logged in — redirect to login for protected routes
  if (!isLoggedIn && !isAuthRoute) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  // Logged in — no reason to be on auth pages
  if (isLoggedIn && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo\\.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
