import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tournamentId = searchParams.get("tournamentId");

  const drinks = await prisma.drink.findMany({
    where: {
      OR: [{ isPreset: true }, ...(tournamentId ? [{ tournamentId }] : [])],
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(drinks);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const drink = await prisma.drink.create({ data: body });
  return NextResponse.json(drink, { status: 201 });
}
