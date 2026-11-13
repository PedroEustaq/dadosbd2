/* ============================================================
   Configurações, constantes e estado compartilhado
   Os scripts são carregados em ordem pelo index.html e
   compartilham o escopo global (sem etapa de build).
   ============================================================ */

/* Mude a versão ao publicar dados novos: ela entra na URL dos arquivos
   e impede que o navegador misture atualizações diferentes em cache. */
const DATA_VERSION = "2026-11-12";

const PATHS = {
  estados: "dados/geo/estados.geojson",
  municipiosGeo: uf => `dados/geo/municipios/${IBGE_PREFIX_BY_UF[uf]}.geojson`,
  municipios: "dados/referencia/municipios.json",
  cid: "dados/referencia/cid10.json",
  cidSub: letra => `dados/referencia/cid10_sub/${letra}.json`,
  populacao: "dados/populacao/municipios.csv",
  populacaoUF: "dados/populacao/uf.csv",
  idadeMun: uf => `dados/populacao/censo2022_idade/${uf}.csv`,
  idadeUF: "dados/populacao/censo2022_idade_uf.csv",
  simIndice: "dados/saude/sim/indice.json",
  simMun: (ano, uf) => `dados/saude/sim/${ano}/mun/${uf}.csv`,
  simPerfil: (ano, uf) => `dados/saude/sim/${ano}/perfil/${uf}.csv`,
  simUF: ano => `dados/saude/sim/${ano}/uf_cid.csv`,
  simUFPerfil: ano => `dados/saude/sim/${ano}/uf_perfil.csv`,
  simUFMes: ano => `dados/saude/sim/${ano}/uf_mes.csv`,
  sihIndice: "dados/saude/sih/indice.json",
  sih: ano => `dados/saude/sih/${ano}.csv`,
  dengueIndice: "dados/saude/dengue/indice.json",
  dengue: "dados/saude/dengue/casos.csv",
  indicadores: "dados/indicadores/municipios.csv",
  dicionario: "dados/indicadores/dicionario.json",
  situacoes: "dados/indicadores/situacoes.json",
  conhecimento: "dados/conhecimento/base.json",
  manifestos: "dados/manifestos/indice.json",
  cobertura: "dados/relatorios/cobertura.json"
};

const UF_BY_IBGE_PREFIX = {
  "11":"RO","12":"AC","13":"AM","14":"RR","15":"PA","16":"AP","17":"TO",
  "21":"MA","22":"PI","23":"CE","24":"RN","25":"PB","26":"PE","27":"AL","28":"SE","29":"BA",
  "31":"MG","32":"ES","33":"RJ","35":"SP","41":"PR","42":"SC","43":"RS",
  "50":"MS","51":"MT","52":"GO","53":"DF"
};
const IBGE_PREFIX_BY_UF = Object.fromEntries(Object.entries(UF_BY_IBGE_PREFIX).map(([code, uf]) => [uf, code]));
const UF_NAMES = {
  AC:"Acre", AL:"Alagoas", AP:"Amapá", AM:"Amazonas", BA:"Bahia", CE:"Ceará", DF:"Distrito Federal",
  ES:"Espírito Santo", GO:"Goiás", MA:"Maranhão", MT:"Mato Grosso", MS:"Mato Grosso do Sul",
  MG:"Minas Gerais", PA:"Pará", PB:"Paraíba", PR:"Paraná", PE:"Pernambuco", PI:"Piauí",
  RJ:"Rio de Janeiro", RN:"Rio Grande do Norte", RS:"Rio Grande do Sul", RO:"Rondônia", RR:"Roraima",
  SC:"Santa Catarina", SP:"São Paulo", SE:"Sergipe", TO:"Tocantins"
};
const ALL_UFS = Object.keys(UF_NAMES);

/* Tipos de evento: cada um vem de um sistema diferente e NÃO deve ser somado aos outros. */
const EVENTOS = {
  obitos: {
    rotulo: "Óbitos", singular: "óbito", plural: "óbitos", fonte: "SIM / Ministério da Saúde", manifesto: "sim_mortalidade",
    taxa: "Taxa de mortalidade", nivelCid: "categoria",
    explica: "Mortes registradas no Sistema de Informações sobre Mortalidade, contadas no município onde a pessoa morava, pela causa básica do óbito."
  },
  internacoes: {
    rotulo: "Internações no SUS", singular: "internação", plural: "internações", fonte: "SIH/SUS / DATASUS", manifesto: "sih_sus",
    taxa: "Taxa de internações no SUS", nivelCid: "capitulo",
    explica: "Internações pagas pelo SUS, contadas no município onde a pessoa morava. Não inclui planos de saúde nem hospitais particulares e conta internações, não pessoas."
  },
  dengue: {
    rotulo: "Notificações de dengue", singular: "caso provável", plural: "casos prováveis", fonte: "SINAN / Ministério da Saúde", manifesto: "sinan_dengue",
    taxa: "Taxa de notificações de dengue", nivelCid: "fixo",
    explica: "Casos prováveis de dengue notificados (todas as notificações, menos as descartadas), por município de residência. É uma taxa de notificações, não a incidência real: depende da procura por atendimento e da vigilância local."
  }
};

