import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { createAuthenticate } from '../middleware/auth.middleware.js';
import { prisma as defaultPrisma } from '../lib/prisma.js';

export function createRequestsRouter(
  prisma: PrismaClient = defaultPrisma,
  jwtSecret = process.env.JWT_SECRET,
) {
  const router = Router();

  // All service-request routes require a valid JWT; individual handlers add role guards.
  router.use(createAuthenticate(prisma, jwtSecret));

  return router;
}
