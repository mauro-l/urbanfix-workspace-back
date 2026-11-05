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
  services: StoredService[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type StoredService = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
};

type FakePrismaOptions = Partial<StoredUser>[];
type FakeServiceOptions = Partial<StoredService>[];

function createFakePrisma(
  seedUsers: FakePrismaOptions = [],
  seedServices: FakeServiceOptions = [],
) {
  const services: StoredService[] = seedServices.map((service, index) => ({
    id: service.id ?? `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    name: service.name ?? `Service ${index}`,
    slug: service.slug ?? `service-${index}`,
    isActive: service.isActive ?? true,
  }));
  const users: StoredUser[] = seedUsers.map((user, index) => ({
    id: user.id ?? `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    email: user.email ?? `user${index}@example.test`,
    passwordHash: user.passwordHash ?? 'unused-hash',
    fullName: user.fullName ?? `User ${index}`,
    phone: user.phone ?? null,
    role: user.role ?? ('CLIENTE' as UserRole),
    services: user.services ?? [],
    isActive: user.isActive ?? true,
    createdAt: user.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: user.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
  }));

  function project(user: StoredUser, select?: Record<string, unknown>) {
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
        select?: Record<string, unknown>;
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
        data: Omit<StoredUser, 'id' | 'isActive' | 'createdAt' | 'updatedAt' | 'services'> & {
          services?: { connect: { id: string }[] };
        };
        select?: Record<string, unknown>;
      }) => {
        if (users.some((user) => user.email === data.email)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }

        const user: StoredUser = {
          ...data,
          services: (data.services?.connect ?? [])
            .map(({ id }) => services.find((service) => service.id === id))
            .filter((service): service is StoredService => service !== undefined),
          id: `00000000-0000-4000-8000-${String(users.length + 1).padStart(12, '0')}`,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        users.push(user);
        return project(user, select);
      },
    },
    service: {
      findMany: async ({
        where,
      }: {
        where: { id?: { in?: string[] }; isActive?: boolean };
      }) =>
        services.filter(
          (service) =>
            (!where.id?.in || where.id.in.includes(service.id)) &&
            (where.isActive === undefined || service.isActive === where.isActive),
        ),
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
      user: Record<string, unknown> & { services: StoredService[] };
      token: string;
    };

    assert.equal(response.status, 201);
    assert.equal(body.user.email, 'ana@example.test');
    assert.equal(body.user.fullName, 'Ana Pérez');
    assert.equal(body.user.role, 'CLIENTE');
    assert.deepEqual(body.user.services, []);
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

test('registration associates a technician with multiple services and returns them', async () => {
  const serviceIds = [
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
  ];
  const { prisma, users } = createFakePrisma([], [
    { id: serviceIds[0], name: 'Plomería', slug: 'plomeria' },
    { id: serviceIds[1], name: 'Electricidad', slug: 'electricidad' },
  ]);
  const app = createApp({ prisma, jwtSecret: JWT_SECRET });

  await withServer(app, async (baseUrl) => {
    const response = await sendJson(baseUrl, '/api/auth/register', 'POST', {
      email: 'tecnico@example.test',
      password: DEMO_PASSWORD,
      fullName: 'Técnico con varios rubros',
      role: 'TECNICO',
      serviceIds,
    });
    const body = (await response.json()) as {
      user: { services: { id: string; name: string; slug: string }[] };
    };

    assert.equal(response.status, 201);
    assert.deepEqual(
      body.user.services.map(({ id }) => id),
      serviceIds,
    );
    assert.deepEqual(
      users[0]?.services.map(({ id }) => id),
      serviceIds,
    );
  });
});

test('technician registration remains compatible without serviceIds or with an empty list', async () => {
  const { prisma, users } = createFakePrisma();
  const app = createApp({ prisma, jwtSecret: JWT_SECRET });

  await withServer(app, async (baseUrl) => {
    for (const [index, includeServiceIds] of [false, true].entries()) {
      const response = await sendJson(baseUrl, '/api/auth/register', 'POST', {
        email: `legacy-tech-${index}@example.test`,
        password: DEMO_PASSWORD,
        fullName: 'Técnico',
        role: 'TECNICO',
        ...(includeServiceIds ? { serviceIds: [] } : {}),
      });
      const body = (await response.json()) as {
        user: { services: StoredService[] };
      };

      assert.equal(response.status, 201);
      assert.deepEqual(body.user.services, []);
    }

    assert.equal(users.length, 2);
  });
});

