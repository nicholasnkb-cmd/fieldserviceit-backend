import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const password = process.env.SUPER_ADMIN_INITIAL_PASSWORD;
  if (!password || password.length < 16) throw new Error('SUPER_ADMIN_INITIAL_PASSWORD must be at least 16 characters');
  const hash = await bcrypt.hash(password, 12);
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
  console.log('Initial password was supplied securely through SUPER_ADMIN_INITIAL_PASSWORD.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
