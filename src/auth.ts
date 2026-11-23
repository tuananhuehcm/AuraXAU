import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
export const authConfigured = () =>
  !!(
    process.env.AUTH_SECRET &&
    process.env.AUTH_GOOGLE_ID &&
    process.env.AUTH_GOOGLE_SECRET &&
    process.env.ALLOWED_EMAIL
  );
export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [Google],
  pages: { signIn: "/", error: "/" },
  callbacks: {
    signIn: async ({ profile }) =>
      !!profile?.email_verified &&
      typeof profile.email === "string" &&
      profile.email.toLowerCase() === process.env.ALLOWED_EMAIL?.toLowerCase(),
    jwt: async ({ token }) => token,
    session: async ({ session }) => session,
  },
});