test('registration rejects service selections for a client', async () => {
  const { prisma, users } = createFakePrisma([], [
    { id: '10000000-0000-4000-8000-000000000001', name: 'Plomería', slug: 'plomeria' },
  ]);
  const app = createApp({ prisma, jwtSecret: JWT_SECRET });

  await withServer(app, async (baseUrl) => {
    const response = await sendJson(baseUrl, '/api/auth/register', 'POST', {
      email: 'cliente@example.test',
      password: DEMO_PASSWORD,
      fullName: 'Cliente',
      role: 'CLIENTE',
      serviceIds: ['10000000-0000-4000-8000-000000000001'],
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: 'Solo los técnicos pueden ofrecer servicios.',
    });
    assert.equal(users.length, 0);
  });
});

test('registration rejects unknown, inactive, or malformed service selections', async () => {
  const { prisma, users } = createFakePrisma([], [
    { id: '10000000-0000-4000-8000-000000000001', name: 'Plomería', slug: 'plomeria' },
    {
      id: '10000000-0000-4000-8000-000000000002',
      name: 'Electricidad',
      slug: 'electricidad',
      isActive: false,
    },
  ]);
  const app = createApp({ prisma, jwtSecret: JWT_SECRET });

  await withServer(app, async (baseUrl) => {
    const invalidSelections: { serviceIds: unknown; error: string }[] = [
      { serviceIds: ['not-a-uuid'], error: 'Los servicios deben ser UUID válidos sin duplicados.' },
      {
        serviceIds: [
          '10000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001',
        ],
        error: 'Los servicios deben ser UUID válidos sin duplicados.',
      },
      { serviceIds: '10000000-0000-4000-8000-000000000001', error: 'Los servicios deben ser UUID válidos sin duplicados.' },
      { serviceIds: ['10000000-0000-4000-8000-000000000002'], error: 'Uno o más servicios no existen o están inactivos.' },
      { serviceIds: ['10000000-0000-4000-8000-000000000003'], error: 'Uno o más servicios no existen o están inactivos.' },
    ];
    for (const [index, { serviceIds, error }] of invalidSelections.entries()) {
      const response = await sendJson(baseUrl, '/api/auth/register', 'POST', {
        email: `tecnico-${index}@example.test`,
        password: DEMO_PASSWORD,
        fullName: 'Técnico',
        role: 'TECNICO',
        serviceIds,
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error,
      });
      assert.equal(users.length, 0);
    }
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
  const technicianServices: StoredService[] = [
    {
      id: '10000000-0000-4000-8000-000000000001',
      name: 'Plomería',
      slug: 'plomeria',
      isActive: true,
    },
    {
      id: '10000000-0000-4000-8000-000000000002',
      name: 'Electricidad',
      slug: 'electricidad',
      isActive: true,
    },
  ];
  const { prisma } = createFakePrisma([
    {
      email: 'ana@example.test',
      passwordHash,
      fullName: 'Ana Pérez',
      role: 'TECNICO' as UserRole,
      services: technicianServices,
    },
  ]);
  const app = createApp({ prisma, jwtSecret: JWT_SECRET });

  await withServer(app, async (baseUrl) => {
    const response = await sendJson(baseUrl, '/api/auth/login', 'POST', {
      email: ' ANA@Example.Test ',
      password: DEMO_PASSWORD,
    });
    const body = (await response.json()) as {
      user: Record<string, unknown> & { services: StoredService[] };
      token: string;
    };

    assert.equal(response.status, 200);
    assert.equal(body.user.email, 'ana@example.test');
    assert.equal(body.user.role, 'TECNICO');
    assert.deepEqual(
      body.user.services.map(({ slug }) => slug),
      ['plomeria', 'electricidad'],
    );
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
