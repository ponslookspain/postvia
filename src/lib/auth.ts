import { prisma } from "@/lib/prisma";

const DEMO_USER_ID = "demo-user";

export async function getOrCreateDemoUser() {
  return prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    update: {},
    create: {
      id: DEMO_USER_ID,
      email: "demo@postvia.com",
      name: "Demo User",
    },
  });
}

export { DEMO_USER_ID };
