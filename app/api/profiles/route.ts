import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tournamentId = searchParams.get("tournamentId");
  if (!tournamentId) return NextResponse.json({ error: "tournamentId required" }, { status: 400 });

  const profiles = await prisma.profile.findMany({
    where: { tournamentId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(profiles);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { nickname, avatarColor, tournamentId } = body;

  const existing = await prisma.profile.findFirst({
    where: { nickname, tournamentId },
  });
  if (existing) return NextResponse.json(existing);

  const profile = await prisma.profile.create({
    data: { nickname, avatarColor, tournamentId },
  });
  return NextResponse.json(profile, { status: 201 });
}
