/* ============================================================
   Cálculos: taxas, comparação com referências e associações
   ------------------------------------------------------------
   Regras (documentadas em "Fontes e metodologia"):
   - taxa = eventos ÷ população × 100.000, no período coberto pelo arquivo
     (anos parciais NÃO são anualizados);
   - referência = taxa da UF no mesmo período; esperado = taxa da UF × população local;
   - razão = observado ÷ esperado, com intervalo de 95% (Poisson, Byar);
   - "acima"/"abaixo" só quando o intervalo inteiro fica acima/abaixo de 1.
   ============================================================ */
const POR = 100000;

function taxa(eventos, populacao){
  if(eventos == null || !populacao) return null;   // sem denominador não há taxa (nem divisão por zero)
  return eventos / populacao * POR;
}

/* Classificação transparente da razão observado/esperado. */
function classificar(observado, esperado){
  if(observado == null || !esperado) return { classe:"indisponivel", rotulo:"Sem base para comparar", razao:null, ic:null };
  const [li, ls] = intervaloPoisson(observado).map(v => v / esperado);
  const razao = observado / esperado;
  let classe = "compativel", rotulo = "Sem diferença clara em relação à referência";
  if(li > 1){ classe = "acima"; rotulo = "Acima da referência"; }
  else if(ls < 1){ classe = "abaixo"; rotulo = "Abaixo da referência"; }
  const poucos = observado < 10;
  return { classe, rotulo, razao, ic:[li, ls], poucos };
}

/* Filtro de perfil: chaves "cap|sexo|faixa" aceitas. */
function filtroPerfil(causa, sexo, idade){
  const faixas = GRUPOS_IDADE[idade]?.faixas;
  return (cap, s, faixa) =>
    (causa.tipo === "todas" || Number(cap) === causa.cap) &&
    (!sexo || s === sexo) &&
    (!faixas || faixas.includes(faixa));
}

function somarPerfil(perfil, aceita){
  let n = 0;
  if(!perfil) return 0;
  for(const [chave, q] of perfil){
    const [cap, s, faixa] = chave.split("|");
    if(aceita(cap, s, faixa)) n += q;
  }
  return n;
}

function somarIdade(piramide, sexo, idade){
  if(!piramide) return null;
  const faixas = GRUPOS_IDADE[idade]?.faixas;
  let n = 0;
  for(const [chave, q] of piramide){
    const [s, faixa] = chave.split("|");
    if((!sexo || s === sexo) && (!faixas || faixas.includes(faixa))) n += q;
  }
  return n;
}

/* Análise de um local para a seleção atual.
   Devolve todos os números com numerador, denominador e origem. */
