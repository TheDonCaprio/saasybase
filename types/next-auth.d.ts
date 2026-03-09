import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
      role?: string;
    };
  }

  interface User {
    id: string;
    role?: string;
    imageUrl?: string | null;
    tokenVersion?: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: string;
    tokenVersion?: number;
  }
}