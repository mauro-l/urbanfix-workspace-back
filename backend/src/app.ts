import cors from 'cors';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import type { PrismaClient } from '@prisma/client';
import { openapi } from './openapi.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { prisma as defaultPrisma } from './lib/prisma.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createAdminRouter } from './routes/admin.routes.js';
import { createRequestsRouter } from './routes/requests.routes.js';

type AppOptions = {
  prisma?: PrismaClient;
  jwtSecret?: string;
};

export function createApp(options: AppOptions = {}) {
  const app = express();
  const prisma = options.prisma ?? defaultPrisma;
  const jwtSecret = options.jwtSecret ?? process.env.JWT_SECRET;

  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
  });

  app.get('/openapi.json', (_req, res) => {
    res.json(openapi);
  });

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'UrbanFix API' }));
  app.use('/api/auth', createAuthRouter(prisma, jwtSecret));
  app.use('/api/requests', createRequestsRouter(prisma, jwtSecret));
  app.use('/api/admin', createAdminRouter(prisma, jwtSecret));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
