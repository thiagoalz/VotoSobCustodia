import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Database, Fingerprint } from "lucide-react";
import catalog from "../../public/data/catalog.json";
import municipalities from "../../public/data/municipalities.json";
import { buildInstitutionTables } from "../../lib/institution-table";
import VotingTable from "./voting-table";
import "./table.css";

export const metadata: Metadata = {
  title: "Tabela de instituições e municípios — Voto Sob Custódia",
  description: "Votos e percentuais por candidato, instituição e município, com filtros e ordenação em todas as colunas. Dados oficiais preservados localmente.",
};

export default function TablePage() {
  const elections = buildInstitutionTables(catalog, municipalities);
  return <>
    <a className="skip-link" href="#tabela-conteudo">Pular para a tabela</a>
    <header className="header table-header">
      <Link href="/" className="brand" aria-label="Voto Sob Custódia, início"><span className="brand-icon"><Fingerprint size={26} /></span><span>voto<span className="brand-light">sob</span>custódia<span className="brand-dot">.</span></span></Link>
      <Link href="/" className="table-back"><ArrowLeft size={16} /> <span>Voltar ao site</span></Link>
    </header>
    <main id="tabela-conteudo" className="table-page">
      <div className="table-intro">
        <span className="eyebrow"><span className="tiny-line" /> DADOS ABERTOS / CONSULTA COMPLETA</span>
        <h1>Instituições e seus municípios.</h1>
        <p>Os votos de cada candidato, lado a lado. Uma linha por local de votação do recorte de custódia, na eleição e no turno selecionados.</p>
      </div>
      <VotingTable elections={elections} />
      <section className="table-method" aria-labelledby="table-method-title">
        <div><Database size={20} /><h2 id="table-method-title">Como ler estes dados</h2></div>
        <ul>
          <li>O município é considerado <strong>inteiro, incluindo as seções da própria instituição</strong>. Seu resultado se repete quando há mais de uma instituição no mesmo município; não some essas linhas como se fossem municípios diferentes.</li>
          <li>Os percentuais usam os <strong>votos válidos de cada recorte</strong>: da instituição ou do município. Brancos e nulos não entram nesse denominador.</li>
          <li>“—” indica resultado indisponível ou percentual sem denominador. Zero indica ausência de votos para o candidato em um resultado disponível. “Anulados em separado” é uma categoria adicional do arquivo oficial e está incluída no total municipal.</li>
          <li>O vínculo usa ano, turno, UF e <strong>código municipal do TSE</strong>, que não é o código IBGE. No DF, BRASÍLIA corresponde ao município eleitoral do cadastro, sem separar regiões administrativas.</li>
          <li>O recorte parte de <strong>CD_TIPO_LOCAL=3 (“Preso provisório”)</strong>. Presídios e unidades socioeducativas permanecem “A classificar” quando não há confirmação oficial do subtipo. A cobertura é parcial; os votos das seções podem incluir servidores e mesários.</li>
        </ul>
        <p>Os arquivos já estão preservados no projeto. Esta página funciona com as cópias locais, sem consultas ao TSE durante a navegação. Ordenar ou filtrar não altera os dados originais.</p>
        <details>
          <summary>Fontes oficiais e versões dos arquivos</summary>
          <ul className="table-sources">{catalog.sources.filter(source => source.url.includes("votacao_secao/") || source.url.includes("eleitorado_locais_votacao/")).map(source => <li key={source.url}>
            <a href={source.url} target="_blank" rel="noreferrer">{source.label} <ArrowUpRight size={12} /></a>
            <span>Obtido em {source.retrieved_at.slice(0, 10).split("-").reverse().join("/")} · SHA-256: <code>{source.sha256}</code></span>
          </li>)}</ul>
        </details>
      </section>
    </main>
    <footer className="table-footer"><span>Voto Sob Custódia · informação pública, com contexto.</span><Link href="/">Voltar ao mapa e aos resultados <ArrowUpRight size={14} /></Link></footer>
  </>;
}