async function analisar(local, opcoes){
  const { evento, ano } = opcoes;
  const causa = typeof opcoes.causa === "string" ? lerCausa(opcoes.causa) : opcoes.causa;
  const sexo = opcoes.sexo || "", idade = opcoes.idade || "";
  const disp = disponibilidade(evento, causa);
  const info = infoAno(evento, ano);
  const resultado = { local, causa, evento, ano, sexo, idade, info, disponivel: disp.ok && Boolean(info), motivo: disp.motivo, alternativa: disp.alternativa };
  if(!info) resultado.motivo = `Não há dados de ${EVENTOS[evento].plural} para ${ano}.`;
  if(!resultado.disponivel) return resultado;

  const uf = ufDe(local);
  const refs = ehMunicipio(local) ? [uf, "BR"] : (local === "BR" ? [] : ["BR"]);
  const comPerfil = Boolean(sexo || idade);

  if(comPerfil){
    // Recorte por sexo/idade: só óbitos por capítulo ou total, com população do Censo 2022 do mesmo recorte.
    if(evento !== "obitos" || !["todas","cap"].includes(causa.tipo)){
      return { ...resultado, disponivel:false, motivo:"O recorte por sexo e idade só está disponível para óbitos por capítulo da CID-10 ou para todas as causas. Para outros níveis não há denominador nem contagem por perfil; a taxa com a população total seria incorreta." };
    }
    const aceita = filtroPerfil(causa, sexo, idade);
    const [perfilUF, idUF] = await Promise.all([simPerfilUF(ano), idadeUFs()]);
    const medir = async l => {
      let n, populacao;
      if(ehMunicipio(l)){
        const [perfil, id] = await Promise.all([simPerfilMun(ano, ufDe(l)), idadeMunicipios(ufDe(l))]);
        n = somarPerfil(perfil.get(l), aceita);
        populacao = somarIdade(id.get(l), sexo, idade);
      }else if(l === "BR"){
        n = 0;
        for(const u of ALL_UFS) n += somarPerfil(perfilUF.get(u), aceita);
        populacao = somarIdade(idUF.get("BR"), sexo, idade);
      }else{
        n = somarPerfil(perfilUF.get(l), aceita);
        populacao = somarIdade(idUF.get(l), sexo, idade);
      }
      return { local:l, n, pop: populacao ? { valor: populacao, ano:"2022", defasado: ano !== "2022", origem:"Censo 2022, mesmo sexo e idade" } : null, taxa: taxa(n, populacao) };
    };
    Object.assign(resultado, await medir(local));
    resultado.refs = await Promise.all(refs.map(medir));
  }else{
    const medir = async l => {
      const n = await contarEventos(l, causa, evento, ano);
      const populacao = popDe(l, ano);
      return { local:l, n, pop: populacao, taxa: taxa(n, populacao?.valor) };
    };
    Object.assign(resultado, await medir(local));
    resultado.refs = await Promise.all(refs.map(medir));
  }

  // Comparação com a UF (ou com o Brasil, quando o local é uma UF)
  const ref = resultado.refs[0];
  if(ref && ref.taxa != null && resultado.pop){
    resultado.esperado = ref.taxa / POR * resultado.pop.valor;
    resultado.comparacao = classificar(resultado.n, resultado.esperado);
    resultado.referencia = ref;
  }

  // Padronização indireta por idade e sexo (óbitos, total ou capítulo, sem recorte)
  if(ehMunicipio(local) && evento === "obitos" && ["todas","cap"].includes(causa.tipo) && !comPerfil){
    resultado.padronizado = await padronizar(local, causa, ano, resultado.n);
  }
  return resultado;
}

/* Esperado = Σ (taxa da UF em cada sexo e faixa etária × população local do mesmo sexo e faixa).
   Populações do Censo 2022 nos dois lados, para que a razão seja coerente. */
async function padronizar(mun, causa, ano, observado){
  const uf = ufDe(mun);
  try{
    const [perfilUF, idUF, idMun] = await Promise.all([simPerfilUF(ano), idadeUFs(), idadeMunicipios(uf)]);
    const obitosUF = perfilUF.get(uf), popUF = idUF.get(uf), popMun = idMun.get(mun);
    if(!obitosUF || !popUF || !popMun) return null;
    const porEstrato = new Map();
    let semIdade = 0;
    for(const [chave, n] of obitosUF){
      const [cap, sexo, faixa] = chave.split("|");
      if(causa.tipo === "cap" && Number(cap) !== causa.cap) continue;
      if(sexo === "I" || faixa === "ign"){ semIdade += n; continue; }
      const k = `${sexo}|${faixa}`;
      porEstrato.set(k, (porEstrato.get(k) || 0) + n);
    }
    let esperado = 0;
    for(const [k, n] of porEstrato){
      const pu = popUF.get(k), pm = popMun.get(k);
      if(pu && pm) esperado += n / pu * pm;
    }
    if(!esperado) return null;
    return { esperado, ...classificar(observado, esperado), obitosSemIdadeOuSexoNaUF: semIdade };
  }catch(erro){
    console.error(erro);
    return null;
  }
}

