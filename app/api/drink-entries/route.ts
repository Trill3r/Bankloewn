import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pusherServer } from "@/lib/pusher";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tournamentId = searchParams.get("tournamentId");
  if (!tournamentId) return NextResponse.json({ error: "tournamentId required" }, { status: 400 });

  const entries = await prisma.drinkEntry.findMany({
    where: { tournamentId },
    include: { profile: true, drink: true },
    orderBy: { consumedAt: "desc" },
  });
  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { profileId, drinkId, volumeMl, alcoholPercent, consumedAt, isTrichter, tournamentId, durationSeconds, timekeeperId } = body;

  const entry = await prisma.drinkEntry.create({
    data: {
      profileId,
      drinkId,
      volumeMl,
      alcoholPercent,
      consumedAt: consumedAt ? new Date(consumedAt) : new Date(),
      isTrichter: isTrichter ?? false,
      tournamentId,
      durationSeconds: durationSeconds ?? null,
      timekeeperId: timekeeperId ?? null,
    },
    include: { profile: true, drink: true },
  });

  await pusherServer.trigger(`tournament-${tournamentId}`, "new_drink_entry", entry);
  return NextResponse.json(entry, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.drinkEntry.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { action, tournamentId } = body;

  if (action === "fix-alcoholfree-trichter") {
    if (!tournamentId) return NextResponse.json({ error: "tournamentId required" }, { status: 400 });

    const alcoholicBier = await prisma.drink.findFirst({
      where: { alcoholPercent: { gt: 0 }, category: "Bier" },
      orderBy: { isPreset: "desc" },
    });
    if (!alcoholicBier) return NextResponse.json({ error: "Kein alkoholisches Bier gefunden" }, { status: 404 });

    const result = await prisma.drinkEntry.updateMany({
      where: { tournamentId, isTrichter: true, alcoholPercent: 0 },
      data: { drinkId: alcoholicBier.id, alcoholPercent: alcoholicBier.alcoholPercent },
    });

    return NextResponse.json({ fixed: result.count, drink: alcoholicBier.name });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
