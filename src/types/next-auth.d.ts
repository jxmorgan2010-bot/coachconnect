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
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "PARENT" | "COACH" | "ADMIN";
  }
}
