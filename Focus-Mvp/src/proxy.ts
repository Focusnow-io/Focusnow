import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

export async function proxy(req: NextRequest) {
  const { nextUrl } = req;

  const isSecure = process.env.NODE_ENV === "production";
  const cookieName = isSecure ? "__Secure-authjs.session-token" : "authjs.session-token";

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    cookieName,
  });

  const isLoggedIn = !!token;

  const isApiRoute = nextUrl.pathname.startsWith("/api/");
  const isApiAuth = nextUrl.pathname.startsWith("/api/auth");
  const isAuthRoute = /^\/(login|register|verify-otp|check-email|forgot-password|reset-password)(\/|$)/.test(
    nextUrl.pathname
  );

  // Always let NextAuth's own API routes through
  if (isApiAuth) return NextResponse.next();

  // Not logged in — return JSON 401 for API calls, redirect to login for pages
  if (!isLoggedIn && !isAuthRoute) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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
