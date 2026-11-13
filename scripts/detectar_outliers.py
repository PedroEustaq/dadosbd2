#!/usr/bin/env python3
"""Detecta e classifica valores atípicos (outliers) na base gerada.

Três verificações, cada uma com regra e decisão explícitas:

1. Valores impossíveis (erro de dado): contagem negativa, população zero ou negativa,
   mais eventos do que habitantes (óbitos e dengue), percentual fora de 0–100.
   Decisão: o valor seria removido (vira "indisponível"); a validação falha se existir.

2. Taxas atípicas por município (óbitos, internações no SUS e notificações de dengue,
   todas as causas, anos completos):
   a) Tukey sobre o log10 da taxa, só com municípios que teriam ao menos 10 eventos
      esperados pela taxa do Brasil (abaixo disso a taxa oscila por acaso e não é
      comparável). Atípico moderado: fora de Q1 − 1,5·IQR e Q3 + 1,5·IQR; extremo: 3·IQR.
   b) Gráfico de funil (Poisson): esperado = taxa do Brasil × população; o município é
      sinalizado quando o observado sai do limite de 99,8% (|z| > 3,09), com os limites
      alargados pela sobredispersão estimada (Spiegelhalter, 2005). Leva em conta o
      tamanho da população e não depende de distribuição simétrica.
   Decisão: os valores são MANTIDOS. São registros oficiais e plausíveis (diferenças
   reais de idade, acesso e notificação), e o painel já protege a leitura: intervalo de
   95%, aviso com menos de 10 eventos, mapa em cinza com menos de 5 e listas que
   excluem taxas instáveis. A lista serve para revisão e para a tabela `outlier` do MySQL.

3. Indicadores do território: Tukey 3·IQR (extremos) em cada indicador; variação da
   população entre o Censo 2022 e a estimativa de 2024 fora de −33% a +50%.
   Decisão: MANTIDOS e sinalizados (há municípios realmente extremos, como os de
   grande área e baixa densidade).

Saídas: dados/relatorios/outliers.json (resumo e exemplos) e
        dados/relatorios/outliers.csv (todos os casos sinalizados).
Uso: python3 scripts/detectar_outliers.py
"""

import csv
import math
import os

from comum import DADOS, RELATORIOS, Territorios, gravar_csv, gravar_relatorio, ler_json

Z_FUNIL = 3.09            # limite bilateral de 99,8%
MIN_ESPERADO = 10         # eventos esperados mínimos para entrar no Tukey


def ler(caminho):
    with open(caminho, encoding="utf-8", newline="") as arquivo:
        return list(csv.DictReader(arquivo, delimiter=";"))


def quartis(valores):
    v = sorted(valores)
    def q(p):
        pos = (len(v) - 1) * p
        i = int(pos)
        return v[i] if i + 1 >= len(v) else v[i] + (v[i + 1] - v[i]) * (pos - i)
    return q(0.25), q(0.5), q(0.75)


def populacao_do_ano(pop, ano):
    """Mesma regra do painel: estimativa do ano; para 2023, Censo 2022."""
    return pop.get(f"p{ano}") or (pop.get("p2022") if ano == "2023" else None)


