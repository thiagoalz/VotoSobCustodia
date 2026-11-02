import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NULL_VOTE_COLUMNS, NULL_VOTE_UFS, nullVotesCsv, sortNullVotes, stateNullVotes } from "../../lib/null-votes.ts";

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
test("ordena por quantidade da UF, incluindo zeros, em ambos os sentidos", () => {
  assert.deepEqual(sortNullVotes(rows, "uf:SP", true).map(r => r.number), ["00", "02", "99"]);
  assert.deepEqual(sortNullVotes(rows, "uf:SP", false).map(r => r.number), ["02", "99", "00"]);
  assert.deepEqual(sortNullVotes(rows, "uf:RJ", true).map(r => r.number), ["99", "00", "02"]);
  assert.equal(stateNullVotes(rows[0], "AC"), 0);
  assert.equal(stateNullVotes(rows[0], "AC", ["SP"]), null);
  assert.equal(NULL_VOTE_COLUMNS.length, 29);
});
test("CSV inclui as 27 UFs, preserva zeros à esquerda e respeita a ordem", () => {
  const csv = nullVotesCsv(sortNullVotes(rows, "votes", true));
  const lines = csv.slice(1).trim().split("\r\n").map(line => line.split(";").map(cell => cell.slice(1, -1)));
  assert.deepEqual(lines[0], ["Número digitado", "Total de votos", ...NULL_VOTE_UFS]);
  assert.equal(lines[1][0], "00");
  assert.equal(lines[1][1], "120");
  assert.equal(lines[1][lines[0].indexOf("SP")], "60");
  assert.equal(lines[1][lines[0].indexOf("AC")], "0");
  assert.ok(csv.indexOf('"02"') < csv.indexOf('"99"'));
  const partial = nullVotesCsv([rows[0]], ["SP"]).slice(1).trim().split("\r\n")[1].split(";").map(cell => cell.slice(1, -1));
  assert.equal(partial[lines[0].indexOf("SP")], "60");
  assert.equal(partial[lines[0].indexOf("MG")], "");
});
test("as 27 colunas da base publicada somam exatamente cada total nacional", () => {
  const data = JSON.parse(readFileSync(new URL("../../public/data/null-votes.json", import.meta.url), "utf8"));
  assert.equal(data.status, "complete");
  assert.equal(data.processed_ufs.length, 27);
  assert.equal(readFileSync(new URL("../../public/data/null-votes.csv", import.meta.url), "utf8"), nullVotesCsv(data.rows, data.processed_ufs));
  for (const row of data.rows) assert.equal(NULL_VOTE_UFS.reduce((sum, uf) => sum + stateNullVotes(row, uf, data.processed_ufs), 0), row.votes);
  for (const uf of NULL_VOTE_UFS) {
    const sorted = sortNullVotes(data.rows, `uf:${uf}`, true);
    assert.ok(sorted.every((row, index) => index === 0 || stateNullVotes(sorted[index - 1], uf) >= stateNullVotes(row, uf)));
  }
});
