import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Database, Fingerprint, Info } from "lucide-react";
import dataset from "../../public/data/null-votes.json";
import type { NullVotesData } from "../../lib/null-votes";
import NullVotesTable from "./null-votes-table";
import "../tabela/table.css";
import "./null-votes.css";

export const metadata: Metadata = {
  title: "Os números do voto nulo — Voto Sob Custódia",
  description: "Estudo nacional dos números digitados em votos nulos para presidente em 2026: total por número e quantidade em cada UF, com ordenação em todas as colunas e dados oficiais do TSE.",
};
const data = dataset as unknown as NullVotesData;
const format = (value: number) => new Intl.NumberFormat("pt-BR").format(value);

export default function NullVotesPage() {
  const complete = data.status === "complete";
  return <>
    <a className="skip-link" href="#nulos-conteudo">Pular para o conteúdo</a>
    <header className="header table-header null-header">
      <Link href="/" className="brand" aria-label="Voto Sob Custódia, início"><span className="brand-icon"><Fingerprint size={26} /></span><span>voto<span className="brand-light">sob</span>custódia<span className="brand-dot">.</span></span></Link>
      <div><Link href="/tabela" className="null-institutions-link">Instituições e municípios</Link><Link href="/" className="table-back"><ArrowLeft size={16} /><span>Voltar ao site</span></Link></div>
    </header>
    <main id="nulos-conteudo" className="table-page null-page">
      <div className="table-intro null-intro">
        <span className="eyebrow"><span className="tiny-line" /> ESTUDO NACIONAL / VOTOS NULOS</span>
        <h1>Os números<br />do <em>voto nulo.</em></h1>
        <p>Quais números foram confirmados como voto nulo? Consulte o total nacional de cada número e sua distribuição pelas 27 UFs.</p>
        <div className="null-scope">Brasil · todas as seções disponíveis · Presidente · {data.year} · {data.turn}º turno</div>
      </div>
      {!complete && <div className="null-pending" role="status"><Info size={18} /><p><strong>Consolidação em andamento: {data.processed_ufs.length} de {data.expected_ufs.length} UFs.</strong> Os valores abaixo correspondem somente às UFs já processadas. A lista nacional será consolidada ao concluir a aquisição.</p></div>}
      <div className="null-stats" aria-label="Resumo do estudo">
        <div><span>Nulos com número registrado</span><strong>{format(data.summary.null_with_digits)}</strong><small>votos contabilizados na tabela</small></div>
        <div><span>Números diferentes</span><strong>{format(data.rows.length)}</strong><small>zeros à esquerda preservados</small></div>
        <div><span>UFs processadas</span><strong>{data.processed_ufs.length}<span> / {data.expected_ufs.length}</span></strong><small>{format(data.summary.sections_processed)} seções com registro para presidente</small></div>
      </div>
      <NullVotesTable rows={data.rows} year={data.year} turn={data.turn} processedUfs={data.processed_ufs} />
      {data.reference_validation?.status === "matched" && <p className="null-verified"><Info size={15} />Totais de nulos conferidos com a apuração oficial do TSE nas 27 UFs.</p>}
      <section className="table-method null-method" aria-labelledby="null-method-title">
        <div><Database size={20} /><h2 id="null-method-title">O que esses números mostram</h2></div>
        <ul>
          <li>O estudo considera <strong>todas as seções disponíveis nas 27 UFs</strong>, incluindo o DF. O recorte abrange o país e não se limita às instituições de custódia. Exterior (ZZ) não está incluído.</li>
          <li>A origem é o <strong>Registro Digital do Voto (RDV)</strong> oficial do TSE. Cada registro de nulo com o campo <code>digitacao</code> incrementa a contagem daquele número uma vez. Outros cargos e turnos são separados no processamento.</li>
          <li>Cada coluna de <strong>UF</strong> mostra a quantidade absoluta de votos daquele número no estado ou no DF. O total nacional é a soma das 27 colunas. Clique em qualquer cabeçalho para ordenar em ambos os sentidos; as contagens não são taxas proporcionais ao eleitorado.</li>
          <li><strong>{format(data.summary.null_without_digits)} nulos sem digitação registrada</strong> ficam fora da lista de números. O esquema prevê categorias sem esse campo, como <code>nuloAposSuspensao</code>. Zero à esquerda faz parte do número: <code>00</code> não é convertido em <code>0</code>.</li>
          <li>O código <code>96</code> nos CSVs de apuração é a categoria “voto nulo”. Aqui, cada número vem do campo <code>digitacao</code> do RDV; se <code>96</code> aparecer na tabela, representa a digitação desse número.</li>
          <li>Os registros não identificam a pessoa que votou nem a ordem de comparecimento. Os arquivos originais são preservados localmente; esta página usa somente as contagens agregadas.</li>
        </ul>
        <div className="null-source-links">{data.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}<ArrowUpRight size={13} /></a>)}</div>
        <details className="null-coverage">
          <summary>Cobertura e arquivos por UF</summary>
          <div className="null-coverage-scroll"><table><thead><tr><th scope="col">UF</th><th scope="col">RDVs processados</th><th scope="col">Nulos com número</th><th scope="col">Nulos sem número</th></tr></thead><tbody>{data.states.map(state => <tr key={state.uf}><th scope="row"><a href={state.source_url} target="_blank" rel="noreferrer">{state.uf}<ArrowUpRight size={10} /></a></th><td>{format(state.files_processed)}</td><td>{format(state.null_with_digits)}</td><td>{format(state.null_without_digits)}</td></tr>)}</tbody></table></div>
        </details>
      </section>
    </main>
    <footer className="table-footer"><span>Voto Sob Custódia · dados oficiais, preservados localmente.</span><Link href="/">Voltar ao site <ArrowUpRight size={14} /></Link></footer>
  </>;
}
