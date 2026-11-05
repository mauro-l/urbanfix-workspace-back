import type { UserRole } from '@prisma/client';
import type { RequestHandler } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { prisma as defaultPrisma } from '../lib/prisma.js';

const isUserRole = (value: unknown): value is UserRole =>
  value === 'CLIENTE' || value === 'TECNICO' || value === 'ADMIN';

export function createAuthenticate(
  prisma = defaultPrisma,
  jwtSecret = process.env.JWT_SECRET,
): RequestHandler {
  return async (req, res, next) => {
    const authorization = req.get('authorization');
    const match = authorization?.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      res.status(401).json({ error: 'Token no proporcionado.' });
      return;
    }

    if (!jwtSecret) {
      next(new Error('JWT_SECRET is not configured.'));
      return;
    }

    let decoded: string | JwtPayload;
    try {
      decoded = jwt.verify(match[1]!, jwtSecret, { algorithms: ['HS256'] });
    } catch {
      res.status(401).json({ error: 'Token inválido o expirado.' });
      return;
    }

    if (
      typeof decoded === 'string' ||
      typeof decoded.userId !== 'string' ||
      !isUserRole(decoded.role)
    ) {
      res.status(401).json({ error: 'Token inválido o expirado.' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, isActive: true },
    });

    if (!user) {
      res.status(401).json({ error: 'Token inválido o expirado.' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: 'La cuenta está inactiva.' });
      return;
    }

    req.user = { userId: user.id, role: user.role };
    next();
  };
}

export function authorize(...allowedRoles: UserRole[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: 'Token no proporcionado.' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'No tenés permiso para acceder.' });
      return;
    }

    next();
  };
}
