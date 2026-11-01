import test from "node:test";
import assert from "node:assert/strict";
import { summarizeLeader } from "../../lib/unit-leader.ts";

test("encontra o mais votado sem depender da ordenação nem alterar os dados", () => {
  const candidates = [{ number: 13, name: "A", votes: 48 }, { number: 22, name: "B", votes: 57 }];
  const original = structuredClone(candidates);
  const summary = summarizeLeader({ valid: 105, candidates });
  assert.equal(summary.status, "winner");
  assert.deepEqual(summary.leaders, [candidates[1]]);
  assert.equal(summary.valid, 105);
  assert.deepEqual(candidates, original);
});

test("empate mostra todos os líderes, sem usar número do candidato como desempate", () => {
  const summary = summarizeLeader({ valid: 16, candidates: [
    { number: 30, name: "C", votes: 5 }, { number: 10, name: "A", votes: 5 },
    { number: 40, name: "D", votes: 1 }, { number: 20, name: "B", votes: 5 },
  ] });
  assert.equal(summary.status, "tie");
  assert.deepEqual(summary.leaders.map(candidate => candidate.number), [10, 20, 30]);
});

test("resultado ausente é diferente de resultado sem votos válidos", () => {
  assert.deepEqual(summarizeLeader(), { status: "unavailable" });
  assert.deepEqual(summarizeLeader({ valid: 0, candidates: [] }), { status: "no_valid_votes" });
  assert.deepEqual(summarizeLeader({ valid: 0, candidates: [{ number: 10, name: "A", votes: 0 }] }), { status: "no_valid_votes" });
});

test("não atribui vencedor se faltam dados dos candidatos", () => {
  assert.deepEqual(summarizeLeader({ valid: 10, candidates: [] }), { status: "unavailable" });
});
