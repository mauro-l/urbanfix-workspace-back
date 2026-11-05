import { UserRole, type PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { authorize, createAuthenticate } from '../middleware/auth.middleware.js';
import { prisma as defaultPrisma } from '../lib/prisma.js';

export function createAdminRouter(
  prisma: PrismaClient = defaultPrisma,
  jwtSecret = process.env.JWT_SECRET,
) {
  const router = Router();

  // Every admin route requires authentication and an active ADMIN account.
  router.use(createAuthenticate(prisma, jwtSecret), authorize(UserRole.ADMIN));

  return router;
}
