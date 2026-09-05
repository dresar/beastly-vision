import { z } from 'zod';
import { createServerFn } from '@tanstack/react-start';
import { getCookie, setCookie, deleteCookie } from '@tanstack/react-start/server';
import * as jose from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const secretKey = new TextEncoder().encode(JWT_SECRET);

export interface UserSession {
  id: string;
  email: string;
  roles: string[];
}

export const signToken = async (payload: UserSession) => {
  return await new jose.SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey);
};

export const verifyToken = async (token: string): Promise<UserSession | null> => {
  try {
    const { payload } = await jose.jwtVerify(token, secretKey);
    return payload as unknown as UserSession;
  } catch (e) {
    return null;
  }
};

export const hashPassword = async (password: string) => {
  const bcrypt = await import('bcryptjs');
  return await bcrypt.hash(password, 10);
};

export const comparePassword = async (password: string, hash: string) => {
  const bcrypt = await import('bcryptjs');
  return await bcrypt.compare(password, hash);
};

// Server Functions
export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  deleteCookie('auth_token');
  return { success: true };
});

export const getSessionFn = createServerFn({ method: "GET" }).handler(async () => {
  const token = getCookie('auth_token');
  if (!token) return null;
  return await verifyToken(token);
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const loginFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => LoginSchema.parse(data))
  .handler(async ({ data }) => {
    const { email, password } = data;
    
    // Dynamic import to isolate Node/Postgres from client bundle
    const { default: sql } = await import('./db.server');
    
    const [user] = await sql`
      SELECT id, email, password_hash 
      FROM users 
      WHERE email = ${email}
    `;

    if (!user || !(await comparePassword(password, user.password_hash))) {
      throw new Error('Email atau password salah');
    }

    const roles = await sql`
      SELECT role FROM user_roles WHERE user_id = ${user.id}
    `;

    const session: UserSession = {
      id: user.id,
      email: user.email,
      roles: roles.map(r => r.role),
    };

    const token = await signToken(session);
    setCookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return { success: true, user: session };
  });
