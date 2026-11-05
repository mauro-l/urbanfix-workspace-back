import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createAuthController } from '../controllers/auth.controller.js';
import { prisma as defaultPrisma } from '../lib/prisma.js';

export function createAuthRouter(
  prisma: PrismaClient = defaultPrisma,
  jwtSecret = process.env.JWT_SECRET,
) {
  const router = Router();
  const auth = createAuthController(prisma, jwtSecret);

  router.post('/register', auth.register);
  router.post('/login', auth.login);

  return router;
}
