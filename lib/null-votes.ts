export type NullVoteRow = {
  number: string; votes: number; top_ufs: string[]; top_uf_votes: number; by_uf: Record<string, number>;
};
export type NullVotesData = {
  status: string; year: number; turn: number; generated_at: string;
  processed_ufs: string[]; expected_ufs: string[];
  summary: { files_processed: number; sections_processed: number; null_with_digits: number; null_without_digits: number };
  rows: NullVoteRow[]; sources: { label: string; url: string }[];
  reference_validation?: { status: string; checked_ufs: number; reference_nulls: number };
  states: { uf: string; files_processed: number; sections_processed: number; null_with_digits: number; null_without_digits: number; source_url: string }[];
};
export const NULL_VOTE_UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"] as const;
export type NullVoteUf = typeof NULL_VOTE_UFS[number];
export type NullSort = "votes" | "number" | `uf:${NullVoteUf}`;
export const NULL_VOTE_COLUMNS: { key: NullSort; label: string }[] = [
  { key: "number", label: "Número digitado" }, { key: "votes", label: "Total de votos" },
  ...NULL_VOTE_UFS.map(uf => ({ key: `uf:${uf}` as NullSort, label: uf })),
];

export function stateNullVotes(row: NullVoteRow, uf: string, processedUfs: readonly string[] = NULL_VOTE_UFS) {
  return processedUfs.includes(uf) ? row.by_uf[uf] ?? 0 : null;
}

export function sortNullVotes(rows: NullVoteRow[], field: NullSort, descending: boolean, processedUfs: readonly string[] = NULL_VOTE_UFS) {
  return [...rows].sort((a, b) => {
    const left = field === "number" ? Number(a.number) : field === "votes" ? a.votes : stateNullVotes(a, field.slice(3), processedUfs);
    const right = field === "number" ? Number(b.number) : field === "votes" ? b.votes : stateNullVotes(b, field.slice(3), processedUfs);
    if (left === null && right !== null) return 1;
    if (right === null && left !== null) return -1;
    const order = (left ?? 0) - (right ?? 0);
    return (descending ? -order : order) || Number(a.number) - Number(b.number) || a.number.localeCompare(b.number);
  });
}

export function nullVotesCsv(rows: NullVoteRow[], processedUfs: readonly string[] = NULL_VOTE_UFS) {
  const lines = [NULL_VOTE_COLUMNS.map(column => column.label),
    ...rows.map(row => [row.number, String(row.votes), ...NULL_VOTE_UFS.map(uf => {
      const value = stateNullVotes(row, uf, processedUfs);
      return value === null ? "" : String(value);
    })])];
  return "\uFEFF" + lines.map(line => line.map(value => `"${value.replace(/"/g, '""')}"`).join(";")).join("\r\n") + "\r\n";
}
