export type InstitutionKind = "presidio" | "socioeducativa" | "unclassified";
type Candidate = { number: number; name: string; votes: number };
type VoteResult = {
  valid: number; blank: number; null: number; total: number;
  annulled_separate?: number; candidates: Candidate[];
};
type Source = { url: string; sha256?: string };
type Catalog = {
  units: {
    id: string; name: string; municipality: string; uf: string; kind: string;
    sections: { year: number; turn: number; municipality_code: number }[];
  }[];
  results: (VoteResult & { unit_id: string; year: number; turn: number })[];
  sources: Source[];
};
type MunicipalCatalog = {
  results: (VoteResult & { year: number; turn: number; uf: string; municipality_code: number })[];
  sources: (Source & { year: number })[];
};

export type TableVotes = {
  valid: number; blank: number; null: number; total: number; annulledSeparate: number;
  candidates: Record<number, number>;
};
export type InstitutionRow = {
  id: string; name: string; municipality: string; municipalityCode: number;
  uf: string; kind: InstitutionKind; unit: TableVotes | null; city: TableVotes | null;
};
export type ElectionTable = {
  year: number; turn: number; candidates: { number: number; name: string }[]; rows: InstitutionRow[];
};
export type SortDirection = "asc" | "desc";
export type TableColumn = {
  key: string; label: string; group: string; format: "text" | "integer" | "percent";
  value: (row: InstitutionRow) => string | number | null;
};

export const kindLabels: Record<InstitutionKind, string> = {
  presidio: "Presídio", socioeducativa: "Unidade socioeducativa", unclassified: "A classificar",
};

const cityKey = (year: number, turn: number, uf: string, code: number) => `${year}:${turn}:${uf}:${code}`;
const resultKey = (id: string, year: number, turn: number) => `${id}:${year}:${turn}`;
const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

function tableVotes(result: VoteResult): TableVotes {
  return {
    valid: result.valid, blank: result.blank, null: result.null, total: result.total,
    annulledSeparate: result.annulled_separate ?? 0,
    candidates: Object.fromEntries(result.candidates.map(candidate => [candidate.number, candidate.votes])),
  };
}

/** Uma linha por local/eleição/turno, incluindo locais sem resultado disponível. */
export function buildInstitutionTables(catalog: Catalog, municipal: MunicipalCatalog): ElectionTable[] {
  const verifiedYears = new Set(municipal.sources.filter(source => source.sha256 && catalog.sources.some(
    current => current.url === source.url && current.sha256 === source.sha256,
  )).map(source => source.year));
  const cities = new Map(municipal.results.filter(result => verifiedYears.has(result.year)).map(
    result => [cityKey(result.year, result.turn, result.uf, result.municipality_code), tableVotes(result)],
  ));
  const results = new Map(catalog.results.map(result => [resultKey(result.unit_id, result.year, result.turn), tableVotes(result)]));
  const elections = new Map<string, ElectionTable>();
  const candidates = new Map<string, Map<number, string>>();
  for (const result of [...catalog.results, ...municipal.results.filter(result => verifiedYears.has(result.year))]) {
    const key = `${result.year}:${result.turn}`;
    if (!candidates.has(key)) candidates.set(key, new Map());
    for (const candidate of result.candidates) candidates.get(key)!.set(candidate.number, candidate.name);
  }
  for (const unit of catalog.units) {
    if (unit.kind !== "presidio" && unit.kind !== "socioeducativa" && unit.kind !== "unclassified") {
      throw new Error(`Tipo de instituição desconhecido: ${unit.kind}`);
    }
    const sectionsByElection = new Map<string, { year: number; turn: number; codes: Set<number> }>();
    for (const section of unit.sections) {
      const key = `${section.year}:${section.turn}`;
      if (!sectionsByElection.has(key)) sectionsByElection.set(key, { year: section.year, turn: section.turn, codes: new Set() });
      sectionsByElection.get(key)!.codes.add(section.municipality_code);
    }
    for (const [key, scope] of sectionsByElection) {
      if (scope.codes.size !== 1) throw new Error(`Códigos municipais conflitantes para ${unit.id}, ${key}`);
      if (!elections.has(key)) elections.set(key, {
        year: scope.year, turn: scope.turn, rows: [],
        candidates: [...(candidates.get(key) ?? [])].map(([number, name]) => ({ number, name })).sort((a, b) => a.number - b.number),
      });
      const code = [...scope.codes][0];
      elections.get(key)!.rows.push({
        id: resultKey(unit.id, scope.year, scope.turn), name: unit.name,
        municipality: unit.municipality, municipalityCode: code, uf: unit.uf, kind: unit.kind,
        unit: results.get(resultKey(unit.id, scope.year, scope.turn)) ?? null,
        city: cities.get(cityKey(scope.year, scope.turn, unit.uf, code)) ?? null,
      });
    }
  }
  return [...elections.values()].sort((a, b) => b.year - a.year || b.turn - a.turn);
}