/* Série por ano do mesmo local e causa. */
async function serieAnual(local, opcoes){
  const anos = anosDe(opcoes.evento);
  return Promise.all(anos.map(async ano => {
    try{ return await analisar(local, { ...opcoes, ano }); }
    catch(erro){ return { ano, disponivel:false, motivo: erro.message, info: infoAno(opcoes.evento, ano) }; }
  }));
}

/* Taxas de todos os municípios da UF para a mesma seleção (base das comparações e do mapa). */
async function taxasDaUF(uf, causa, evento, ano){
  const lista = [];
  let fonte;
  if(evento === "obitos") fonte = await simMunicipios(ano, uf);
  else if(evento === "internacoes") fonte = await sihAno(ano);
  else fonte = await dengueCasos();
  for(const m of base.municipios){
    if(m.uf !== uf) continue;
    const populacao = popDe(m.c, ano);
    let n;
    if(evento === "obitos") n = contarCausa(fonte.get(m.c), causa);
    else if(evento === "internacoes"){
      const item = fonte.get(m.c);
      n = item ? (causa.tipo === "todas" ? item.total : item.get(String(causa.cap)) || 0) : 0;
    }else n = fonte.get(m.c)?.get(ano) || 0;
    lista.push({ c:m.c, nome:m.n, uf, n, pop: populacao?.valor ?? null, taxa: taxa(n, populacao?.valor) });
  }
  return lista;
}

/* Posição do município entre os de mesma UF e porte populacional. */
async function comparaveis(mun, causa, evento, ano){
  const uf = ufDe(mun);
  const todos = await taxasDaUF(uf, causa, evento, ano);
  const eu = todos.find(t => t.c === mun);
  if(!eu || eu.pop == null) return null;
  const porte = porteDe(eu.pop);
  const grupo = todos.filter(t => t.pop != null && porteDe(t.pop) === porte && t.taxa != null);
  const taxas = grupo.map(t => t.taxa).sort((a, b) => a - b);
  return {
    porte: PORTES[porte].rotulo, n: grupo.length, suficiente: grupo.length >= 8,
    mediana: quantil(taxas, 0.5), p25: quantil(taxas, 0.25), p75: quantil(taxas, 0.75),
    percentil: percentil(taxas, eu.taxa), grupo, todos
  };
}

/* Causas com mais registros no local, no nível escolhido (capítulo, grupo ou categoria). */
async function principaisCausas(local, evento, ano, nivel, limite = 15){
  const uf = ufDe(local);
  const populacao = popDe(local, ano), popRef = popDe(uf === local ? "BR" : uf, ano);
  let itens = [];
  if(evento === "internacoes"){
    const dados = await sihAno(ano);
    const meu = dados.get(local), ref = dados.get(uf === local ? "BR" : uf);
    itens = base.cid.capitulos.map(cap => ({ causa: lerCausa(`cap:${cap.n}`), n: meu?.get(String(cap.n)) || 0, nRef: ref?.get(String(cap.n)) || 0 }));
  }else if(evento === "obitos"){
    const meu = ehMunicipio(local) ? (await simMunicipios(ano, uf)).get(local) : (await simUFs(ano)).get(local)?.cid3;
    const ref = (await simUFs(ano)).get(uf === local ? "BR" : uf)?.cid3;
    let causas;
    if(nivel === "capitulo") causas = base.cid.capitulos.map(c => lerCausa(`cap:${c.n}`));
    else if(nivel === "grupo"){
      // só os grupos mais específicos (sem os que contêm outros), para não contar duas vezes
      const usados = new Set([...base.catPorCodigo.values()].map(c => c.grupo));
      causas = [...usados].map(i => base.cid.grupos[i]).map(g => lerCausa(`g:${g.ini}-${g.fim}`));
    }else causas = [...(meu?.keys() || [])].filter(c => base.catPorCodigo.has(c)).map(c => lerCausa(`c:${c}`));
    itens = causas.map(causa => ({ causa, n: contarCausa(meu, causa), nRef: contarCausa(ref, causa) }));
  }
  const total = itens.reduce((s, i) => s + i.n, 0);
  return itens.filter(i => i.n > 0).sort((a, b) => b.n - a.n).slice(0, limite).map(i => {
    const esperado = popRef && populacao ? i.nRef / popRef.valor * populacao.valor : null;
    return { ...i, taxa: taxa(i.n, populacao?.valor), participacao: total ? i.n / total : null, comparacao: classificar(i.n, esperado) };
  });
}

