import pkg from '@prisma/client';
import bcrypt from 'bcryptjs';

const { PrismaClient } = pkg;

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Urbanfix123!';
const FIXTURE_PASSWORD = 'Password123';

// Deterministic ids so the seed is idempotent and frontend fixtures keep
// pointing at the same records across resets.
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const TECHNICIAN_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = '33333333-3333-4333-8333-333333333333';
const FIXTURE_CLIENT_ID = '44444444-4444-4444-8444-444444444444';
const FIXTURE_PLUMBER_ID = '55555555-5555-4555-8555-555555555555';
const FIXTURE_ELECTRICIAN_ID = '66666666-6666-4666-8666-666666666666';
const FIXTURE_ADMIN_ID = '77777777-7777-4777-8777-777777777777';

const SERVICES = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    name: 'Plomería',
    slug: 'plomeria',
    description: 'Reparación de cañerías, pérdidas y grifería.',
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    name: 'Electricidad',
    slug: 'electricidad',
    description: 'Instalaciones, tableros y reparaciones eléctricas.',
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    name: 'Pintura',
    slug: 'pintura',
    description: 'Pintura interior y exterior.',
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
    name: 'Carpintería',
    slug: 'carpinteria',
    description: 'Muebles a medida, puertas y reparaciones en madera.',
  },
] as const;

const DEMO_TECHNICIAN_SERVICES = [{ slug: 'plomeria' }, { slug: 'electricidad' }] as const;

const REQUESTS = [
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    clientId: CLIENT_ID,
    technicianId: null,
    serviceId: SERVICES[0].id,
    title: 'Pérdida en la cocina',
    description: 'Gotea la canilla debajo de la mesada desde hace dos días.',
    address: 'Av. Siempre Viva 742',
    budget: '15000.00',
    status: 'PENDIENTE',
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    clientId: CLIENT_ID,
    technicianId: TECHNICIAN_ID,
    serviceId: SERVICES[1].id,
    title: 'Tablero que salta',
    description: 'El disyuntor salta cuando se conectan dos artefactos.',
    address: 'Calle Falsa 123',
    budget: '22000.00',
    status: 'ACEPTADA',
  },
] as const;

const FIXTURE_REQUESTS = [
  {
    id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    technician: null,
    serviceSlug: 'plomeria',
    title: 'Fuga de agua en el baño',
    description: 'El inodoro pierde agua por la base.',
    address: 'Av. Siempre Viva 742, Springfield',
    status: 'PENDIENTE',
    createdAt: '2026-10-31T10:00:00Z',
    acceptedAt: null,
  },
  {
    id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
    technician: 'electrician',
    serviceSlug: 'electricidad',
    title: 'Instalación de lámpara',
    description: 'Instalar lámpara de techo en la sala.',
    address: 'Calle Falsa 123, Springfield',
    status: 'ACEPTADA',
    createdAt: '2026-10-30T09:00:00Z',
    acceptedAt: '2026-10-30T09:30:00Z',
  },
] as const;

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const fixturePasswordHash = await bcrypt.hash(FIXTURE_PASSWORD, 10);
  const serviceIdsBySlug = new Map<string, string>();

  for (const service of SERVICES) {
    const persistedService = await prisma.service.upsert({
      where: { slug: service.slug },
      update: { name: service.name, description: service.description },
      create: service,
    });
    serviceIdsBySlug.set(service.slug, persistedService.id);
  }

  const client = await prisma.user.upsert({
    where: { email: 'cliente@urbanfix.test' },
    update: {},
    create: {
      id: CLIENT_ID,
      email: 'cliente@urbanfix.test',
      passwordHash,
      fullName: 'Cliente Demo',
      phone: '+54 11 5555-0001',
      role: 'CLIENTE',
    },
  });

  const technician = await prisma.user.upsert({
    where: { email: 'tecnico@urbanfix.test' },
    update: { services: { set: [...DEMO_TECHNICIAN_SERVICES] } },
    create: {
      id: TECHNICIAN_ID,
      email: 'tecnico@urbanfix.test',
      passwordHash,
      fullName: 'Técnico Demo',
      phone: '+54 11 5555-0002',
      role: 'TECNICO',
      services: { connect: [...DEMO_TECHNICIAN_SERVICES] },
    },
  });

  await prisma.user.upsert({
    where: { email: 'admin@urbanfix.test' },
    update: {},
    create: {
      id: ADMIN_ID,
      email: 'admin@urbanfix.test',
      passwordHash,
      fullName: 'Admin Demo',
      role: 'ADMIN',
    },
  });

  const fixtureClient = await prisma.user.upsert({
    where: { email: 'juan@test.com' },
    update: {},
    create: {
      id: FIXTURE_CLIENT_ID,
      email: 'juan@test.com',
      passwordHash: fixturePasswordHash,
      fullName: 'Juan Cliente',
      role: 'CLIENTE',
    },
  });

  await prisma.user.upsert({
    where: { email: 'pedro@test.com' },
    update: { services: { set: [{ slug: 'plomeria' }] } },
    create: {
      id: FIXTURE_PLUMBER_ID,
      email: 'pedro@test.com',
      passwordHash: fixturePasswordHash,
      fullName: 'Pedro Plomero',
      role: 'TECNICO',
      services: { connect: [{ slug: 'plomeria' }] },
    },
  });

  const fixtureElectrician = await prisma.user.upsert({
    where: { email: 'maria@test.com' },
    update: { services: { set: [{ slug: 'electricidad' }] } },
    create: {
      id: FIXTURE_ELECTRICIAN_ID,
      email: 'maria@test.com',
      passwordHash: fixturePasswordHash,
      fullName: 'Maria Electricista',
      role: 'TECNICO',
      services: { connect: [{ slug: 'electricidad' }] },
    },
  });

  await prisma.user.upsert({
    where: { email: 'admin@test.com' },
    update: {},
    create: {
      id: FIXTURE_ADMIN_ID,
      email: 'admin@test.com',
      passwordHash: fixturePasswordHash,
      fullName: 'Admin UrbanFix',
      role: 'ADMIN',
    },
  });

  for (const request of REQUESTS) {
    await prisma.serviceRequest.upsert({
      where: { id: request.id },
      update: {},
      create: {
        ...request,
        technicianId: request.technicianId,
        acceptedAt: request.status === 'ACEPTADA' ? new Date() : null,
      },
    });
  }

  for (const request of FIXTURE_REQUESTS) {
    const serviceId = serviceIdsBySlug.get(request.serviceSlug);
    if (!serviceId) {
      throw new Error(`Missing fixture service: ${request.serviceSlug}`);
    }

    const technicianId =
      request.technician === 'electrician' ? fixtureElectrician.id : null;
    const createdAt = new Date(request.createdAt);
    const acceptedAt = request.acceptedAt ? new Date(request.acceptedAt) : null;
    const requestData = {
      clientId: fixtureClient.id,
      technicianId,
      serviceId,
      title: request.title,
      description: request.description,
      address: request.address,
      budget: null,
      status: request.status,
      createdAt,
      acceptedAt,
    };

    await prisma.serviceRequest.upsert({
      where: { id: request.id },
      update: requestData,
      create: { id: request.id, ...requestData },
    });
  }

  console.log('Seed complete.');
  console.log(`  client:     ${client.email} / ${DEMO_PASSWORD}`);
  console.log(`  technician: ${technician.email} / ${DEMO_PASSWORD}`);
  console.log(`  admin:      admin@urbanfix.test / ${DEMO_PASSWORD}`);
  console.log('  fixture users: juan@test.com, pedro@test.com, maria@test.com, admin@test.com');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