function candidateVotes(result: TableVotes | null, number: number) {
  return result === null ? null : result.candidates[number] ?? 0;
}

function candidatePercent(result: TableVotes | null, number: number) {
  return result && result.valid > 0 ? 100 * (result.candidates[number] ?? 0) / result.valid : null;
}

export function institutionColumns(candidates: ElectionTable["candidates"]): TableColumn[] {
  const columns: TableColumn[] = [
    { key: "name", label: "Instituição", group: "Identificação", format: "text", value: row => row.name },
    { key: "municipality", label: "Município", group: "Identificação", format: "text", value: row => row.municipality },
    { key: "uf", label: "UF", group: "Identificação", format: "text", value: row => row.uf },
    { key: "kind", label: "Tipo", group: "Identificação", format: "text", value: row => kindLabels[row.kind] },
  ];
  for (const candidate of candidates) {
    const group = `${candidate.number} · ${candidate.name}`;
    columns.push(
      { key: `unit-votes-${candidate.number}`, label: "Votos na instituição", group, format: "integer", value: row => candidateVotes(row.unit, candidate.number) },
      { key: `unit-percent-${candidate.number}`, label: "% na instituição", group, format: "percent", value: row => candidatePercent(row.unit, candidate.number) },
      { key: `city-votes-${candidate.number}`, label: "Votos no município", group, format: "integer", value: row => candidateVotes(row.city, candidate.number) },
      { key: `city-percent-${candidate.number}`, label: "% no município", group, format: "percent", value: row => candidatePercent(row.city, candidate.number) },
    );
  }
  const totals = [
    ["valid", "Válidos"], ["blank", "Brancos"], ["null", "Nulos"], ["total", "Total"],
  ] as const;
  for (const [side, group] of [["unit", "Totais da instituição"], ["city", "Totais do município"]] as const) {
    for (const [key, label] of totals) columns.push({
      key: `${side}-${key}`, label, group, format: "integer", value: row => row[side]?.[key] ?? null,
    });
    if (side === "city") columns.push({
      key: "city-annulled", label: "Anulados em separado", group, format: "integer", value: row => row.city?.annulledSeparate ?? null,
    });
  }
  return columns;
}

export function sortInstitutions(rows: InstitutionRow[], column: TableColumn, direction: SortDirection): InstitutionRow[] {
  return [...rows].sort((a, b) => {
    const left = column.value(a), right = column.value(b);
    // Indisponíveis sempre no fim, inclusive na ordenação decrescente.
    if (left === null && right !== null) return 1;
    if (right === null && left !== null) return -1;
    const order = typeof left === "number" && typeof right === "number" ? left - right : collator.compare(String(left ?? ""), String(right ?? ""));
    return order * (direction === "asc" ? 1 : -1) || collator.compare(a.name, b.name) || collator.compare(a.uf, b.uf) || collator.compare(a.id, b.id);
  });
}

export function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

function csvCell(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function institutionsCsv(rows: InstitutionRow[], columns: TableColumn[], year: number, turn: number) {
  const header = ["Eleição", "Turno", "Código do município TSE", ...columns.map(column => `${column.group} — ${column.label}`)];
  const lines = rows.map(row => [year, turn, row.municipalityCode, ...columns.map(column => {
    const value = column.value(row);
    return value !== null && column.format === "percent" ? Number(value).toFixed(2).replace(".", ",") : value;
  })].map(csvCell).join(";"));
  return `\uFEFF${[header.map(csvCell).join(";"), ...lines].join("\r\n")}\r\n`;
}
