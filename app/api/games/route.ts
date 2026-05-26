import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tournamentId = searchParams.get("tournamentId");
  if (!tournamentId) return NextResponse.json({ error: "tournamentId required" }, { status: 400 });

  const games = await prisma.game.findMany({
    where: { tournamentId },
    include: {
      lineups: { include: { profile: true } },
      stats: { include: { profile: true }, orderBy: { recordedAt: "asc" } },
      attendees: { include: { profile: true } },
      timeouts: { orderBy: { recordedAt: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(games);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { tournamentId, name, opponentName } = body;

  const game = await prisma.game.create({
    data: { tournamentId, name, opponentName },
  });
  return NextResponse.json(game, { status: 201 });
}
