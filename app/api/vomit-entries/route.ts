import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pusherServer } from "@/lib/pusher";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tournamentId = searchParams.get("tournamentId");
  if (!tournamentId) return NextResponse.json({ error: "tournamentId required" }, { status: 400 });

  const entries = await prisma.vomitEntry.findMany({
    where: { tournamentId },
    include: { profile: true },
    orderBy: { recordedAt: "desc" },
  });
  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { profileId, tournamentId, notes, recordedAt } = body;

  const entry = await prisma.vomitEntry.create({
    data: {
      profileId,
      tournamentId,
      notes,
      recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
    },
    include: { profile: true },
  });

  await pusherServer.trigger(`tournament-${tournamentId}`, "new_vomit_entry", entry);
  return NextResponse.json(entry, { status: 201 });
}
