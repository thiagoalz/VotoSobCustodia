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
export type NullSort = "votes" | "number" | "uf" | "ufVotes";

export function sortNullVotes(rows: NullVoteRow[], field: NullSort, descending: boolean) {
  return [...rows].sort((a, b) => {
    const order = field === "votes" ? a.votes - b.votes : field === "ufVotes" ? a.top_uf_votes - b.top_uf_votes
      : field === "uf" ? a.top_ufs.join(",").localeCompare(b.top_ufs.join(","), "pt-BR") : Number(a.number) - Number(b.number);
    return (descending ? -order : order) || Number(a.number) - Number(b.number) || a.number.localeCompare(b.number);
  });
}

export function nullVotesCsv(rows: NullVoteRow[]) {
  const lines = [["Número digitado", "Total de votos", "UFs com maior quantidade", "Votos em cada UF líder"],
    ...rows.map(row => [row.number, String(row.votes), row.top_ufs.join(", "), String(row.top_uf_votes)])];
  return "\uFEFF" + lines.map(line => line.map(value => `"${value.replace(/"/g, '""')}"`).join(";")).join("\r\n") + "\r\n";
}
