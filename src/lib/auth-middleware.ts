import { createMiddleware } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';
import { verifyToken } from './auth';

export const requireAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const token = getCookie('auth_token');

    if (!token) {
      throw new Response('Unauthorized', { status: 401 });
    }

    const session = await verifyToken(token);
    if (!session) {
      throw new Response('Unauthorized: Invalid token', { status: 401 });
    }

    return next({
      context: {
        user: session,
        userId: session.id,
      },
    });
  }
);
