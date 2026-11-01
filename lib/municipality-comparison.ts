import type { UnitVotes } from "./unit-leader";

export type VoteTotals = UnitVotes & { blank: number; null: number; annulled_separate?: number; total: number; section_count: number };
export type MunicipalityVotes = VoteTotals & {
  year: number; turn: number; uf: string; municipality_code: number; name: string;
  scope: "entire_municipality_including_units";
};

export function municipalityKey(year: number, turn: number, uf: string, code: number) {
  return `${year}:${turn}:${uf}:${code}`;
}

export function compareCandidates(unit: UnitVotes, municipality: UnitVotes) {
  const numbers = new Map<number, string>();
  for (const candidate of [...unit.candidates, ...municipality.candidates]) numbers.set(candidate.number, candidate.name);
  const unitVotes = new Map(unit.candidates.map(candidate => [candidate.number, candidate.votes]));
  const cityVotes = new Map(municipality.candidates.map(candidate => [candidate.number, candidate.votes]));
  return [...numbers].map(([number, name]) => {
    const local = unitVotes.get(number) ?? 0;
    const city = cityVotes.get(number) ?? 0;
    const unitPercent = unit.valid > 0 ? 100 * local / unit.valid : null;
    const municipalityPercent = municipality.valid > 0 ? 100 * city / municipality.valid : null;
    return { number, name, unitVotes: local, municipalityVotes: city, unitPercent, municipalityPercent,
      difference: unitPercent !== null && municipalityPercent !== null ? unitPercent - municipalityPercent : null };
  }).sort((a, b) => b.unitVotes - a.unitVotes || b.municipalityVotes - a.municipalityVotes || a.number - b.number);
}

export function formatDifference(value: number | null) {
  if (value === null) return "—";
  const rounded = Math.round(value * 100) / 100;
  const number = rounded === 0 ? 0 : rounded;
  return `${number > 0 ? "+" : ""}${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(number)} p.p.`;
}
