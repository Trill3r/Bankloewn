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
      _count: { select: { stats: true } },
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
