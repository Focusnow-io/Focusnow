import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { consumeSignInToken } from "@/lib/otp";
import { authConfig } from "@/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt", maxAge: 86400, updateAge: 0 },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        signInToken: { type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.signInToken) return null;
        return consumeSignInToken(credentials.signInToken as string);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
});