def main():
    terr = Territorios()
    nomes = {m["c"]: (m["n"], m["uf"]) for m in ler_json(os.path.join(DADOS, "referencia", "municipios.json"))["municipios"]}
    pops = {}
    for linha in ler(os.path.join(DADOS, "populacao", "municipios.csv")):
        pops[linha["mun"]] = {k: (int(v) if v else None) for k, v in linha.items() if k != "mun"}
    pop_br = {k: int(v) for k, v in ler(os.path.join(DADOS, "populacao", "uf.csv"))[0].items() if k != "uf" and v}

    casos = []          # linhas do CSV de saída
    resumo = {"invalidos": {}, "taxas": [], "indicadores": [], "populacao": {}}

    # ---------- Contagens por município, ano e evento (todas as causas) ----------
    eventos = {}
    sim = ler_json(os.path.join(DADOS, "saude", "sim", "indice.json"))["anos"]
    sih = ler_json(os.path.join(DADOS, "saude", "sih", "indice.json"))["anos"]
    den = ler_json(os.path.join(DADOS, "saude", "dengue", "indice.json"))["anos"]
    ultimo_dengue = max(den)
    for ano, info in sim.items():
        if not info["ano_completo"]:
            continue
        cont = {}
        for l in ler(os.path.join(DADOS, "saude", "sim", ano, "mun_cap.csv")):
            cont[l["mun"]] = cont.get(l["mun"], 0) + int(l["n"])
        eventos[("obitos", ano)] = cont
    for ano, info in sih.items():
        if not info["ano_completo"]:
            continue
        cont = {}
        for l in ler(os.path.join(DADOS, "saude", "sih", f"{ano}.csv")):
            cont[l["mun"]] = cont.get(l["mun"], 0) + int(l["n"])
        eventos[("internacoes", ano)] = cont
    dengue = {}
    for l in ler(os.path.join(DADOS, "saude", "dengue", "casos.csv")):
        if l["ano"] != ultimo_dengue:          # ano corrente é parcial
            dengue.setdefault(l["ano"], {})[l["mun"]] = int(l["n"])
    for ano, cont in dengue.items():
        eventos[("dengue", ano)] = cont

    # ---------- 1. Valores impossíveis ----------
    invalidos = {"contagem_negativa": 0, "populacao_nao_positiva": 0, "eventos_maiores_que_populacao": 0}
    for (evento, ano), cont in eventos.items():
        for mun, n in cont.items():
            p = populacao_do_ano(pops.get(mun, {}), ano)
            if n < 0:
                invalidos["contagem_negativa"] += 1
                casos.append(["invalido", evento, ano, mun, n, "", "", "contagem negativa", "remover"])
            if p is not None and p <= 0:
                invalidos["populacao_nao_positiva"] += 1
            if p and evento != "internacoes" and n > p:
                invalidos["eventos_maiores_que_populacao"] += 1
                casos.append(["invalido", evento, ano, mun, n, "", p, "mais eventos que habitantes", "remover"])
    resumo["invalidos"] = invalidos

    # ---------- 2. Taxas atípicas ----------
    for (evento, ano), cont in sorted(eventos.items()):
        total = sum(cont.values())
        pbr = pop_br.get(f"p{ano}") or (pop_br.get("p2022") if ano == "2023" else None)
        taxa_br = total / pbr
        linhas = []
        for mun in nomes:
            p = populacao_do_ano(pops.get(mun, {}), ano)
            if not p:
                continue
            n = cont.get(mun, 0)
            esperado = taxa_br * p
            linhas.append((mun, n, p, esperado, n / p * 1e5))
        elegiveis = [l for l in linhas if l[3] >= MIN_ESPERADO and l[1] > 0]
        logs = [math.log10(l[4]) for l in elegiveis]
        q1, med, q3 = quartis(logs)
        iqr = q3 - q1
        lim = {"moderado": (q1 - 1.5 * iqr, q3 + 1.5 * iqr), "extremo": (q1 - 3 * iqr, q3 + 3 * iqr)}
        tukey = {"moderado": 0, "extremo": 0}
        for mun, n, p, esp, tx in elegiveis:
            lt = math.log10(tx)
            nivel = "extremo" if not lim["extremo"][0] <= lt <= lim["extremo"][1] else "moderado" if not lim["moderado"][0] <= lt <= lim["moderado"][1] else ""
            if nivel:
                tukey[nivel] += 1
                casos.append(["taxa_tukey_" + nivel, evento, ano, mun, round(tx, 2),
                              round(10 ** lim[nivel][0], 2), round(10 ** lim[nivel][1], 2), "Tukey sobre log10 da taxa por 100 mil", "manter e sinalizar"])
        # Sobredispersão (Spiegelhalter, 2005): as taxas variam entre municípios muito mais do
        # que o acaso de Poisson explica. phi = média dos z² winsorizados a 10%; os limites
        # do funil são alargados por raiz(phi). Sem isso, milhares seriam "atípicos".
        zs = sorted((n - esp) / math.sqrt(esp) for _, n, _, esp, _ in linhas if esp > 0)
        k = len(zs) // 10
        baixo, alto = zs[k], zs[-k - 1]
        phi = max(1.0, sum(min(max(z, baixo), alto) ** 2 for z in zs) / len(zs))
        fator = math.sqrt(phi)
        funil = {"acima": 0, "abaixo": 0}
        exemplos = []
        for mun, n, p, esp, tx in linhas:
            if esp <= 0:
                continue
            z = (n - esp) / math.sqrt(esp) / fator
            if abs(z) > Z_FUNIL:
                lado = "acima" if z > 0 else "abaixo"
                funil[lado] += 1
                meia = Z_FUNIL * fator * math.sqrt(esp)
                casos.append(["taxa_funil_" + lado, evento, ano, mun, round(tx, 2),
                              round(max(0, esp - meia) / p * 1e5, 2), round((esp + meia) / p * 1e5, 2),
                              "funil de Poisson 99,8% com correção de sobredispersão", "manter e sinalizar"])
                exemplos.append((z, mun, n, round(esp, 1), round(tx, 1)))
        exemplos.sort(reverse=True)
        resumo["taxas"].append({
            "evento": evento, "ano": ano, "taxa_brasil": round(taxa_br * 1e5, 2),
            "municipios_com_populacao": len(linhas), "elegiveis_tukey": len(elegiveis),
            "tukey_log10": {"q1": round(10 ** q1, 2), "mediana": round(10 ** med, 2), "q3": round(10 ** q3, 2),
                            "limites_moderado": [round(10 ** x, 2) for x in lim["moderado"]],
                            "limites_extremo": [round(10 ** x, 2) for x in lim["extremo"]], **tukey},
            "sobredispersao_phi": round(phi, 1),
            "funil_998": funil,
            "maiores_excessos": [{"municipio": f"{nomes[m][0]} ({nomes[m][1]})", "codigo": m, "observado": n, "esperado": e, "taxa": t}
                                 for _, m, n, e, t in exemplos[:5]]
        })

    # ---------- 3. Indicadores e população ----------
    dic = ler_json(os.path.join(DADOS, "indicadores", "dicionario.json"))
    ind = ler(os.path.join(DADOS, "indicadores", "municipios.csv"))
    for d in dic["indicadores"]:
        vals = [(l["mun"], float(l[d["id"]])) for l in ind if l[d["id"]] not in ("", None)]
        nulos = len(ind) - len(vals)
        fora = 0
        if d["unidade"] == "%":
            fora = sum(1 for _, v in vals if not 0 <= v <= 100)
        q1, med, q3 = quartis([v for _, v in vals])
        iqr = q3 - q1
        li, ls = q1 - 3 * iqr, q3 + 3 * iqr
        extremos = [(m, v) for m, v in vals if (v < li or v > ls) and iqr > 0]
        for m, v in extremos:
            casos.append(["indicador_extremo", d["id"], d["ano"], m, v, round(li, 3), round(ls, 3), "Tukey 3×IQR", "manter e sinalizar"])
        resumo["indicadores"].append({"id": d["id"], "nome": d["nome"], "com_valor": len(vals), "sem_valor": nulos,
                                      "fora_da_faixa_valida": fora, "extremos_3iqr": len(extremos),
                                      "limites": [round(li, 3), round(ls, 3)], "mediana": round(med, 3)})
        if fora:
            invalidos[f"percentual_fora_0_100_{d['id']}"] = fora

    saltos = []
    for mun, p in pops.items():
        if p.get("p2022") and p.get("p2024"):
            r = p["p2024"] / p["p2022"]
            if not 2 / 3 <= r <= 1.5:
                saltos.append((mun, r))
                casos.append(["populacao_salto", "populacao", "2022-2024", mun, round(r, 3), 0.667, 1.5,
                              "razão estimativa 2024 / Censo 2022", "manter e sinalizar"])
    sem_pop = [m for m, p in pops.items() if not all(p.values())]
    resumo["populacao"] = {"municipios": len(pops), "com_ano_sem_valor": len(sem_pop), "saltos_2022_2024": len(saltos),
                           "exemplos_saltos": [{"municipio": f"{nomes[m][0]} ({nomes[m][1]})", "razao": round(r, 3)} for m, r in sorted(saltos, key=lambda x: -abs(math.log(x[1])))[:5]]}

    # Persistência: municípios acima do esperado (funil) em TODOS os anos completos de um evento.
    # Um excesso que se repete não é acaso de um ano: é o achado que pede investigação.
    persistentes = {}
    for evento in sorted({e for e, _ in eventos}):
        anos = sorted(a for e, a in eventos if e == evento)
        por_mun = {}
        for c in casos:
            if c[0] == "taxa_funil_acima" and c[1] == evento:
                por_mun.setdefault(c[3], set()).add(c[2])
        lista = sorted(m for m, a in por_mun.items() if len(a) == len(anos))
        persistentes[evento] = {"anos": anos, "municipios": len(lista),
                                "exemplos": [f"{nomes[m][0]} ({nomes[m][1]})" for m in lista[:8]]}
    resumo["acima_em_todos_os_anos"] = persistentes

    gravar_csv(os.path.join(RELATORIOS, "outliers.csv"),
               ["tipo", "medida", "ano", "codigo_ibge", "valor", "limite_inferior", "limite_superior", "metodo", "decisao"], casos)
    gravar_relatorio("outliers", {
        "regras": {
            "invalidos": "contagem negativa, população ≤ 0, óbitos ou casos de dengue maiores que a população, percentual fora de 0–100: removidos (a validação falha se existirem)",
            "taxa_tukey": f"log10 da taxa; só municípios com ≥ {MIN_ESPERADO} eventos esperados; moderado 1,5·IQR, extremo 3·IQR: mantidos e sinalizados",
            "taxa_funil": "Poisson, esperado = taxa do Brasil × população, limite de 99,8% (|z| > 3,09) alargado pela sobredispersão (phi, Spiegelhalter 2005): mantidos e sinalizados",
            "indicadores": "Tukey 3·IQR por indicador: mantidos e sinalizados",
            "populacao": "razão estimativa 2024 / Censo 2022 fora de 0,667–1,5: mantida e sinalizada"
        },
        **resumo,
        "total_sinalizados": len(casos)
    })
    print(f"{len(casos)} casos sinalizados; inválidos: {sum(invalidos.values())}")
    for t in resumo["taxas"]:
        print(f"  {t['evento']} {t['ano']}: Tukey moderado {t['tukey_log10']['moderado']}, extremo {t['tukey_log10']['extremo']}; funil acima {t['funil_998']['acima']}, abaixo {t['funil_998']['abaixo']}")
    if sum(invalidos.values()):
        raise SystemExit("Há valores impossíveis na base: corrija antes de publicar.")


if __name__ == "__main__":
    main()
