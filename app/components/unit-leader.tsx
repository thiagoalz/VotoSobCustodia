import { summarizeLeader, type UnitVotes } from "../../lib/unit-leader";

const numbers = new Intl.NumberFormat("pt-BR");
const percentages = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

export default function UnitLeader({ result }: { result?: UnitVotes }) {
  const summary = summarizeLeader(result);
  if (summary.status === "unavailable" || summary.status === "no_valid_votes") {
    return <span className="unit-leader unit-leader-empty" data-status={summary.status}>
      {summary.status === "unavailable" ? "Resultado indisponível" : "Sem votos válidos"}
    </span>;
  }
  return <span className="unit-leader" data-status={summary.status}>
    <span className="unit-leader-label">{summary.status === "tie" ? "Empate na liderança" : "Mais votado"}</span>
    {summary.leaders.map(candidate => <span className="unit-leader-candidate" key={candidate.number}>
      <span className="unit-leader-name">{candidate.name}</span>
      <span className="unit-leader-votes">{numbers.format(candidate.votes)} votos · {percentages.format(100 * candidate.votes / summary.valid)}% dos votos válidos</span>
    </span>)}
  </span>;
}
