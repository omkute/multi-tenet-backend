import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const OWNER_ID = "00000000-0000-0000-0000-000000000001";
const ADMIN_ID = "00000000-0000-0000-0000-000000000002";
const MEMBER_ID = "00000000-0000-0000-0000-000000000003";
const ORG_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_ID = "00000000-0000-0000-0000-000000000020";

async function seed() {
  const owner = await prisma.user.upsert({
    where: { id: OWNER_ID },
    update: {},
    create: {
      id: OWNER_ID,
      email: "owner@example.com",
      passwordHash: "$2b$10$placeholder",
      name: "Alice Owner",
    },
  });

  const admin = await prisma.user.upsert({
    where: { id: ADMIN_ID },
    update: {},
    create: {
      id: ADMIN_ID,
      email: "admin@example.com",
      passwordHash: "$2b$10$placeholder",
      name: "Bob Admin",
    },
  });

  const member = await prisma.user.upsert({
    where: { id: MEMBER_ID },
    update: {},
    create: {
      id: MEMBER_ID,
      email: "member@example.com",
      passwordHash: "$2b$10$placeholder",
      name: "Charlie Member",
    },
  });

  const org = await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: {},
    create: {
      id: ORG_ID,
      name: "Acme Corp",
      slug: "acme-corp",
    },
  });

  await prisma.membership.upsert({
    where: { userId_orgId: { userId: OWNER_ID, orgId: ORG_ID } },
    update: {},
    create: {
      userId: OWNER_ID,
      orgId: ORG_ID,
      role: "OWNER",
    },
  });

  await prisma.membership.upsert({
    where: { userId_orgId: { userId: ADMIN_ID, orgId: ORG_ID } },
    update: {},
    create: {
      userId: ADMIN_ID,
      orgId: ORG_ID,
      role: "ADMIN",
    },
  });

  await prisma.membership.upsert({
    where: { userId_orgId: { userId: MEMBER_ID, orgId: ORG_ID } },
    update: {},
    create: {
      userId: MEMBER_ID,
      orgId: ORG_ID,
      role: "MEMBER",
    },
  });

  await prisma.project.upsert({
    where: { id: PROJECT_ID },
    update: {},
    create: {
      id: PROJECT_ID,
      name: "Default Project",
      description: "The first project in Acme Corp",
      orgId: ORG_ID,
      createdById: OWNER_ID,
    },
  });

  console.log("Seed complete");
  console.log(`  Users: ${owner.email}, ${admin.email}, ${member.email}`);
  console.log(`  Organization: ${org.slug}`);
  console.log(`  Memberships: 3 roles (OWNER, ADMIN, MEMBER)`);
  console.log(`  Project: Default Project`);
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
