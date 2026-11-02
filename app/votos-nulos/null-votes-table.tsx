"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { NULL_VOTE_COLUMNS, NULL_VOTE_UFS, nullVotesCsv, sortNullVotes, stateNullVotes, type NullSort, type NullVoteRow } from "../../lib/null-votes";

const format = (value: number) => new Intl.NumberFormat("pt-BR").format(value);
const fields = NULL_VOTE_COLUMNS;
const columnLabel = (key: NullSort, label: string) => key.startsWith("uf:") ? `votos em ${label}` : label;

export default function NullVotesTable({ rows: allRows, year, turn, processedUfs }: { rows: NullVoteRow[]; year: number; turn: number; processedUfs: string[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<NullSort>("votes");
  const [descending, setDescending] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => sortNullVotes(allRows.filter(row => row.number.includes(query.trim())), sort, descending, processedUfs), [allRows, query, sort, descending, processedUfs]);
  const maximum = Math.max(1, ...allRows.map(row => row.votes));
  function changeSort(key: NullSort) {
    if (sort === key) setDescending(current => !current);
    else { setSort(key); setDescending(key !== "number"); }
  }
  function selectColumn(key: NullSort) {
    setSort(key); setDescending(key !== "number");
    requestAnimationFrame(() => {
      const container = scrollRef.current;
      const header = container?.querySelector<HTMLElement>(`thead [data-column="${key}"]`);
      if (!container || !header) return;
      const frozenWidth = ["number", "votes"].reduce((width, field) => {
        const cell = container.querySelector<HTMLElement>(`thead [data-column="${field}"]`);
        return width + (cell && getComputedStyle(cell).left !== "auto" ? cell.getBoundingClientRect().width : 0);
      }, 0);
      const left = key.startsWith("uf:") ? header.getBoundingClientRect().left - container.getBoundingClientRect().left + container.scrollLeft - frozenWidth - 12 : 0;
      container.scrollTo({ left: Math.max(0, left), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
  }
  function download() {
    const url = URL.createObjectURL(new Blob([nullVotesCsv(rows, processedUfs)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `numeros-votos-nulos-${year}-turno-${turn}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="null-results" aria-labelledby="null-results-title">
    <div className="null-results-heading"><div><span className="eyebrow">NÚMERO A NÚMERO / TODAS AS UFs</span><h2 id="null-results-title">Votos por número e UF.</h2><p>Total nacional e quantidade em cada uma das 27 UFs. Ordem inicial do maior para o menor total.</p></div><button type="button" className="button button-dark null-export" onClick={download} disabled={!rows.length}><ArrowDownToLine size={16} />Baixar CSV</button></div>
    <div className="null-table-toolbar">
      <label className="null-search"><Search size={16} /><input type="search" inputMode="numeric" value={query} onChange={event => setQuery(event.target.value)} aria-label="Buscar número digitado" placeholder="Buscar número, ex.: 00" /></label>
      <label className="null-sort">Ordenar por<select value={sort} onChange={event => selectColumn(event.target.value as NullSort)}>{fields.map(field => <option key={field.key} value={field.key}>{field.key.startsWith("uf:") ? `Votos em ${field.label}` : field.label}</option>)}</select></label>
      <button type="button" className="null-direction" onClick={() => setDescending(current => !current)} aria-label={descending ? "Ordem decrescente; mudar para crescente" : "Ordem crescente; mudar para decrescente"}>{descending ? <ArrowDown size={15} /> : <ArrowUp size={15} />}{descending ? "Decrescente" : "Crescente"}</button>
      <span role="status">{rows.length} de {allRows.length} números</span>
    </div>
    <p className="null-table-help" id="null-table-help">Clique em qualquer título para ordenar; clique novamente para inverter. Deslize a tabela para ver as UFs ou escolha uma em “Ordenar por”.</p>
    {rows.length > 0 ? <div ref={scrollRef} className="null-table-scroll" role="region" aria-label="Números registrados em votos nulos" aria-describedby="null-table-help" tabIndex={0}>
      <table className="null-table null-matrix"><caption className="voting-sr-only">Números digitados em votos nulos para presidente, {year}, {turn}º turno. Total nacional e uma coluna para cada UF.</caption><thead><tr>{fields.map(field => <th scope="col" key={field.key} data-column={field.key} aria-sort={sort === field.key ? descending ? "descending" : "ascending" : "none"}><button type="button" onClick={() => changeSort(field.key)} aria-label={`Ordenar por ${columnLabel(field.key, field.label)}`}>{field.label}{sort === field.key ? descending ? <ArrowDown size={14} /> : <ArrowUp size={14} /> : <ArrowUpDown size={14} />}</button></th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.number} data-number={row.number}><th scope="row" className="null-number" data-column="number"><code>{row.number}</code></th><td className="null-total" data-column="votes"><strong>{format(row.votes)}</strong><span className="null-bar" aria-hidden="true"><span style={{ width: `${100 * row.votes / maximum}%` }} /></span></td>{NULL_VOTE_UFS.map(uf => {
          const votes = stateNullVotes(row, uf, processedUfs);
          return <td key={uf} className="null-state" data-column={`uf:${uf}`} data-uf={uf}>{votes === null ? <span aria-label="UF ainda não processada">—</span> : format(votes)}</td>;
        })}</tr>)}</tbody>
      </table>
    </div> : <div className="voting-empty"><Search size={25} /><h3>Nenhum número encontrado</h3><p>Confira a busca ou limpe o campo para ver a lista completa.</p><button type="button" className="text-button" onClick={() => setQuery("")}>Limpar busca</button></div>}
    <p className="null-table-footnote">O CSV contém o total e as 27 UFs, respeitando a busca e a ordem exibida. Zero indica ausência de votos daquele número em uma UF processada; “—” indica UF ainda não processada.</p>
  </section>;
}
