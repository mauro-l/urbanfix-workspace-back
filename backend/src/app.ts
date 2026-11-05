import cors from 'cors';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
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

  // Render terminates TLS at its proxy; without this Express reports http.
  app.set('trust proxy', 1);
  app.use(cors());
  app.use(express.json());

  // Serve the spec with the request origin so "Try it out" hits the same host
  // that served /docs (local, Docker or Render) instead of a hardcoded URL.
  const buildSpec = (req: Request) => {
    const host = req.get('host');
    return {
      ...openapi,
      servers: [
        {
          url: host ? `${req.protocol}://${host}` : '/',
          description: 'Current origin',
        },
      ],
    };
  };

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
  });

  app.get('/openapi.json', (req, res) => {
    res.json(buildSpec(req));
  });

  app.use('/docs', swaggerUi.serve, (req: Request, res: Response, next: NextFunction) => {
    swaggerUi.setup(buildSpec(req), { customSiteTitle: 'UrbanFix API' })(req, res, next);
  });
  app.use('/api/auth', createAuthRouter(prisma, jwtSecret));
  app.use('/api/requests', createRequestsRouter(prisma, jwtSecret));
  app.use('/api/admin', createAdminRouter(prisma, jwtSecret));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