/* ---------- Indicadores territoriais ---------- */
function indicadorLocal(mun, id){
  const def = base.indPorId.get(id);
  if(!def) return null;
  const valor = base.indicadores.get(mun)?.[id];
  const uf = ufDe(mun);
  const valoresUF = [], valoresBR = [];
  for(const [codigo, item] of base.indicadores){
    if(item[id] == null) continue;
    valoresBR.push(item[id]);
    if(codigo.startsWith(IBGE_PREFIX_BY_UF[uf])) valoresUF.push(item[id]);
  }
  return {
    def, valor: valor ?? null, disponivel: valor != null,
    refUF: def.ref?.[uf] ?? null, refBR: def.ref?.BR ?? null,
    percentilUF: valor != null ? percentil(valoresUF, valor) : null,
    percentilBR: valor != null ? percentil(valoresBR, valor) : null,
    nUF: valoresUF.length
  };
}

/* O valor local merece atenção para este fator? Regra simples e explícita:
   está no quarto "desfavorável" dos municípios da UF, no sentido indicado pela literatura. */
function atencaoFator(ind, sentidoAtencao){
  if(!ind.disponivel || ind.percentilUF == null) return { nivel:"sem_dado", texto:"Sem valor local para este indicador." };
  const p = ind.percentilUF;
  const desfavoravel = sentidoAtencao === "maior" ? p >= 75 : p <= 25;
  const favoravel = sentidoAtencao === "maior" ? p <= 25 : p >= 75;
  if(desfavoravel) return { nivel:"atencao", texto:`Valor local entre os 25% ${sentidoAtencao === "maior" ? "mais altos" : "mais baixos"} dos municípios da UF.` };
  if(favoravel) return { nivel:"favoravel", texto:`Valor local entre os 25% ${sentidoAtencao === "maior" ? "mais baixos" : "mais altos"} dos municípios da UF.` };
  return { nivel:"intermediario", texto:"Valor local na faixa intermediária dos municípios da UF." };
}

/* Associação exploratória entre municípios da mesma UF: taxa do evento × indicador.
   Exclui municípios com menos de 10 mil habitantes (taxas instáveis). */
async function associacao(uf, causa, evento, ano, idIndicador){
  const todos = await taxasDaUF(uf, causa, evento, ano);
  const xs = [], ys = [];
  let excluidosPop = 0, excluidosSemValor = 0;
  for(const t of todos){
    const valor = base.indicadores.get(t.c)?.[idIndicador];
    if(t.pop == null || t.taxa == null || valor == null){ excluidosSemValor++; continue; }
    if(t.pop < 10000){ excluidosPop++; continue; }
    xs.push(valor); ys.push(t.taxa);
  }
  if(xs.length < 30) return { suficiente:false, n: xs.length, excluidosPop, excluidosSemValor };
  return { suficiente:true, ...spearman(xs, ys), excluidosPop, excluidosSemValor };
}

/* Temas da base de conhecimento ligados à causa selecionada. */
function temasDaCausa(causa){
  if(causa.tipo === "todas") return [];
  const saida = [];
  for(const tema of base.conhecimento.temas){
    for(const intervalo of tema.cid){
      const [ini, fim] = intervalo.split("-");
      const contida = causa.ini >= ini && causa.fim <= fim;           // seleção dentro do tema
      const contem = ini >= causa.ini && fim <= causa.fim;             // tema é parte da seleção
      if(contida || contem){
        saida.push({ tema, relacao: contida ? "direta" : "parcial" });
        break;
      }
    }
  }
  return saida;
}
