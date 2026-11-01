import { compareCandidates, formatDifference, type MunicipalityVotes, type VoteTotals } from "../../lib/municipality-comparison";

const numbers = new Intl.NumberFormat("pt-BR");
const percentages = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const share = (value: number | null) => value === null ? "—" : `${percentages.format(value)}%`;

function Totals({ title, votes }: { title: string; votes: VoteTotals }) {
  return <div className="comparison-total"><h4>{title}</h4><dl>
    <div><dt>Válidos</dt><dd>{numbers.format(votes.valid)}</dd></div>
    <div><dt>Brancos</dt><dd>{numbers.format(votes.blank)}</dd></div>
    <div><dt>Nulos</dt><dd>{numbers.format(votes.null)}</dd></div>
    {!!votes.annulled_separate && <div><dt>Anulados e apurados em separado</dt><dd>{numbers.format(votes.annulled_separate)}</dd></div>}
    <div><dt>Total de votos</dt><dd>{numbers.format(votes.total)}</dd></div>
    <div><dt>Seções com votos</dt><dd>{numbers.format(votes.section_count)}</dd></div>
  </dl></div>;
}

export default function MunicipalityComparison({ unitName, year, turn, unit, municipality }: {
  unitName: string; year: number; turn: number; unit?: VoteTotals; municipality?: MunicipalityVotes;
}) {
  const rows = unit && municipality ? compareCandidates(unit, municipality) : [];
  return <section className="municipality-comparison" id="comparacao-municipal" aria-labelledby="comparison-heading">
    <span className="eyebrow">COMPARE OS RECORTES</span>
    <h3 id="comparison-heading">Unidade × município inteiro</h3>
    <p className="comparison-unit-name">{unitName} · {year} · {turn}º turno</p>
    <p className="comparison-scope"><strong>Município inteiro, incluindo as seções da própria unidade.</strong> Os percentuais usam os votos válidos de cada recorte. A diferença é calculada em pontos percentuais: unidade menos município.</p>
    {municipality && <p className="comparison-city-name">Município: <strong>{municipality.name} · {municipality.uf}</strong></p>}
    {!unit ? <p className="comparison-unavailable">O resultado da unidade não está disponível para esta eleição e turno. Isso não representa zero votos.</p>
      : !municipality ? <p className="comparison-unavailable">O resultado municipal não está disponível para esta eleição e turno. Isso não representa zero votos.</p>
      : <>
        <div className="comparison-totals"><Totals title="Seções da unidade" votes={unit} /><Totals title="Município inteiro" votes={municipality} /></div>
        {(!unit.valid || !municipality.valid) && <p className="comparison-unavailable">Há um recorte sem votos válidos. Os percentuais e as diferenças correspondentes ficam indisponíveis.</p>}
        <table className="comparison-table">
          <caption>Votação por candidato. As barras usam a mesma escala, de 0% a 100%, nos dois recortes. A diferença usa os percentuais antes do arredondamento.</caption>
          <colgroup><col className="comparison-candidate-column" /><col /><col /><col className="comparison-difference-column" /></colgroup>
          <thead><tr><th scope="col">Candidato</th><th scope="col">Unidade</th><th scope="col">Município inteiro</th><th scope="col">Diferença</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.number} data-candidate={row.number}>
            <th scope="row">{row.name}</th>
            <td><span className="comparison-mobile-label">Unidade</span><span className="comparison-unit-votes">{numbers.format(row.unitVotes)} votos</span><span className="comparison-unit-percent">{share(row.unitPercent)}</span>{row.unitPercent !== null && <span className="comparison-bar unit-bar" aria-hidden="true"><span style={{ width: `${row.unitPercent}%` }} /></span>}</td>
            <td><span className="comparison-mobile-label">Município inteiro</span><span className="comparison-city-votes">{numbers.format(row.municipalityVotes)} votos</span><span className="comparison-city-percent">{share(row.municipalityPercent)}</span>{row.municipalityPercent !== null && <span className="comparison-bar city-bar" aria-hidden="true"><span style={{ width: `${row.municipalityPercent}%` }} /></span>}</td>
            <td className="comparison-difference"><span className="comparison-mobile-label">Unidade − município</span><span>{formatDifference(row.difference)}</span></td>
          </tr>)}</tbody>
        </table>
        <p className="comparison-footnote">A unidade considera as seções com correspondência no recorte publicado. O município soma todas as seções presentes no arquivo presidencial do TSE, incluindo outras unidades e locais convencionais. Os votos são agregados e podem incluir servidores e mesários.</p>
      </>}
    {municipality?.uf === "DF" && <p className="comparison-footnote">No DF, usamos a identificação municipal do cadastro eleitoral do TSE (Brasília), que não equivale a uma região administrativa específica.</p>}
  </section>;
}
