import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "PARENT" | "COACH" | "ADMIN";
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: "PARENT" | "COACH" | "ADMIN";
    sessionVersion: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "PARENT" | "COACH" | "ADMIN";
    /** User.sessionVersion at sign-in. Missing on sessions from before it existed (treated as 0). */
    sessionVersion?: number;
  }
}
