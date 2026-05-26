import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pusherServer } from "@/lib/pusher";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { gameId, profileId, position } = body;

  const lineup = await prisma.gameLineup.create({
    data: { gameId, profileId, position },
    include: { profile: true },
  });

  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (game) {
    await pusherServer.trigger(`game-${gameId}`, "lineup_change", lineup);
    await pusherServer.trigger(`tournament-${game.tournamentId}`, "lineup_change", lineup);
  }

  return NextResponse.json(lineup, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, leftAt, position } = body;

  const lineup = await prisma.gameLineup.update({
    where: { id },
    data: { ...(leftAt !== undefined && { leftAt: new Date(leftAt) }), ...(position && { position }) },
    include: { profile: true, game: true },
  });

  await pusherServer.trigger(`game-${lineup.gameId}`, "lineup_change", lineup);
  return NextResponse.json(lineup);
}
