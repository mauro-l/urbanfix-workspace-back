import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import type { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import express, { type Express } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { createApp } from '../app.js';
import { errorHandler } from '../middleware/error.middleware.js';
import { authorize, createAuthenticate } from '../middleware/auth.middleware.js';

const JWT_SECRET = 'test-only-secret-that-is-long-enough';
const DEMO_PASSWORD = 'correct-horse-battery';

type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type FakePrismaOptions = Partial<StoredUser>[];

function createFakePrisma(seedUsers: FakePrismaOptions = []) {
  const users: StoredUser[] = seedUsers.map((user, index) => ({
    id: user.id ?? `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    email: user.email ?? `user${index}@example.test`,
    passwordHash: user.passwordHash ?? 'unused-hash',
    fullName: user.fullName ?? `User ${index}`,
    phone: user.phone ?? null,
    role: user.role ?? ('CLIENTE' as UserRole),
    isActive: user.isActive ?? true,
    createdAt: user.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: user.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
  }));

  function project(user: StoredUser, select?: Record<string, boolean>) {
    if (!select) return user;
    return Object.fromEntries(
      Object.entries(select)
        .filter(([, included]) => included)
        .map(([field]) => [field, user[field as keyof StoredUser]]),
    );
  }

  const client = {
    user: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { id?: string; email?: string };
        select?: Record<string, boolean>;
      }) => {
        const user = users.find((candidate) =>
          where.id ? candidate.id === where.id : candidate.email === where.email,
        );
        return user ? project(user, select) : null;
      },
      create: async ({
        data,
        select,
      }: {
        data: Omit<StoredUser, 'id' | 'isActive' | 'createdAt' | 'updatedAt'>;
        select?: Record<string, boolean>;
      }) => {
        if (users.some((user) => user.email === data.email)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }

        const user: StoredUser = {
          ...data,
          id: `00000000-0000-4000-8000-${String(users.length + 1).padStart(12, '0')}`,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        users.push(user);
        return project(user, select);
      },
    },
  };

  return { prisma: client as unknown as PrismaClient, users };
}

async function withServer<T>(app: Express, run: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address() as AddressInfo;
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function sendJson(
  baseUrl: string,
  path: string,
  method: string,
  body?: unknown,
  authorization?: string,
) {
  const headers: Record<string, string> = { connection: 'close' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (authorization) headers.authorization = authorization;

  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('registration normalizes email, stores a bcrypt hash, and returns a JWT without exposing the hash', async () => {
  const { prisma, users } = createFakePrisma();
  const app = createApp({ prisma, jwtSecret: JWT_SECRET });

  await withServer(app, async (baseUrl) => {
    const response = await sendJson(baseUrl, '/api/auth/register', 'POST', {
      email: '  ANA@Example.Test ',
      password: DEMO_PASSWORD,
      fullName: 'Ana Pérez',
      phone: '+54 11 5555-0101',
      role: 'CLIENTE',
    });
    const body = (await response.json()) as {
      user: Record<string, unknown>;
      token: string;
    };

    assert.equal(response.status, 201);
    assert.equal(body.user.email, 'ana@example.test');
    assert.equal(body.user.fullName, 'Ana Pérez');
    assert.equal(body.user.role, 'CLIENTE');
    assert.equal('passwordHash' in body.user, false);
    assert.equal(users[0]?.email, 'ana@example.test');
    assert.notEqual(users[0]?.passwordHash, DEMO_PASSWORD);
    assert.equal(await bcrypt.compare(DEMO_PASSWORD, users[0]!.passwordHash), true);

    const tokenPayload = jwt.verify(body.token, JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload & {
      userId: string;
      role: string;
    };
    assert.equal(tokenPayload.userId, body.user.id);
    assert.equal(tokenPayload.role, 'CLIENTE');
  });
});

test('registration rejects short passwords, ADMIN, and duplicate emails', async () => {
  const { prisma } = createFakePrisma([
    {
      email: 'taken@example.test',
      role: 'CLIENTE' as UserRole,
    },
  ]);
  const app = createApp({ prisma, jwtSecret: JWT_SECRET });

  await withServer(app, async (baseUrl) => {
    const shortPassword = await sendJson(baseUrl, '/api/auth/register', 'POST', {
      email: 'short@example.test',
      password: 'short',
      fullName: 'Short Password',
      role: 'CLIENTE',
    });
    assert.equal(shortPassword.status, 400);

    const adminRegistration = await sendJson(baseUrl, '/api/auth/register', 'POST', {
      email: 'admin@example.test',
      password: DEMO_PASSWORD,
      fullName: 'Public Admin',
      role: 'ADMIN',
    });
    assert.equal(adminRegistration.status, 400);

    const duplicateEmail = await sendJson(baseUrl, '/api/auth/register', 'POST', {
      email: ' TAKEN@example.test ',
      password: DEMO_PASSWORD,
      fullName: 'Duplicate',
      role: 'CLIENTE',
    });
    assert.equal(duplicateEmail.status, 409);
    assert.deepEqual(await duplicateEmail.json(), {
      error: 'El email ya está registrado.',
    });
  });
});

test('login verifies password and returns the public user and JWT', async () => {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 4);
  const { prisma } = createFakePrisma([
    {
      email: 'ana@example.test',
      passwordHash,
      fullName: 'Ana Pérez',
      role: 'TECNICO' as UserRole,
    },
  ]);
  const app = createApp({ prisma, jwtSecret: JWT_SECRET });

  await withServer(app, async (baseUrl) => {
    const response = await sendJson(baseUrl, '/api/auth/login', 'POST', {
      email: ' ANA@Example.Test ',
      password: DEMO_PASSWORD,
    });
    const body = (await response.json()) as {
      user: Record<string, unknown>;
      token: string;
    };

    assert.equal(response.status, 200);
    assert.equal(body.user.email, 'ana@example.test');
    assert.equal(body.user.role, 'TECNICO');
    assert.equal('passwordHash' in body.user, false);
    assert.equal(
      (jwt.verify(body.token, JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload).role,
      'TECNICO',
    );
  });
});

test('login rejects passwords shorter than the documented minimum', async () => {
  const passwordHash = await bcrypt.hash('shortpw', 4);
  const { prisma } = createFakePrisma([
    { email: 'short@example.test', passwordHash },
  ]);
  const app = createApp({ prisma, jwtSecret: JWT_SECRET });

  await withServer(app, async (baseUrl) => {
    const response = await sendJson(baseUrl, '/api/auth/login', 'POST', {
      email: 'short@example.test',
      password: 'shortpw',
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: 'La contraseña debe tener al menos 8 caracteres.',
    });
  });
});

test('login returns the same generic 401 for unknown, incorrect, and inactive accounts', async () => {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 4);
  const { prisma } = createFakePrisma([
    {
      email: 'inactive@example.test',
      passwordHash,
      isActive: false,
      role: 'CLIENTE' as UserRole,
    },
  ]);
  const app = createApp({ prisma, jwtSecret: JWT_SECRET });

  await withServer(app, async (baseUrl) => {
    const attempts = await Promise.all([
      sendJson(baseUrl, '/api/auth/login', 'POST', {
        email: 'missing@example.test',
        password: DEMO_PASSWORD,
      }),
      sendJson(baseUrl, '/api/auth/login', 'POST', {
        email: 'inactive@example.test',
        password: 'wrong-password',
      }),
      sendJson(baseUrl, '/api/auth/login', 'POST', {
        email: 'inactive@example.test',
        password: DEMO_PASSWORD,
      }),
    ]);

    for (const response of attempts) {
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: 'Credenciales inválidas.' });
    }
  });
});

test('JWT middleware requires a valid active user and authorize enforces roles', async () => {
  const { prisma, users } = createFakePrisma([
    { id: '00000000-0000-4000-8000-000000000001', role: 'TECNICO' as UserRole },
    { id: '00000000-0000-4000-8000-000000000002', role: 'CLIENTE' as UserRole },
    {
      id: '00000000-0000-4000-8000-000000000003',
      role: 'TECNICO' as UserRole,
      isActive: false,
    },
  ]);
  const app = express();
  app.get(
    '/protected',
    createAuthenticate(prisma, JWT_SECRET),
    authorize('TECNICO'),
    (req, res) => res.json({ userId: req.user?.userId, role: req.user?.role }),
  );
  app.use(errorHandler);

  await withServer(app, async (baseUrl) => {
    const missing = await sendJson(baseUrl, '/protected', 'GET');
    assert.equal(missing.status, 401);

    const invalid = await sendJson(baseUrl, '/protected', 'GET', undefined, 'Bearer invalid');
    assert.equal(invalid.status, 401);

    const technicianToken = jwt.sign(
      { userId: users[0]!.id, role: 'TECNICO' },
      JWT_SECRET,
      { expiresIn: '7d', algorithm: 'HS256' },
    );
    const allowed = await sendJson(
      baseUrl,
      '/protected',
      'GET',
      undefined,
      `Bearer ${technicianToken}`,
    );
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), {
      userId: users[0]!.id,
      role: 'TECNICO',
    });

    const clientToken = jwt.sign(
      { userId: users[1]!.id, role: 'CLIENTE' },
      JWT_SECRET,
      { expiresIn: '7d', algorithm: 'HS256' },
    );
    const forbiddenRole = await sendJson(
      baseUrl,
      '/protected',
      'GET',
      undefined,
      `Bearer ${clientToken}`,
    );
    assert.equal(forbiddenRole.status, 403);

    const inactiveToken = jwt.sign(
      { userId: users[2]!.id, role: 'TECNICO' },
      JWT_SECRET,
      { expiresIn: '7d', algorithm: 'HS256' },
    );
    const inactive = await sendJson(
      baseUrl,
      '/protected',
      'GET',
      undefined,
      `Bearer ${inactiveToken}`,
    );
    assert.equal(inactive.status, 403);
  });
});

test('request and admin route groups apply authentication and admin role guards', async () => {
  const { prisma, users } = createFakePrisma([
    { id: '00000000-0000-4000-8000-000000000001', role: 'CLIENTE' as UserRole },
    { id: '00000000-0000-4000-8000-000000000002', role: 'ADMIN' as UserRole },
  ]);
  const app = createApp({ prisma, jwtSecret: JWT_SECRET });
  const clientToken = jwt.sign(
    { userId: users[0]!.id, role: 'CLIENTE' },
    JWT_SECRET,
    { expiresIn: '7d', algorithm: 'HS256' },
  );
  const adminToken = jwt.sign(
    { userId: users[1]!.id, role: 'ADMIN' },
    JWT_SECRET,
    { expiresIn: '7d', algorithm: 'HS256' },
  );

  await withServer(app, async (baseUrl) => {
    const publicRequests = await sendJson(baseUrl, '/api/requests', 'GET');
    assert.equal(publicRequests.status, 401);

    const clientAdminRequest = await sendJson(
      baseUrl,
      '/api/admin/users',
      'GET',
      undefined,
      `Bearer ${clientToken}`,
    );
    assert.equal(clientAdminRequest.status, 403);

    const authorizedAdminRequest = await sendJson(
      baseUrl,
      '/api/admin/users',
      'GET',
      undefined,
      `Bearer ${adminToken}`,
    );
    assert.equal(authorizedAdminRequest.status, 404);
  });
});
