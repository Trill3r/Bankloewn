import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pusherServer } from "@/lib/pusher";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const game = await prisma.game.findUnique({
    where: { id: params.id },
    include: {
      lineups: { include: { profile: true } },
      stats: { include: { profile: true }, orderBy: { recordedAt: "desc" } },
    },
  });
  if (!game) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(game);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const game = await prisma.game.update({
    where: { id: params.id },
    data: body,
    include: { lineups: { include: { profile: true } } },
  });

  await pusherServer.trigger(`game-${params.id}`, "game_updated", game);
  return NextResponse.json(game);
}