/* Faixas etárias de 5 anos usadas nos arquivos (idade inicial; 80 = 80 anos ou mais). */
const FAIXAS = ["0","5","10","15","20","25","30","35","40","45","50","55","60","65","70","75","80"];
const GRUPOS_IDADE = {
  "": { rotulo: "Todas as idades", faixas: null },
  "0-14": { rotulo: "0 a 14 anos", faixas: ["0","5","10"] },
  "15-39": { rotulo: "15 a 39 anos", faixas: ["15","20","25","30","35"] },
  "40-59": { rotulo: "40 a 59 anos", faixas: ["40","45","50","55"] },
  "60+": { rotulo: "60 anos ou mais", faixas: ["60","65","70","75","80"] }
};

/* Classes de porte populacional usadas para achar municípios comparáveis. */
const PORTES = [
  { max: 5000, rotulo: "até 5 mil habitantes" },
  { max: 10000, rotulo: "5 a 10 mil habitantes" },
  { max: 20000, rotulo: "10 a 20 mil habitantes" },
  { max: 50000, rotulo: "20 a 50 mil habitantes" },
  { max: 100000, rotulo: "50 a 100 mil habitantes" },
  { max: 500000, rotulo: "100 a 500 mil habitantes" },
  { max: Infinity, rotulo: "mais de 500 mil habitantes" }
];

/* A partir deste zoom o mapa troca os estados pelos municípios. */
const MUNICIPALITY_MIN_ZOOM = 6;

/* Mapa: razão entre a taxa do local e a taxa do Brasil no mesmo período.
   Escala fixa (não muda com o zoom nem com os estados carregados), divergente e
   segura para daltonismo (azul–laranja). Cada classe também tem rótulo em texto. */
const MAP_CLASSES = [
  { max: 0.5, cor: "#2c6fb0", rotulo: "menos da metade da taxa do Brasil" },
  { max: 0.8, cor: "#8ab8dc", rotulo: "20% a 50% abaixo" },
  { max: 1.25, cor: "#e9e6df", rotulo: "próxima da taxa do Brasil (−20% a +25%)" },
  { max: 2, cor: "#f0a868", rotulo: "25% a 100% acima" },
  { max: Infinity, cor: "#c8501e", rotulo: "mais que o dobro da taxa do Brasil" }
];
const MAP_COLORS = {
  empty: "#f7f7f5",       // sem dado (população ou evento indisponível)
  unstable: "#cfd4d8",    // poucos eventos: taxa instável
  stateBorder: "#2b3a45",
  municipalityBorder: "#ffffff",
  highlight: "#111c24"
};
/* Abaixo disto a taxa municipal oscila demais para colorir o mapa:
   menos de 5 eventos observados E menos de 5 esperados pela taxa do Brasil. */
const MIN_EVENTOS_MAPA = 5;

/* Seleção atual (sincronizada com a URL). */
const sel = {
  rota: "inicio",
  mun: "",          // código IBGE de 7 dígitos
  causa: "todas",   // "todas" | "cap:9" | "g:I20-I25" | "c:I21"
  evento: "obitos",
  ano: "2024",
  sexo: "",         // "" | "M" | "F"   (só capítulos e total, óbitos)
  idade: "",        // chave de GRUPOS_IDADE
  comparar: [],     // locais na comparação: códigos de município ou siglas de UF
  cid: ""           // item aberto no catálogo
};

const fmtNum = new Intl.NumberFormat("pt-BR");
const fmt1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits:1, maximumFractionDigits:1 });
const fmt2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits:2, maximumFractionDigits:2 });
const fmtPct = new Intl.NumberFormat("pt-BR", { style:"percent", minimumFractionDigits:1, maximumFractionDigits:1 });
const ptCollator = new Intl.Collator("pt-BR");
