"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpDown, Info, Search } from "lucide-react";
import {
  institutionColumns, institutionsCsv, kindLabels, normalizeSearch, sortInstitutions,
  type ElectionTable, type InstitutionKind, type SortDirection, type TableColumn,
} from "../../lib/institution-table";

const integer = new Intl.NumberFormat("pt-BR");
const percent = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function display(value: string | number | null, format: TableColumn["format"]) {
  if (value === null) return "—";
  if (format === "percent") return `${percent.format(Number(value))}%`;
  return typeof value === "number" ? integer.format(value) : value;
}

export default function VotingTable({ elections }: { elections: ElectionTable[] }) {
  const [year, setYear] = useState(elections[0]?.year ?? 2026);
  const [turn, setTurn] = useState(elections[0]?.turn ?? 2);
  const [uf, setUf] = useState("all");
  const [kind, setKind] = useState<InstitutionKind | "all">("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [direction, setDirection] = useState<SortDirection>("asc");
  const election = elections.find(item => item.year === year && item.turn === turn);
  const years = [...new Set(elections.map(item => item.year))];
  const turns = elections.filter(item => item.year === year).map(item => item.turn).sort();
  const states = [...new Set(election?.rows.map(row => row.uf) ?? [])].sort();
  const columns = useMemo(() => institutionColumns(election?.candidates ?? []), [election]);
  const groups = useMemo(() => [...new Set(columns.map(column => column.group))].map(group => ({ name: group, columns: columns.filter(column => column.group === group) })), [columns]);
  // Ao trocar de eleição, uma coluna de candidato inexistente volta para o nome.
  const sortColumn = columns.find(column => column.key === sortKey) ?? columns[0];
  const rows = useMemo(() => {
    const text = normalizeSearch(query);
    return sortInstitutions((election?.rows ?? []).filter(row =>
      (uf === "all" || row.uf === uf) && (kind === "all" || row.kind === kind) &&
      normalizeSearch(`${row.name} ${row.municipality} ${row.uf}`).includes(text),
    ), sortColumn, direction);
  }, [election, uf, kind, query, sortColumn, direction]);
  const municipalityCount = new Set(rows.map(row => `${row.uf}:${row.municipalityCode}`)).size;
  const missing = rows.filter(row => row.unit === null).length;

  function changeElection(nextYear: number, nextTurn: number) {
    setYear(nextYear); setTurn(nextTurn); setSortKey("name"); setDirection("asc");
    if (!elections.find(item => item.year === nextYear && item.turn === nextTurn)?.rows.some(row => row.uf === uf)) setUf("all");
  }
  function sortBy(key: string) {
    if (sortColumn.key === key) setDirection(current => current === "asc" ? "desc" : "asc");
    else { setSortKey(key); setDirection("asc"); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([institutionsCsv(rows, columns, year, turn)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `instituicoes-municipios-${year}-turno-${turn}.csv`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="voting-panel" aria-labelledby="table-title">
    <div className="voting-filters">
      <label>Eleição<select value={year} onChange={event => {
        const nextYear = Number(event.target.value);
        changeElection(nextYear, elections.some(item => item.year === nextYear && item.turn === turn) ? turn : elections.find(item => item.year === nextYear)!.turn);
      }}>{years.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Turno<select value={turn} onChange={event => changeElection(year, Number(event.target.value))}>{turns.map(value => <option key={value} value={value}>{value}º turno</option>)}</select></label>
      <label>Estado<select value={uf} onChange={event => setUf(event.target.value)}><option value="all">Todos os estados</option>{states.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Tipo de instituição<select value={kind} onChange={event => setKind(event.target.value as InstitutionKind | "all")}><option value="all">Todos os tipos</option>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="voting-search">Buscar instituição ou município<span><Search size={17} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nome da instituição ou município" /></span></label>
    </div>
    <div className="voting-toolbar">
      <div className="voting-sort">
        <label>Ordenar por<select value={sortColumn.key} onChange={event => { setSortKey(event.target.value); setDirection("asc"); }}>{groups.map(group => <optgroup key={group.name} label={group.name}>{group.columns.map(column => <option key={column.key} value={column.key}>{group.name === "Identificação" ? column.label : `${group.name} — ${column.label}`}</option>)}</optgroup>)}</select></label>
        <button className="voting-direction" type="button" onClick={() => setDirection(current => current === "asc" ? "desc" : "asc")} aria-label={direction === "asc" ? "Ordem crescente; mudar para decrescente" : "Ordem decrescente; mudar para crescente"}>{direction === "asc" ? <ArrowUp size={16} /> : <ArrowDown size={16} />} {direction === "asc" ? "Crescente" : "Decrescente"}</button>
      </div>
      <button className="button button-dark voting-download" type="button" onClick={download} disabled={rows.length === 0}><ArrowDownToLine size={16} /> Baixar tabela CSV</button>
    </div>
    <div className="voting-summary">
      <div><h2 id="table-title">{year} <span>/ {turn}º turno</span></h2><p role="status">{integer.format(rows.length)} instituições · {integer.format(municipalityCount)} municípios{missing > 0 ? ` · ${missing} sem resultado da instituição` : ""}</p></div>
      <button className="text-button" type="button" onClick={() => { setUf("all"); setKind("all"); setQuery(""); }}>Limpar busca e filtros</button>
    </div>
    <p id="voting-help" className="voting-help"><Info size={15} /> Clique no título de qualquer coluna para ordenar; clique novamente para inverter. Deslize a tabela para ver os demais candidatos e os totais. Percentuais sobre votos válidos.</p>
    {rows.length > 0 ? <div className="voting-scroll" role="region" aria-labelledby="table-title" aria-describedby="voting-help" tabIndex={0}>
      <table className="voting-table">
        <caption className="voting-sr-only">Resultados por instituição e município inteiro em {year}, {turn}º turno. “—” significa indisponível; cabeçalhos permitem ordenar.</caption>
        <thead>
          <tr className="voting-groups">{groups.map(group => <th key={group.name} scope="colgroup" colSpan={group.columns.length}>{group.name}</th>)}</tr>
          <tr className="voting-columns">{columns.map(column => <th key={column.key} scope="col" data-column={column.key} aria-sort={sortColumn.key === column.key ? direction === "asc" ? "ascending" : "descending" : "none"}>
            <button type="button" onClick={() => sortBy(column.key)} aria-label={`Ordenar por ${column.group} — ${column.label}`}>{column.label}{sortColumn.key === column.key ? direction === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowUpDown size={13} />}</button>
          </th>)}</tr>
        </thead>
        <tbody>{rows.map(row => <tr key={row.id} data-unit-id={row.id}>{columns.map((column, index) => {
          const value = column.value(row);
          return index === 0 ? <th key={column.key} scope="row" data-column={column.key}>{display(value, column.format)}</th> : <td key={column.key} data-column={column.key} className={column.format === "text" ? "voting-text" : "voting-number"}>{value === null ? <span aria-label="Indisponível">—</span> : display(value, column.format)}</td>;
        })}</tr>)}</tbody>
      </table>
    </div> : <div className="voting-empty"><Search size={26} /><h3>Nenhuma instituição neste recorte</h3><p>Altere os filtros ou limpe a busca para ver os locais disponíveis.</p></div>}
    <p className="voting-footnote">O CSV inclui todas as linhas filtradas, na ordem exibida, com votos e percentuais de todos os candidatos da eleição e turno. A classificação dos tipos e a cobertura continuam em revisão.</p>
  </section>;
}
