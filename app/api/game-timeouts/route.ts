import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pusherServer } from "@/lib/pusher";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("gameId");
  const tournamentId = searchParams.get("tournamentId");

  if (gameId) {
    const timeouts = await prisma.gameTimeout.findMany({
      where: { gameId },
      orderBy: { recordedAt: "asc" },
    });
    return NextResponse.json(timeouts);
  }

  if (tournamentId) {
    const timeouts = await prisma.gameTimeout.findMany({
      where: { game: { tournamentId } },
      include: { game: { select: { name: true, opponentName: true } } },
      orderBy: { recordedAt: "asc" },
    });
    return NextResponse.json(timeouts);
  }

  return NextResponse.json({ error: "gameId or tournamentId required" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { gameId, type } = body;
  if (!gameId || !type) return NextResponse.json({ error: "gameId and type required" }, { status: 400 });

  const timeout = await prisma.gameTimeout.create({
    data: { gameId, type },
  });

  await pusherServer.trigger(`game-${gameId}`, "timeout_called", timeout);
  return NextResponse.json(timeout, { status: 201 });
}
