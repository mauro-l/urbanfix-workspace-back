import { Prisma, UserRole, type PrismaClient } from '@prisma/client';
import type { RequestHandler } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma as defaultPrisma } from '../lib/prisma.js';

const publicUserSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  role: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const loginUserSelect = {
  ...publicUserSelect,
  passwordHash: true,
} satisfies Prisma.UserSelect;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function invalidInput(res: Parameters<RequestHandler>[1], message: string) {
  return res.status(400).json({ error: message });
}

export function createAuthController(
  prisma: PrismaClient = defaultPrisma,
  jwtSecret = process.env.JWT_SECRET,
) {
  const register: RequestHandler = async (req, res, next) => {
    const body: unknown = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return invalidInput(res, 'El cuerpo de la solicitud debe ser un objeto JSON.');
    }

    const input = body as Record<string, unknown>;
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : '';
    const role = input.role;
    const rawPhone = input.phone;

    if (!email || !password || !fullName || !role) {
      return invalidInput(res, 'Todos los campos obligatorios deben estar completos.');
    }
    if (!emailPattern.test(email)) {
      return invalidInput(res, 'El email no tiene un formato válido.');
    }
    if (password.length < 8) {
      return invalidInput(res, 'La contraseña debe tener al menos 8 caracteres.');
    }
    if (role !== UserRole.CLIENTE && role !== UserRole.TECNICO) {
      return invalidInput(res, 'El rol debe ser CLIENTE o TECNICO.');
    }
    if (rawPhone !== undefined && rawPhone !== null && typeof rawPhone !== 'string') {
      return invalidInput(res, 'El teléfono debe ser texto.');
    }
    if (!jwtSecret) {
      return next(new Error('JWT_SECRET is not configured.'));
    }

    try {
      const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existing) {
        return res.status(409).json({ error: 'El email ya está registrado.' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          fullName,
          phone: typeof rawPhone === 'string' ? rawPhone.trim() || null : null,
          role,
        },
        select: publicUserSelect,
      });
      const token = jwt.sign(
        { userId: user.id, role: user.role },
        jwtSecret,
        { expiresIn: '7d', algorithm: 'HS256' },
      );

      return res.status(201).json({ user, token });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return res.status(409).json({ error: 'El email ya está registrado.' });
      }
      return next(error);
    }
  };

  const login: RequestHandler = async (req, res, next) => {
    const body: unknown = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return invalidInput(res, 'El cuerpo de la solicitud debe ser un objeto JSON.');
    }

    const input = body as Record<string, unknown>;
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password = typeof input.password === 'string' ? input.password : '';

    if (!email || !password) {
      return invalidInput(res, 'Email y contraseña son obligatorios.');
    }
    if (!emailPattern.test(email)) {
      return invalidInput(res, 'El email no tiene un formato válido.');
    }
    if (password.length < 8) {
      return invalidInput(res, 'La contraseña debe tener al menos 8 caracteres.');
    }
    if (!jwtSecret) {
      return next(new Error('JWT_SECRET is not configured.'));
    }

    try {
      const user = await prisma.user.findUnique({
        where: { email },
        select: loginUserSelect,
      });

      if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
        return res.status(401).json({ error: 'Credenciales inválidas.' });
      }

      const { passwordHash: _passwordHash, ...publicUser } = user;
      const token = jwt.sign(
        { userId: user.id, role: user.role },
        jwtSecret,
        { expiresIn: '7d', algorithm: 'HS256' },
      );

      return res.status(200).json({ user: publicUser, token });
    } catch (error) {
      return next(error);
    }
  };

  return { register, login };
}
