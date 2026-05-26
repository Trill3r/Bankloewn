import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const drinks = [
  // Bier
  { name: "Bier Flasche", defaultVolumeMl: 330, alcoholPercent: 5.0, category: "Bier" },
  { name: "Bier Dose", defaultVolumeMl: 500, alcoholPercent: 5.0, category: "Bier" },
  { name: "Bier Becher", defaultVolumeMl: 400, alcoholPercent: 5.0, category: "Bier" },
  { name: "Weizen", defaultVolumeMl: 500, alcoholPercent: 5.2, category: "Bier" },
  { name: "Radler", defaultVolumeMl: 500, alcoholPercent: 2.5, category: "Bier" },
  { name: "Alkoholfreies Bier", defaultVolumeMl: 330, alcoholPercent: 0.0, category: "Bier" },
  // Wein
  { name: "Rotwein", defaultVolumeMl: 200, alcoholPercent: 13.0, category: "Wein" },
  { name: "Weißwein", defaultVolumeMl: 200, alcoholPercent: 12.0, category: "Wein" },
  { name: "Rosé", defaultVolumeMl: 200, alcoholPercent: 12.0, category: "Wein" },
  { name: "Rotwein Flasche", defaultVolumeMl: 750, alcoholPercent: 13.0, category: "Wein" },
  { name: "Weißwein Flasche", defaultVolumeMl: 750, alcoholPercent: 12.0, category: "Wein" },
  // Sekt
  { name: "Sekt Glas", defaultVolumeMl: 100, alcoholPercent: 11.0, category: "Sekt" },
  { name: "Sekt Flasche", defaultVolumeMl: 750, alcoholPercent: 11.0, category: "Sekt" },
  { name: "Prosecco Glas", defaultVolumeMl: 100, alcoholPercent: 11.0, category: "Sekt" },
  { name: "Champagner Glas", defaultVolumeMl: 100, alcoholPercent: 12.0, category: "Sekt" },
  // Schnaps
  { name: "Vodka Shot", defaultVolumeMl: 40, alcoholPercent: 40.0, category: "Schnaps" },
  { name: "Tequila Shot", defaultVolumeMl: 40, alcoholPercent: 40.0, category: "Schnaps" },
  { name: "Jägermeister Shot", defaultVolumeMl: 40, alcoholPercent: 35.0, category: "Schnaps" },
  { name: "Whisky Shot", defaultVolumeMl: 40, alcoholPercent: 40.0, category: "Schnaps" },
  { name: "Rum Shot", defaultVolumeMl: 40, alcoholPercent: 40.0, category: "Schnaps" },
  { name: "Gin Shot", defaultVolumeMl: 40, alcoholPercent: 40.0, category: "Schnaps" },
  { name: "Korn Shot", defaultVolumeMl: 40, alcoholPercent: 32.0, category: "Schnaps" },
  { name: "Obstler Shot", defaultVolumeMl: 40, alcoholPercent: 40.0, category: "Schnaps" },
  { name: "Sambuca Shot", defaultVolumeMl: 40, alcoholPercent: 38.0, category: "Schnaps" },
  { name: "Tequila Rose Shot", defaultVolumeMl: 40, alcoholPercent: 15.0, category: "Schnaps" },
  // Longdrink
  { name: "Vodka Cola", defaultVolumeMl: 300, alcoholPercent: 6.0, category: "Longdrink" },
  { name: "Gin Tonic", defaultVolumeMl: 300, alcoholPercent: 6.0, category: "Longdrink" },
  { name: "Rum Cola", defaultVolumeMl: 300, alcoholPercent: 6.0, category: "Longdrink" },
  { name: "Whisky Cola", defaultVolumeMl: 300, alcoholPercent: 6.0, category: "Longdrink" },
  { name: "Aperol Spritz", defaultVolumeMl: 250, alcoholPercent: 8.0, category: "Longdrink" },
  { name: "Hugo", defaultVolumeMl: 250, alcoholPercent: 7.0, category: "Longdrink" },
  { name: "Caipirinha", defaultVolumeMl: 250, alcoholPercent: 10.0, category: "Longdrink" },
  { name: "Moscow Mule", defaultVolumeMl: 300, alcoholPercent: 6.0, category: "Longdrink" },
  { name: "Wodka Lemon", defaultVolumeMl: 300, alcoholPercent: 6.0, category: "Longdrink" },
  { name: "Alcopop", defaultVolumeMl: 275, alcoholPercent: 5.0, category: "Longdrink" },
  // Softdrink
  { name: "Wasser", defaultVolumeMl: 500, alcoholPercent: 0.0, category: "Softdrink" },
  { name: "Cola", defaultVolumeMl: 330, alcoholPercent: 0.0, category: "Softdrink" },
  { name: "Fanta/Sprite", defaultVolumeMl: 330, alcoholPercent: 0.0, category: "Softdrink" },
  { name: "Energydrink", defaultVolumeMl: 250, alcoholPercent: 0.0, category: "Softdrink" },
  { name: "Saft", defaultVolumeMl: 200, alcoholPercent: 0.0, category: "Softdrink" },
];

async function main() {
  console.log("Seeding drinks...");
  for (const drink of drinks) {
    await prisma.drink.upsert({
      where: {
        id: drink.name.toLowerCase().replace(/[^a-z0-9]/g, "_"),
      },
      update: {},
      create: {
        id: drink.name.toLowerCase().replace(/[^a-z0-9]/g, "_"),
        ...drink,
        isPreset: true,
        tournamentId: null,
      },
    });
  }
  console.log(`Seeded ${drinks.length} drinks.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
