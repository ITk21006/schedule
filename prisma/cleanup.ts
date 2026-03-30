import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Delete all approvals first (due to foreign keys)
  const approvals = await prisma.approval.deleteMany();
  console.log(`Deleted ${approvals.count} approvals`);

  // Delete all schedule entries
  const entries = await prisma.scheduleEntry.deleteMany();
  console.log(`Deleted ${entries.count} schedule entries`);

  // Delete all schedules
  const schedules = await prisma.schedule.deleteMany();
  console.log(`Deleted ${schedules.count} schedules`);

  console.log('All schedules cleaned up.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
