const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { DEFAULT_FRAMES, DEFAULT_EYES, DEFAULT_DIALOGUES, DEFAULT_TIE_BREAKERS } = require('../src/services/catalogService');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Seed demo user
  const adminPassword = await bcrypt.hash('password123', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@guesstheframe.local',
      passwordHash: adminPassword,
      avatar: 'aman',
      role: 'admin',
      totalGames: 10,
      totalWins: 7,
      totalPoints: 240
    }
  });
  console.log('✅ Admin user seeded:', admin.username);

  // 2. Seed frames
  for (const frame of DEFAULT_FRAMES) {
    await prisma.catalogItem.create({
      data: {
        category: 'frames',
        type: frame.type,
        content: frame.content,
        answer: frame.answer,
        year: frame.year
      }
    });
  }
  console.log(`✅ ${DEFAULT_FRAMES.length} movie frames seeded.`);

  // 3. Seed eyes
  for (const eye of DEFAULT_EYES) {
    await prisma.catalogItem.create({
      data: {
        category: 'eyes',
        type: eye.type,
        content: eye.content,
        answer: eye.answer,
        year: eye.year
      }
    });
  }
  console.log(`✅ ${DEFAULT_EYES.length} eye portraits seeded.`);

  // 4. Seed dialogues
  for (const d of DEFAULT_DIALOGUES) {
    await prisma.catalogItem.create({
      data: {
        category: 'dialogue',
        type: d.type,
        content: d.content,
        answer: d.answer,
        year: d.year
      }
    });
  }
  console.log(`✅ ${DEFAULT_DIALOGUES.length} dialogue trivia items seeded.`);

  // 5. Seed tie-breakers
  for (const tb of DEFAULT_TIE_BREAKERS) {
    await prisma.catalogItem.create({
      data: {
        category: 'tie_breaker',
        type: tb.type,
        content: tb.content,
        answer: tb.answer,
        year: tb.year
      }
    });
  }
  console.log(`✅ ${DEFAULT_TIE_BREAKERS.length} tie breaker stills seeded.`);

  console.log('🎉 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
