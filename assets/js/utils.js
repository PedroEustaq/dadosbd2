/* ============================================================
   Utilidades gerais
   ============================================================ */
const $ = id => document.getElementById(id);

/* Todo texto vindo de arquivos passa por aqui antes de entrar no HTML. */
function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
}
const h = escapeHtml;

/* Só aceita endereços http(s) em links vindos dos dados. */
function urlSegura(url){
  return /^https?:\/\//i.test(String(url || "")) ? String(url) : "#";
}

function setStatus(message, phase = "loading"){
  const status = $("status");
  if(!status) return;
  status.textContent = message;
  status.dataset.state = phase;
  status.hidden = !message;
}

function normText(s){
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function plural(count, singular, pluralForm = `${singular}s`){
  return count === 1 ? singular : pluralForm;
}

function fmtValor(valor, casas = 1){
  if(valor == null || !Number.isFinite(valor)) return "—";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits:casas, maximumFractionDigits:casas }).format(valor);
}

/* ---------- Carregamento com cache (uma requisição por arquivo) ---------- */
const _cache = new Map();

function comVersao(url){
  return `${url}?v=${DATA_VERSION}`;
}

function carregar(url, tipo){
  const chave = `${tipo}:${url}`;
  if(!_cache.has(chave)){
    const promessa = fetch(comVersao(url)).then(async resposta => {
      if(!resposta.ok) throw new Error(`${url} indisponível (HTTP ${resposta.status})`);
      return tipo === "json" ? resposta.json() : parseCSV(await resposta.text());
    });
    promessa.catch(() => _cache.delete(chave));   // permite tentar de novo depois de uma falha
    _cache.set(chave, promessa);
  }
  return _cache.get(chave);
}
const fetchJSON = url => carregar(url, "json");
const fetchCSV = url => carregar(url, "csv");

/* CSV simples com ';' (os arquivos são gerados pelos scripts, sem aspas). */
function parseCSV(texto){
  const linhas = texto.split("\n");
  const cabecalho = linhas[0].trim().split(";");
  const registros = [];
  for(let i = 1; i < linhas.length; i++){
    if(linhas[i]) registros.push(linhas[i].split(";"));
  }
  return { cabecalho, registros };
}

/* ---------- Estatística ---------- */
/* Intervalo de 95% para uma contagem de Poisson (aproximação de Byar),
   usado para a razão observado/esperado. Breslow & Day, 1987. */
function intervaloPoisson(observado){
  const z = 1.96;
  const inferior = observado === 0 ? 0
    : observado * Math.pow(1 - 1 / (9 * observado) - z / (3 * Math.sqrt(observado)), 3);
  const o1 = observado + 1;
  const superior = o1 * Math.pow(1 - 1 / (9 * o1) + z / (3 * Math.sqrt(o1)), 3);
  return [Math.max(0, inferior), superior];
}

function quantil(ordenados, q){
  if(!ordenados.length) return null;
  const pos = (ordenados.length - 1) * q;
  const base = Math.floor(pos);
  const resto = pos - base;
  return ordenados[base + 1] !== undefined
    ? ordenados[base] + resto * (ordenados[base + 1] - ordenados[base])
    : ordenados[base];
}

/* Posição percentual de um valor entre os valores do grupo (0 a 100). */
function percentil(valores, valor){
  if(!valores.length) return null;
  let abaixo = 0, iguais = 0;
  for(const v of valores){
    if(v < valor) abaixo++;
    else if(v === valor) iguais++;
  }
  return 100 * (abaixo + iguais / 2) / valores.length;
}

function postos(valores){
  const ordem = valores.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(valores.length);
  let i = 0;
  while(i < ordem.length){
    let j = i;
    while(j + 1 < ordem.length && ordem[j + 1][0] === ordem[i][0]) j++;
    const medio = (i + j) / 2 + 1;
    for(let k = i; k <= j; k++) r[ordem[k][1]] = medio;
    i = j + 1;
  }
  return r;
}

/* Correlação de postos de Spearman com intervalo de 95% (transformação de Fisher). */
function spearman(xs, ys){
  const n = xs.length;
  if(n < 3) return null;
  const rx = postos(xs), ry = postos(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / n, my = ry.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for(let i = 0; i < n; i++){
    sxy += (rx[i] - mx) * (ry[i] - my);
    sxx += (rx[i] - mx) ** 2;
    syy += (ry[i] - my) ** 2;
  }
  if(!sxx || !syy) return null;
  const rho = sxy / Math.sqrt(sxx * syy);
  const z = Math.atanh(Math.max(-0.999999, Math.min(0.999999, rho)));
  const ep = 1.03 / Math.sqrt(n - 3);
  return { rho, n, ic: [Math.tanh(z - 1.96 * ep), Math.tanh(z + 1.96 * ep)] };
}

/* ---------- Exportação ---------- */
function baixarCSV(nome, linhas, notas = []){
  const celula = v => {
    const s = String(v ?? "");
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const corpo = [...notas.map(n => `# ${n}`), ...linhas.map(l => l.map(celula).join(";"))].join("\r\n");
  const blob = new Blob(["﻿" + corpo], { type:"text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function debounce(fn, ms = 150){
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
