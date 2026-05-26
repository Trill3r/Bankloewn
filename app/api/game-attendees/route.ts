import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("gameId");
  if (!gameId) return NextResponse.json({ error: "gameId required" }, { status: 400 });

  const attendees = await prisma.gameAttendee.findMany({
    where: { gameId },
    include: { profile: true },
  });
  return NextResponse.json(attendees);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { gameId, profileId } = body;

  const attendee = await prisma.gameAttendee.upsert({
    where: { gameId_profileId: { gameId, profileId } },
    update: {},
    create: { gameId, profileId },
    include: { profile: true },
  });
  return NextResponse.json(attendee, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("gameId");
  const profileId = searchParams.get("profileId");
  if (!gameId || !profileId) return NextResponse.json({ error: "gameId and profileId required" }, { status: 400 });

  await prisma.gameAttendee.deleteMany({ where: { gameId, profileId } });
  return NextResponse.json({ success: true });
}
