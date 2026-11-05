import pkg from '@prisma/client';
import bcrypt from 'bcryptjs';

const { PrismaClient } = pkg;

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Urbanfix123!';

// Deterministic ids so the seed is idempotent and frontend fixtures keep
// pointing at the same records across resets.
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const TECHNICIAN_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = '33333333-3333-4333-8333-333333333333';

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

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

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
    update: {},
    create: {
      id: TECHNICIAN_ID,
      email: 'tecnico@urbanfix.test',
      passwordHash,
      fullName: 'Técnico Demo',
      phone: '+54 11 5555-0002',
      role: 'TECNICO',
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

  for (const service of SERVICES) {
    await prisma.service.upsert({
      where: { slug: service.slug },
      update: { name: service.name, description: service.description },
      create: service,
    });
  }

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

  console.log('Seed complete.');
  console.log(`  client:     ${client.email} / ${DEMO_PASSWORD}`);
  console.log(`  technician: ${technician.email} / ${DEMO_PASSWORD}`);
  console.log(`  admin:      admin@urbanfix.test / ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
