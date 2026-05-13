import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('admin123', 12);
  const user = await prisma.user.upsert({
    where: { email: 'super@fieldserviceit.com' },
    update: { role: 'SUPER_ADMIN' },
    create: {
      email: 'super@fieldserviceit.com',
      passwordHash: hash,
      firstName: 'Super',
      lastName: 'Admin',
      role: 'SUPER_ADMIN',
      userType: 'BUSINESS',
    },
  });
  console.log('SUPER_ADMIN created:', user.email);
  console.log('Password: admin123');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
