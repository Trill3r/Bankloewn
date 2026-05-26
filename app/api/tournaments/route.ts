import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const tournaments = await prisma.tournament.findMany({
    orderBy: { date: "desc" },
    include: { _count: { select: { profiles: true, games: true } } },
  });
  return NextResponse.json(tournaments);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, date, location, pinCode } = body;

  const tournament = await prisma.tournament.create({
    data: { name, date: new Date(date), location, pinCode },
  });
  return NextResponse.json(tournament, { status: 201 });
}
