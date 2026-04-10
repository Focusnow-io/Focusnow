import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config — no Node.js-only imports (no Prisma, no pg).
 * Used by middleware. The full auth.ts extends this with the adapter + providers.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" as const, maxAge: 86400, updateAge: 0 },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
