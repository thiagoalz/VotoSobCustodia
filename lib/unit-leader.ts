export type CandidateVotes = { number: number; name: string; votes: number };
export type UnitVotes = { valid: number; candidates: readonly CandidateVotes[] };
export type LeaderSummary =
  | { status: "unavailable" }
  | { status: "no_valid_votes" }
  | { status: "winner" | "tie"; leaders: CandidateVotes[]; valid: number };

export function summarizeLeader(result?: UnitVotes): LeaderSummary {
  if (!result) return { status: "unavailable" };
  if (result.valid <= 0) return { status: "no_valid_votes" };
  const highest = Math.max(0, ...result.candidates.map(candidate => candidate.votes));
  if (highest === 0) return { status: "unavailable" };
  const leaders = result.candidates
    .filter(candidate => candidate.votes === highest)
    .slice()
    .sort((a, b) => a.number - b.number);
  return { status: leaders.length > 1 ? "tie" : "winner", leaders, valid: result.valid };
}
