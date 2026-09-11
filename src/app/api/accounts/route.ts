import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";
import { getCapabilitiesRegistry } from "@/lib/platforms/capabilities";

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const implemented = new Set(
      getCapabilitiesRegistry()
        .filter((capability) => capability.implemented)
        .map((capability) => capability.platform)
    );
    const accounts = await prisma.socialAccount.findMany({
      where: { userId: user.id },
      select: { id: true, platform: true, externalId: true, username: true },
      orderBy: [{ platform: "asc" }, { username: "asc" }],
    });
    return NextResponse.json(
      accounts.map((account) => ({
        ...account,
        implemented: implemented.has(account.platform),
      }))
    );
  } catch {
    return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
}
