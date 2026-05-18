import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Find the first store to attach the new employees to.
  const store = await prisma.store.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!store) {
    console.error('No store found. Run `npx prisma db seed` first.');
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash('password123', 10);

  const newEmployees = [
    { email: 'employee2@example.com', firstName: 'Linda',   lastName: 'Berzina' },
    { email: 'employee3@example.com', firstName: 'Mark',    lastName: 'Ozolins' },
  ];

  for (const emp of newEmployees) {
    const existing = await prisma.user.findUnique({ where: { email: emp.email } });
    if (existing) {
      console.log(`Skipping ${emp.email} – already exists`);
      continue;
    }
    await prisma.user.create({
      data: {
        email:     emp.email,
        password:  hashedPassword,
        firstName: emp.firstName,
        lastName:  emp.lastName,
        role:      Role.EMPLOYEE,
        storeId:   store.id,
      },
    });
    console.log(`Created ${emp.firstName} ${emp.lastName} (${emp.email})`);
  }

  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
