import test from "node:test";
import assert from "node:assert/strict";
import { nullVotesCsv, sortNullVotes } from "../../lib/null-votes.ts";

const rows = [
  { number: "00", votes: 120, top_ufs: ["MG", "SP"], top_uf_votes: 60, by_uf: { MG: 60, SP: 60 } },
  { number: "99", votes: 9, top_ufs: ["RJ"], top_uf_votes: 9, by_uf: { RJ: 9 } },
  { number: "02", votes: 35, top_ufs: ["DF"], top_uf_votes: 35, by_uf: { DF: 35 } },
];
test("ordena numericamente por votos em ambos os sentidos sem alterar a base", () => {
  assert.deepEqual(sortNullVotes(rows, "votes", true).map(r => r.number), ["00", "02", "99"]);
  assert.deepEqual(sortNullVotes(rows, "votes", false).map(r => r.votes), [9, 35, 120]);
  assert.deepEqual(sortNullVotes(rows, "number", false).map(r => r.number), ["00", "02", "99"]);
  assert.deepEqual(rows.map(r => r.number), ["00", "99", "02"]);
});
test("CSV preserva zeros, empates e a ordem dos registros", () => {
  const csv = nullVotesCsv(sortNullVotes(rows, "votes", true));
  assert.ok(csv.startsWith('\uFEFF"Número digitado";"Total de votos";'));
  assert.ok(csv.includes('"00";"120";"MG, SP";"60"\r\n'));
  assert.ok(csv.indexOf('"02"') < csv.indexOf('"99"'));
});
