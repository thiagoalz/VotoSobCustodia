"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { nullVotesCsv, sortNullVotes, type NullSort, type NullVoteRow } from "../../lib/null-votes";

const format = (value: number) => new Intl.NumberFormat("pt-BR").format(value);
const fields: { key: NullSort; label: string }[] = [{ key: "number", label: "Número digitado" }, { key: "votes", label: "Total de votos" }, { key: "uf", label: "UF com maior uso" }, { key: "ufVotes", label: "Votos nessa UF" }];

export default function NullVotesTable({ rows: allRows, year, turn }: { rows: NullVoteRow[]; year: number; turn: number }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<NullSort>("votes");
  const [descending, setDescending] = useState(true);
  const rows = useMemo(() => sortNullVotes(allRows.filter(row => row.number.includes(query.trim())), sort, descending), [allRows, query, sort, descending]);
  const maximum = Math.max(1, ...allRows.map(row => row.votes));
  function changeSort(key: NullSort) {
    if (sort === key) setDescending(current => !current);
    else { setSort(key); setDescending(key === "votes" || key === "ufVotes"); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([nullVotesCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `numeros-votos-nulos-${year}-turno-${turn}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="null-results" aria-labelledby="null-results-title">
    <div className="null-results-heading"><div><span className="eyebrow">NÚMERO A NÚMERO</span><h2 id="null-results-title">Os mais registrados.</h2><p>Lista inicial do maior para o menor total de votos.</p></div><button type="button" className="button button-dark null-export" onClick={download} disabled={!rows.length}><ArrowDownToLine size={16} />Baixar CSV</button></div>
    <div className="null-table-toolbar"><label className="null-search"><Search size={16} /><input type="search" inputMode="numeric" value={query} onChange={event => setQuery(event.target.value)} aria-label="Buscar número digitado" placeholder="Buscar número, ex.: 00" /></label><span role="status">{rows.length} de {allRows.length} números</span></div>
    <p className="null-table-help" id="null-table-help">Clique nos títulos das colunas para mudar a ordenação. Em empate entre UFs, a quantidade indicada vale para cada uma. Em telas menores, deslize para ver todas as colunas.</p>
    {rows.length > 0 ? <div className="null-table-scroll" role="region" aria-label="Números registrados em votos nulos" aria-describedby="null-table-help" tabIndex={0}>
      <table className="null-table"><caption className="voting-sr-only">Números digitados em votos nulos para presidente, {year}, {turn}º turno, todas as UFs processadas.</caption><thead><tr><th scope="col" className="null-position"><span aria-label="Posição">#</span></th>{fields.map(field => <th scope="col" key={field.key} data-column={field.key} aria-sort={sort === field.key ? descending ? "descending" : "ascending" : "none"}><button type="button" onClick={() => changeSort(field.key)} aria-label={`Ordenar por ${field.label}`}>{field.label}{sort === field.key ? descending ? <ArrowDown size={14} /> : <ArrowUp size={14} /> : <ArrowUpDown size={14} />}</button></th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={row.number} data-number={row.number}><td className="null-position">{index + 1}</td><th scope="row" className="null-number"><code>{row.number}</code></th><td className="null-total"><strong>{format(row.votes)}</strong><span className="null-bar" aria-hidden="true"><span style={{ width: `${100 * row.votes / maximum}%` }} /></span></td><td className="null-uf">{row.top_ufs.map(uf => <span key={uf}>{uf}</span>)}{row.top_ufs.length > 1 && <small>empate</small>}</td><td className="null-uf-votes">{format(row.top_uf_votes)}</td></tr>)}</tbody>
      </table>
    </div> : <div className="voting-empty"><Search size={25} /><h3>Nenhum número encontrado</h3><p>Confira a busca ou limpe o campo para ver a lista completa.</p><button type="button" className="text-button" onClick={() => setQuery("")}>Limpar busca</button></div>}
    <p className="null-table-footnote">Quantidade de registros de voto, sem identificação de eleitores. A UF líder é calculada separadamente para cada número.</p>
  </section>;
}
