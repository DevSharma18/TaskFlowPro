import http from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { JwtPayload } from '../middlewares/auth';

let io: Server | null = null;

export function initSocket(server: http.Server): Server {
  io = new Server(server, {
    cors: { origin: env.clientOrigin.split(','), credentials: true },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = jwt.verify(token, env.jwtSecret) as JwtPayload;
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as JwtPayload;
    if (user.teamId) socket.join(`team:${user.teamId}`);
    socket.join(`user:${user.userId}`);
    logger.info('socket connected', { userId: user.userId });

    // Re-auth after token refresh
    socket.on('auth:refresh', (token: string, ack?: (ok: boolean) => void) => {
      try {
        const payload = jwt.verify(token, env.jwtSecret) as JwtPayload;
        socket.data.user = payload;
        if (payload.teamId) socket.join(`team:${payload.teamId}`);
        ack?.(true);
      } catch {
        ack?.(false);
      }
    });

    socket.on('disconnect', () => logger.info('socket disconnected', { userId: user.userId }));
  });

  return io;
}

export function emitToTeam(teamId: string | null, event: string, payload: unknown): void {
  if (io && teamId) io.to(`team:${teamId}`).emit(event, payload);
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  if (io) io.to(`user:${userId}`).emit(event, payload);
}
