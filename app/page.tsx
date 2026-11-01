"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowDownToLine, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronDown, CircleHelp, Database, FileCheck2, Fingerprint, Info, Landmark, MapPin, Search, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import Brazil from "@svg-maps/brazil";
import catalog from "../public/data/catalog.json";
import UnitLeader from "./components/unit-leader";

type Kind = "presidio" | "socioeducativa" | "unclassified";
type Unit = { id: string; name: string; kind: Kind; uf: string; municipality: string; latitude: number | null; longitude: number | null; sections: { year: number; turn: number; evidence_url: string; matched?: boolean }[] };
type Result = { unit_id: string; year: number; turn: number; valid: number; blank: number; null: number; total: number; section_count: number; candidates: { number: number; name: string; votes: number }[] };
type Dataset = { status: string; units: Unit[]; results: Result[]; sources: { url: string; retrieved_at: string; label?: string }[]; elections: { year: number; status: string }[]; limitations?: string[] };
const data = catalog as unknown as Dataset;
const format = (value: number) => new Intl.NumberFormat("pt-BR").format(value);
const labels: Record<Kind, string> = { presidio: "Presídio", socioeducativa: "Unidade socioeducativa", unclassified: "Custódia · a classificar" };
const states = [...Brazil.locations].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
const ufOf = (id: string) => id.replace(/^br-/, "").toUpperCase();

