import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/auth";

const DEFAULT_PREFERENCES = {
  emailNotifications: true,
  productUpdates: true,
};

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const prefs = await prisma.userPreferences.findUnique({
      where: { userId: user.id },
    });

    return NextResponse.json({
      ...DEFAULT_PREFERENCES,
      ...(prefs ?? {}),
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to load preferences" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const data: {
      emailNotifications?: boolean;
      productUpdates?: boolean;
    } = {};

    if (body?.emailNotifications !== undefined) {
      if (typeof body.emailNotifications !== "boolean") {
        return NextResponse.json(
          { error: "Invalid emailNotifications value" },
          { status: 400 }
        );
      }
      data.emailNotifications = body.emailNotifications;
    }
    if (body?.productUpdates !== undefined) {
      if (typeof body.productUpdates !== "boolean") {
        return NextResponse.json(
          { error: "Invalid productUpdates value" },
          { status: 400 }
        );
      }
      data.productUpdates = body.productUpdates;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "Nothing to update" },
        { status: 400 }
      );
    }

    const prefs = await prisma.userPreferences.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    });

    return NextResponse.json({ ...DEFAULT_PREFERENCES, ...prefs });
  } catch {
    return NextResponse.json(
      { error: "Failed to save preferences" },
      { status: 500 }
    );
  }
}