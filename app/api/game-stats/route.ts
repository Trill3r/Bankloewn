import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pusherServer } from "@/lib/pusher";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tournamentId = searchParams.get("tournamentId");
  if (!tournamentId) return NextResponse.json({ error: "tournamentId required" }, { status: 400 });

  const stats = await prisma.gameStat.findMany({
    where: { tournamentId },
    include: { profile: true },
    orderBy: { recordedAt: "desc" },
  });
  return NextResponse.json(stats);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { gameId, profileId, tournamentId, statType } = body;

  const stat = await prisma.gameStat.create({
    data: { gameId, profileId, tournamentId, statType },
    include: { profile: true },
  });

  await pusherServer.trigger(`game-${gameId}`, "new_game_stat", stat);
  return NextResponse.json(stat, { status: 201 });
}
