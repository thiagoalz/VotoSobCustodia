import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildInstitutionTables, institutionColumns, institutionsCsv, normalizeSearch, sortInstitutions } from "../../lib/institution-table.ts";

const source = { url: "https://example.invalid/votes.zip", sha256: "archived-version" };
const votes = (valid, candidates, extra = {}) => ({ valid, blank: 1, null: 2, total: valid + 3, candidates, ...extra });
const candidate = (number, count) => ({ number, name: `Candidato ${number}`, votes: count });
const section = (year = 2026, turn = 2) => ({ year, turn, municipality_code: 10 });
function fixtures() {
  const units = ["a", "b", "missing"].map(id => ({ id, name: `Unidade ${id}`, municipality: "São José", uf: "SP", kind: "unclassified", sections: [section(), section()] }));
  units.push({ ...units[0], id: "other-uf", name: "Outra UF", uf: "MG", sections: [section()] });
  const catalog = { units, sources: [source], results: [
    { unit_id: "a", year: 2026, turn: 2, ...votes(3, [candidate(13, 1), candidate(22, 2)]) },
    { unit_id: "b", year: 2026, turn: 2, ...votes(0, []) },
  ] };
  const municipal = { sources: [{ ...source, year: 2026 }], results: [
    { year: 2026, turn: 2, uf: "SP", municipality_code: 10, ...votes(10, [candidate(13, 2), candidate(22, 8)], { annulled_separate: 4, total: 17 }) },
    { year: 2026, turn: 2, uf: "MG", municipality_code: 10, ...votes(20, [candidate(13, 20)]) },
    { year: 2026, turn: 1, uf: "SP", municipality_code: 10, ...votes(100, [candidate(13, 100)]) },
    { year: 2022, turn: 2, uf: "SP", municipality_code: 10, ...votes(200, [candidate(13, 200)]) },
  ] };
  return { catalog, municipal };
}

test("vínculo usa ano, turno, UF e código TSE; não duplica linhas por seção nem soma municípios repetidos", () => {
  const { catalog, municipal } = fixtures();
  const [election] = buildInstitutionTables(catalog, municipal);
  assert.equal(election.rows.length, 4);
  const a = election.rows.find(row => row.id === "a:2026:2");
  const b = election.rows.find(row => row.id === "b:2026:2");
  assert.equal(a.city.valid, 10);
  assert.equal(b.city.valid, 10);
  assert.equal(a.city.total, 17);
  assert.equal(a.city.annulledSeparate, 4);
  assert.equal(election.rows.find(row => row.uf === "MG").city.valid, 20);
  assert.equal(election.rows.find(row => row.id.startsWith("missing:")).unit, null);
  assert.deepEqual(election.candidates.map(item => item.number), [13, 22]);
});

test("versões municipais incompatíveis não são mostradas e códigos conflitantes interrompem o vínculo", () => {
  const { catalog, municipal } = fixtures();
  municipal.sources[0].sha256 = "different-version";
  assert.ok(buildInstitutionTables(catalog, municipal)[0].rows.every(row => row.city === null));
  catalog.units[0].sections.push({ ...section(), municipality_code: 20 });
  assert.throws(() => buildInstitutionTables(catalog, municipal), /Códigos municipais conflitantes/);
});

test("votos e percentuais usam denominadores próprios; zeros e indisponíveis permanecem distintos", () => {
  const { catalog, municipal } = fixtures();
  const election = buildInstitutionTables(catalog, municipal)[0];
  const columns = institutionColumns(election.candidates);
  const value = (id, key) => columns.find(column => column.key === key).value(election.rows.find(row => row.id.startsWith(`${id}:`)));
  assert.equal(value("a", "unit-votes-13"), 1);
  assert.equal(value("a", "unit-percent-13"), 100 / 3);
  assert.equal(value("a", "city-votes-13"), 2);
  assert.equal(value("a", "city-percent-13"), 20);
  assert.equal(value("b", "unit-votes-13"), 0);
  assert.equal(value("b", "unit-percent-13"), null);
  assert.equal(value("missing", "unit-votes-13"), null);
  assert.equal(value("other-uf", "city-votes-22"), 0);
});

test("ordenação é numérica antes do arredondamento, não altera a base e mantém indisponíveis no fim nos dois sentidos", () => {
  const { catalog, municipal } = fixtures();
  const election = buildInstitutionTables(catalog, municipal)[0];
  const numeric = institutionColumns(election.candidates).find(column => column.key === "unit-votes-13");
  const original = election.rows.map(row => row.id);
  assert.deepEqual(sortInstitutions(election.rows, numeric, "asc").slice(0, 2).map(row => row.unit.valid), [0, 3]);
  assert.deepEqual(sortInstitutions(election.rows, numeric, "desc").slice(0, 2).map(row => row.unit.valid), [3, 0]);
  assert.ok(sortInstitutions(election.rows, numeric, "desc").slice(2).every(row => row.unit === null));
  const base = election.rows[0];
  const precise = [{ ...base, id: "lower", unit: { ...base.unit, valid: 100000, candidates: { 13: 10001 } } },
    { ...base, id: "higher", unit: { ...base.unit, valid: 100000, candidates: { 13: 10002 } } }];
  const percent = institutionColumns(election.candidates).find(column => column.key === "unit-percent-13");
  assert.equal(sortInstitutions(precise, percent, "desc")[0].id, "higher");
  assert.deepEqual(election.rows.map(row => row.id), original);
  assert.equal(normalizeSearch("  SÃO JOSÉ  "), "sao jose");
});

test("CSV respeita a ordem, preserva campos vazios, escapa texto e identifica cada candidato e recorte", () => {
  const { catalog, municipal } = fixtures();
  const election = buildInstitutionTables(catalog, municipal)[0];
  const row = { ...election.rows.find(row => row.id.startsWith("missing:")), name: 'Unidade; "A"\nNorte', municipality: "=fórmula" };
  const columns = institutionColumns(election.candidates);
  const csv = institutionsCsv([row], columns, 2026, 2);
  assert.ok(csv.startsWith("\uFEFFEleição;Turno;Código do município TSE;"));
  assert.ok(csv.includes("13 · Candidato 13 — Votos na instituição"));
  assert.ok(csv.includes("22 · Candidato 22 — % no município"));
  assert.ok(csv.includes('2026;2;10;"Unidade; ""A""\nNorte";\'=fórmula;SP;A classificar;;;2;20,00;;;8;80,00;'));
  assert.ok(csv.endsWith(";;;;10;1;2;17;4\r\n"));
});

test("base publicada mantém todos os locais por turno e reproduz os resultados de Papuda e Brasília", () => {
  const read = name => JSON.parse(readFileSync(new URL(`../../public/data/${name}.json`, import.meta.url), "utf8"));
  const tables = buildInstitutionTables(read("catalog"), read("municipalities"));
  assert.equal(tables.length, 6);
  assert.equal(tables.reduce((sum, table) => sum + table.rows.length, 0), 1372);
  const election = tables.find(table => table.year === 2022 && table.turn === 2);
  const row = election.rows.find(row => row.name.includes("PAPUDA"));
  assert.equal(row.unit.valid, 105);
  assert.equal(row.unit.candidates[22], 57);
  assert.equal(row.city.valid, 1770626);
  assert.equal(row.city.candidates[22], 1041331);
  assert.equal(row.city.total, 1838492);
  assert.equal(tables.filter(table => table.year === 2026).reduce((sum, table) => sum + table.rows.length, 0), 486);
});