export default function Home() {
  const [year, setYear] = useState(2022);
  const [turn, setTurn] = useState(2);
  const [kind, setKind] = useState<Kind | "all">("all");
  const [uf, setUf] = useState("all");
  const [query, setQuery] = useState("");
  const [unitId, setUnitId] = useState<string | null>(null);
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const [mobileNav, setMobileNav] = useState(false);

  const units = useMemo(() => data.units.filter(unit =>
    unit.sections.some(section => section.year === year && section.turn === turn) &&
    (kind === "all" || unit.kind === kind) && (uf === "all" || unit.uf === uf) &&
    `${unit.name} ${unit.municipality}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))
  ), [year, turn, kind, uf, query]);
  const results = useMemo(() => {
    const ids = new Set(units.filter(unit => !unitId || unit.id === unitId).map(unit => unit.id));
    return data.results.filter(result => result.year === year && result.turn === turn && ids.has(result.unit_id));
  }, [units, unitId, year, turn]);
  // O resumo de cada cartão independe da unidade selecionada no detalhamento.
  const unitResults = useMemo(() => new Map(
    data.results.filter(result => result.year === year && result.turn === turn)
      .map(result => [result.unit_id, result])
  ), [year, turn]);
  const tally = useMemo(() => {
    const candidates = new Map<number, { number: number; name: string; votes: number }>();
    let valid = 0, blank = 0, nullVotes = 0;
    results.forEach(result => {
      valid += result.valid; blank += result.blank; nullVotes += result.null;
      result.candidates.forEach(candidate => {
        const item = candidates.get(candidate.number) ?? { ...candidate, votes: 0 };
        item.votes += candidate.votes; candidates.set(candidate.number, item);
      });
    });
    return { valid, blank, nullVotes, candidates: [...candidates.values()].sort((a, b) => b.votes - a.votes || a.number - b.number) };
  }, [results]);
  const stateCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    data.units.filter(unit => unit.sections.some(s => s.year === year && s.turn === turn) && (kind === "all" || unit.kind === kind)).forEach(unit => counts[unit.uf] = (counts[unit.uf] ?? 0) + 1);
    return counts;
  }, [year, turn, kind]);
  const update = (action: () => void) => { action(); setUnitId(null); };
  const toggleUf = (code: string) => update(() => setUf(current => current === code ? "all" : code));
  const selection = `${year} · ${turn}º turno`;
  const hasData = data.results.length > 0;
  const hasSources = data.sources.length > 0;
  const selectedUnits = units.filter(unit => !unitId || unit.id === unitId);
  const selectedSections = selectedUnits.flatMap(unit => unit.sections.filter(section => section.year === year && section.turn === turn));
  const matchedCount = selectedSections.filter(section => section.matched).length;
  const clearScope = () => { setUf("all"); setKind("all"); setQuery(""); setUnitId(null); };

  function download() {
    const payload = { description: "Votos nas seções identificadas, sem atribuição individual. Cobertura parcial.", year, turn, coverage: { registered_sections: selectedSections.length, matched_sections: matchedCount }, limitations: data.limitations, filters: { kind, uf, query, unitId }, units: units.filter(unit => !unitId || unit.id === unitId), results, sources: data.sources };
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    link.download = `voto-sob-custodia-${year}-turno-${turn}.json`;
    link.click(); URL.revokeObjectURL(link.href);
  }

  const faqs = [
    ["Estes dados mostram em quem as pessoas presas votaram?", "Não individualmente. O recorte reúne votos de seções identificadas em unidades prisionais ou socioeducativas. Dependendo das regras da eleição, servidores e mesários também podem votar nessas seções. O voto permanece secreto."],
    ["Por que separar presídios e unidades socioeducativas?", "São estabelecimentos e públicos diferentes. As unidades socioeducativas atendem adolescentes e jovens em cumprimento de medidas socioeducativas. A classificação precisa de uma fonte oficial e pode ser filtrada sem misturar as categorias."],
    ["Um estado sem resultados não teve votação nessas unidades?", "Não é possível concluir isso. A ausência de dados aqui significa que ainda não há vínculos e resultados validados publicados no projeto. Não é uma contagem de zero votos ou uma comprovação de inexistência de seções."],
    ["Por que não somar primeiro e segundo turnos?", "Uma mesma pessoa pode participar dos dois turnos. Somá-los produziria uma contagem de participações, não de pessoas. Por isso, os resultados são apresentados por eleição e turno."],
  ];

  return <>
    <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
    <header className="header">
      <a href="#" className="brand" aria-label="Voto Sob Custódia, início"><span className="brand-icon"><Fingerprint size={26} /></span><span>voto<span className="brand-light">sob</span>custódia<span className="brand-dot">.</span></span></a>
      <button className="mobile-toggle icon-button" onClick={() => setMobileNav(!mobileNav)} aria-expanded={mobileNav} aria-controls="navigation" aria-label="Abrir navegação">{mobileNav ? <X /> : <SlidersHorizontal />}</button>
      <nav id="navigation" className={mobileNav ? "nav nav-open" : "nav"} aria-label="Navegação principal" onClick={() => setMobileNav(false)}>
        <a href="#direito">O direito ao voto</a><a href="#mapa">Explore o mapa</a><a href="#resultados">Resultados</a><a href="#metodologia" className="nav-source">Fontes e método <ArrowUpRight size={14} /></a>
      </nav>
    </header>

    <main id="conteudo">
      <section className="hero wrap">
        <div className="hero-main"><span className="eyebrow"><span className="tiny-line" /> DEMOCRACIA, SEM PONTOS CEGOS</span>
          <h1>O direito ao voto<br />também atravessa<br /><em>os muros.</em></h1>
          <p>Quem pode votar sob custódia? Onde acontece a votação? O que dizem os resultados? Informação pública para entender uma parte pouco visível da nossa democracia.</p>
          <a href="#direito" className="button button-dark">Comece pelo direito ao voto <ArrowDown size={17} /></a>
          <div className="hero-note"><ShieldCheck size={15} /> Fontes oficiais. Contexto antes dos números.</div>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="art-grid" /><span className="art-caption">CIDADANIA NÃO É UM LUGAR.</span><div className="ballot"><div className="ballot-top"><span>UM DIREITO.</span><ArrowUpRight size={27} /></div><div className="ballot-mark"><Check size={90} strokeWidth={1.7} /></div><div className="ballot-bottom"><span>UMA VOZ.</span><span>BRASIL<br />CF · ART. 15</span></div></div><div className="art-footer"><span className="art-square" /> ENTENDER É O PRIMEIRO PASSO.</div></div>
      </section>

      <div className="project-status"><div className="wrap status-inner"><span className="status-dot" /><strong>Pesquisa em construção</strong><span>{hasData ? "Votos oficiais por seção publicados. Recorte parcial; classificação das unidades em revisão." : hasSources ? "Arquivos oficiais preservados localmente. Piloto DF/2022 em revisão." : "Piloto: Distrito Federal · 2022. Os dados eleitorais ainda aguardam validação."}</span><a href="#metodologia">Acompanhe o método <ArrowRight size={14} /></a></div></div>

      <section id="direito" className="section wrap">
        <div className="section-heading"><div><span className="eyebrow">01 / ENTENDA O CONTEXTO</span><h2>Estar sob custódia não significa<br />perder o direito ao voto.</h2></div><p>A situação jurídica e a regularidade eleitoral fazem a diferença. Estas são as regras gerais.</p></div>
        <div className="rights-grid">
          <article className="right-card"><span className="card-symbol can"><Check size={20} /></span><span className="card-label">DIREITO PRESERVADO</span><h3>Pessoas presas<br />provisoriamente</h3><p>Sem condenação criminal transitada em julgado, a prisão, por si só, não suspende os direitos políticos. É preciso estar eleitoralmente apto.</p><span className="card-foot">Inclui condenação ainda sujeita a recurso.</span></article>
          <article className="right-card"><span className="card-symbol can"><Check size={20} /></span><span className="card-label">A PARTIR DOS 16 ANOS</span><h3>Adolescentes em<br />unidades socioeducativas</h3><p>Podem votar, observadas as condições eleitorais. O voto é facultativo aos 16 e 17 anos. Este público aparece separado dos presídios.</p><span className="card-foot">Medida socioeducativa não é pena criminal.</span></article>
          <article className="right-card restricted"><span className="card-symbol cannot"><X size={20} /></span><span className="card-label">DIREITOS SUSPENSOS</span><h3>Condenação criminal<br />definitiva</h3><p>Os direitos políticos ficam suspensos com a condenação criminal transitada em julgado, enquanto durarem seus efeitos.</p><span className="card-foot">Constituição Federal, art. 15, III.</span></article>
        </div>
        <div className="context-note"><Info size={18} /><p><strong>Ter direito e conseguir votar são coisas diferentes.</strong> A votação depende dos procedimentos da eleição, dos prazos e da instalação de seções. A síntese jurídica e as regras de cada ano ainda serão revisadas nas fontes oficiais. <a href="https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm" target="_blank" rel="noreferrer">Consulte a Constituição <ArrowUpRight size={12} /></a></p></div>
      </section>

      <section id="mapa" className="map-section">
        <div className="wrap"><div className="section-heading"><div><span className="eyebrow">02 / EXPLORE O TERRITÓRIO</span><h2>Onde o voto acontece.</h2></div><p>Locais do recorte oficial de custódia do TSE. Selecione uma UF; os subtipos ainda não confirmados aparecem como “A classificar”.</p></div>
          <div className="filter-row">
            <label>Eleição<span className="select-wrap"><select value={year} onChange={e => update(() => setYear(Number(e.target.value)))}><option value={2018}>2018</option><option value={2022}>2022</option><option value={2026}>2026</option></select><ChevronDown size={15} /></span></label>
            <label>Turno<span className="select-wrap"><select value={turn} onChange={e => update(() => setTurn(Number(e.target.value)))}><option value={1}>1º turno</option><option value={2}>2º turno</option></select><ChevronDown size={15} /></span></label>
            <label>Estado<span className="select-wrap"><select value={uf} onChange={e => update(() => setUf(e.target.value))}><option value="all">Todo o Brasil</option>{states.map(state => <option value={ufOf(state.id)} key={state.id}>{state.name}</option>)}</select><ChevronDown size={15} /></span></label>
            <div className="type-filter" role="group" aria-label="Tipo de unidade">{([["all", "Todas"], ["presidio", "Presídios"], ["socioeducativa", "Socioeducativas"], ["unclassified", "A classificar"]] as const).map(([value, label]) => <button key={value} aria-pressed={kind === value} className={kind === value ? "active" : ""} onClick={() => update(() => setKind(value))}>{value !== "all" && <span className={`legend-dot ${value}`} />}{label}</button>)}</div>
          </div>
          <div className="classification-note"><Info size={17} /><p><strong>Como ler as categorias:</strong> o TSE reúne estes locais sob “Preso provisório”, incluindo unidades socioeducativas. Quando o subtipo não foi confirmado, mostramos “A classificar”, sem inferir pelo nome. Os votos dessas seções já podem ser consultados em <strong>Todas</strong>.</p></div>
          <div className="map-layout">
            <div className="map-panel"><div className="map-topline"><span>BRASIL / {uf === "all" ? "TODAS AS UFs" : uf}</span><span>CADASTRO POR UF</span></div>
              <svg className="brazil-map" viewBox={Brazil.viewBox} aria-label="Mapa interativo das unidades federativas do Brasil">{Brazil.locations.map(state => {
                const code = ufOf(state.id);
                return <path key={state.id} d={state.path} className={`${code === uf ? "selected" : ""} ${stateCounts[code] ? "has-data" : ""}`} role="button" tabIndex={0} aria-label={`Filtrar por ${state.name}`} aria-pressed={uf === code} onClick={() => toggleUf(code)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleUf(code); } }}><title>{`${state.name}: ${stateCounts[code] ? `${stateCounts[code]} unidade(s) no cadastro` : "sem dados validados publicados"}`}</title></path>;
              })}</svg>
              <div className="map-legend"><span><i className="legend-square" /> Sem dados publicados</span><span><i className="legend-square available" /> Com cadastro publicado</span></div>
              <span className="map-attribution">Base: <a href="https://github.com/VictorCazanave/svg-maps/tree/master/packages/brazil" target="_blank" rel="noreferrer">SVG Maps</a> / <a href="https://mapsvg.com/maps/brazil" target="_blank" rel="noreferrer">MapSVG</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>. Mapa adaptado.</span>
            </div>
            <aside className="units-panel" aria-label="Unidades do recorte"><div className="units-heading"><h3>Unidades do recorte</h3><span>{selection}</span></div><label className="search-field"><Search size={17} /><input aria-label="Buscar unidade ou município" placeholder="Busque unidade ou município" value={query} onChange={e => update(() => setQuery(e.target.value))} /></label>
              <div className="unit-list" aria-live="polite">{units.length ? units.map(unit => <button key={unit.id} className={`unit-card ${unitId === unit.id ? "chosen" : ""}`} aria-pressed={unitId === unit.id} onClick={() => setUnitId(unitId === unit.id ? null : unit.id)}><span className={`unit-kind ${unit.kind}`}>{labels[unit.kind]}</span><strong>{unit.name}</strong><span>{unit.municipality} · {unit.uf}</span><UnitLeader result={unitResults.get(unit.id)} /><span className="unit-action">{unitId === unit.id ? "Remover seleção" : "Ver resultados"} <ArrowRight size={13} /></span></button>) : <div className="empty-units"><span className="empty-icon"><MapPin size={25} strokeWidth={1.4} /></span><h4>{hasData ? "Nenhuma unidade neste recorte" : "O cadastro começa pela verificação."}</h4><p>{hasData ? "Experimente Todas ou A classificar. Sem classificação confirmada não significa ausência de votos; a separação entre presídios e socioeducativas ainda está em revisão." : "Ainda não há unidades validadas publicadas. Primeiro, precisamos confirmar o vínculo entre cada estabelecimento e suas seções eleitorais."}</p><button className="text-button" onClick={clearScope}>Mostrar todos os locais <ArrowRight size={14} /></button></div>}</div>
              <div className="units-note"><Info size={15} /><span>Sem dados não significa sem votação.</span></div>
            </aside>
          </div>
        </div>
      </section>

      <section id="resultados" className="section wrap"><div className="section-heading"><div><span className="eyebrow">03 / LEIA OS RESULTADOS</span><h2>O que as urnas registram.</h2></div><div className="result-context"><span className="pill">PRESIDENTE</span><span>{selection}{uf !== "all" ? ` · ${uf}` : ""}</span></div></div>
        <div className="selection-summary"><span>{unitId ? selectedUnits[0]?.name : `${units.length} locais no recorte selecionado`}</span><button className="text-button" onClick={clearScope}>Limpar busca e filtros</button></div>
        <div className="result-warning"><ShieldCheck size={19} /><p><strong>Votos nas seções identificadas.</strong> Os totais podem incluir servidores e mesários. Não permitem atribuir escolhas individuais às pessoas sob custódia.</p></div>
        <div aria-live="polite">{results.length ? <div className="results-data"><div className="result-summary"><span><strong>{format(matchedCount)}</strong> seções com votos</span><span><strong>{format(tally.valid)}</strong> votos válidos</span><span><strong>{format(tally.blank)}</strong> brancos</span><span><strong>{format(tally.nullVotes)}</strong> nulos</span></div>{tally.candidates.map(candidate => <div className="candidate" key={candidate.number}><div><strong>{candidate.name}</strong><span>{format(candidate.votes)} votos · {tally.valid ? (100 * candidate.votes / tally.valid).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"}{tally.valid ? "% dos válidos" : " (sem votos válidos)"}</span></div><div className="candidate-track"><span style={{ width: `${tally.valid ? 100 * candidate.votes / tally.valid : 0}%` }} /></div></div>)}</div> : <div className="results-empty"><div className="empty-icon"><Database size={27} strokeWidth={1.4} /></div><div><h3>{hasData ? "Não há resultados publicados para este recorte." : "Antes dos números, a confiança nos dados."}</h3><p>{hasData ? "Revise os filtros. Não é possível inferir zero votos a partir da ausência de registros." : "Os resultados aparecerão após o cruzamento da votação oficial do TSE com o cadastro revisado de seções. Não exibimos estimativas nem resultados demonstrativos."}</p></div><span className="pending-badge">{hasData ? "SEM REGISTROS" : "AGUARDANDO VALIDAÇÃO"}</span></div>}</div>
        <div className="result-footer"><p>{results.length ? `${matchedCount} de ${selectedSections.length} seções principais cadastradas neste recorte têm votação correspondente. ` : ""}Percentuais sobre votos válidos. Turnos separados; cobertura parcial.</p><button className="text-button" disabled={!results.length} onClick={download}><ArrowDownToLine size={15} /> Baixar dados do recorte</button></div>
      </section>

      <section id="metodologia" className="method-section"><div className="wrap"><div className="section-heading"><div><span className="eyebrow">04 / TRANSPARÊNCIA POR PRINCÍPIO</span><h2>Cada número precisa<br />de um caminho até a fonte.</h2></div><p>Arquivos locais de 2018, 2022 e 2026, com vínculo por eleição, turno, UF, município, zona e seção. Lacunas ficam fora dos totais e são documentadas.</p></div>
        <div className="method-grid"><article><span className="step-number">01</span><FileCheck2 size={22} /><h3>Identificar as seções</h3><p>Confirmar, em fonte oficial, o vínculo histórico entre unidade, município, zona, seção e turno.</p><span className="step-status">Recorte oficial identificado</span></article><article><span className="step-number">02</span><Database size={22} /><h3>Cruzar a votação</h3><p>Usar os arquivos de votação por seção do TSE. Separar candidatos, brancos e nulos sem somar turnos.</p><span className="step-status">Cruzamento local executado</span></article><article><span className="step-number">03</span><ShieldCheck size={22} /><h3>Conferir e publicar</h3><p>Publicar o cruzamento com as fontes e as lacunas. A revisão dos subtipos e a conferência independente com boletins continuam pendentes.</p><span className="step-status">Dados parciais publicados</span></article></div>
        <div className="sources-box"><div><BookOpen size={20} /><h3>Fontes e arquivos locais</h3></div><p>Votação e locais do TSE foram cruzados a partir de originais preservados localmente. Seções agregadas, vínculos conflitantes e ausências ficam documentados, sem virar zero votos. Os subtipos e a conferência independente com todos os boletins seguem pendentes.</p><div className="source-links"><a href="https://dadosabertos.tse.jus.br/" target="_blank" rel="noreferrer">Dados Abertos · TSE <ArrowUpRight size={15} /></a><a href="https://www.tre-df.jus.br/" target="_blank" rel="noreferrer">Tribunal Regional · DF <ArrowUpRight size={15} /></a><a href="https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm" target="_blank" rel="noreferrer">Constituição Federal <ArrowUpRight size={15} /></a></div>{data.sources.length > 0 && <ul className="published-sources">{data.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label ?? "Fonte arquivada"} <ArrowUpRight size={12} /></a> · obtido em {source.retrieved_at}</li>)}</ul>}</div>
      </div></section>

      <section className="faq-section wrap"><div><span className="eyebrow">PARA ENTENDER MELHOR</span><h2>Perguntas que<br />importam.</h2><CircleHelp size={28} strokeWidth={1.4} /></div><div className="faqs">{faqs.map(([question, answer], i) => <div className="faq-item" key={question}><h3><button aria-expanded={faqOpen === i} aria-controls={`faq-${i}`} onClick={() => setFaqOpen(faqOpen === i ? null : i)}>{question}<span>{faqOpen === i ? "−" : "+"}</span></button></h3><div id={`faq-${i}`} hidden={faqOpen !== i}><p>{answer}</p></div></div>)}</div></section>
    </main>
    <footer className="footer"><div className="wrap footer-main"><a className="brand" href="#"><Fingerprint size={24} /><span>voto<span className="brand-light">sob</span>custódia.</span></a><p>Informação pública. Contexto. Democracia.</p><span>Projeto independente · Em desenvolvimento</span></div><div className="wrap footer-bottom"><span>Sem vínculo institucional com a Justiça Eleitoral.</span><a href="#metodologia">Feito para ser verificável <Landmark size={13} /></a></div></footer>
  </>;
}
