import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Create stores
  const store1 = await prisma.store.create({
    data: {
      name: 'Downtown Store',
      address: '123 Main St',
    },
  });

  const store2 = await prisma.store.create({
    data: {
      name: 'Uptown Store',
      address: '456 Oak Ave',
    },
  });

  // Create users
  const hashedPassword = await bcrypt.hash('password123', 10);

  await prisma.user.create({
    data: {
      email: 'admin@example.com',
      password: hashedPassword,
      firstName: 'John',
      lastName: 'Smith',
      role: Role.ALL_STORE_MANAGER,
      storeId: store1.id,
    },
  });

  await prisma.user.create({
    data: {
      email: 'manager@example.com',
      password: hashedPassword,
      firstName: 'Emma',
      lastName: 'Davis',
      role: Role.MANAGER,
      storeId: store1.id,
    },
  });

  await prisma.user.create({
    data: {
      email: 'employee@example.com',
      password: hashedPassword,
      firstName: 'Sarah',
      lastName: 'Johnson',
      role: Role.EMPLOYEE,
      storeId: store1.id,
    },
  });

  console.log('Seed data created successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });