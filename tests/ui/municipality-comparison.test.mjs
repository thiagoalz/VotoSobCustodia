import test from "node:test";
import assert from "node:assert/strict";
import { compareCandidates, formatDifference, municipalityKey } from "../../lib/municipality-comparison.ts";

test("percentuais têm denominadores próprios e diferença usa pontos percentuais", () => {
  const rows = compareCandidates({ valid: 100, candidates: [{ number: 10, name: "A", votes: 60 }, { number: 20, name: "B", votes: 40 }] },
    { valid: 1000, candidates: [{ number: 10, name: "A", votes: 450 }, { number: 20, name: "B", votes: 550 }] });
  assert.equal(rows[0].unitPercent, 60);
  assert.equal(rows[0].municipalityPercent, 45);
  assert.equal(rows[0].difference, 15);
  assert.equal(formatDifference(rows[0].difference), "+15 p.p.");
  assert.equal(rows[1].difference, -15);
});

test("candidato sem linha em um recorte com resultado recebe zero, sem desaparecer", () => {
  const rows = compareCandidates({ valid: 5, candidates: [{ number: 10, name: "A", votes: 5 }] },
    { valid: 20, candidates: [{ number: 10, name: "A", votes: 5 }, { number: 20, name: "B", votes: 15 }] });
  assert.equal(rows.length, 2);
  assert.equal(rows[1].unitVotes, 0);
  assert.equal(rows[1].unitPercent, 0);
  assert.equal(rows[1].municipalityPercent, 75);
});

test("denominador zero não produz percentual nem diferença falsa", () => {
  const [row] = compareCandidates({ valid: 0, candidates: [] }, { valid: 5, candidates: [{ number: 10, name: "A", votes: 5 }] });
  assert.equal(row.unitPercent, null);
  assert.equal(row.municipalityPercent, 100);
  assert.equal(row.difference, null);
  assert.equal(formatDifference(null), "—");
  assert.equal(formatDifference(-0.0001), "0 p.p.");
});

test("chave municipal distingue UF, ano e turno", () => {
  const keys = new Set([municipalityKey(2022, 1, "DF", 97012), municipalityKey(2022, 2, "DF", 97012), municipalityKey(2018, 1, "DF", 97012), municipalityKey(2022, 1, "SP", 97012)]);
  assert.equal(keys.size, 4);
});
