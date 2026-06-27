export function calcAlcoholGrams(volumeMl: number, alcoholPercent: number): number {
  return (volumeMl * alcoholPercent * 0.8) / 100;
}

export function calcCombinedScore(params: {
  trichterCount: number;
  alcoholGrams: number;
  vomitCount: number;
}): number {
  const { trichterCount, alcoholGrams, vomitCount } = params;
  return trichterCount * 3 + alcoholGrams - vomitCount * 2;
}

export function calcChampionScore(params: {
  gameScore: number;
  trichterVolumeMl: number;
  alcoholGrams: number;
  vomitCount: number;
}): number {
  const { gameScore, trichterVolumeMl, alcoholGrams, vomitCount } = params;
  const trichterPoints = trichterVolumeMl / 500;
  return gameScore + trichterPoints * 2 + alcoholGrams / 10 + vomitCount * 2;
}

export function formatAlcohol(grams: number): string {
  return `${grams.toFixed(1)}g`;
}

export function formatVolume(ml: number): string {
  if (ml >= 1000) return `${(ml / 1000).toFixed(1)}L`;
  return `${ml}ml`;
}
