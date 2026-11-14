"""Gera dados/relatorios/apresentacao.json: os números da página de apresentação.

Fase 4 do projeto (EDA): responde às perguntas de negócio a partir da camada
Ouro (arquivos agregados em dados/). Somente biblioteca padrão.

Uso: python3 scripts/montar_apresentacao.py
"""

import csv
import json
import os
import statistics

from comum import DADOS, RELATORIOS, NOME_UF, UF_POR_PREFIXO

ANO = "2024"  # último ano completo do SIM
MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]


def ler_csv(caminho):
    with open(caminho, encoding="utf-8") as f:
        return list(csv.DictReader(f, delimiter=";"))


def ler_json(caminho):
    with open(caminho, encoding="utf-8") as f:
        return json.load(f)


def main():
    cid = ler_json(os.path.join(DADOS, "referencia", "cid10.json"))
    nome_cap = {str(c["n"]): c["nome"] for c in cid["capitulos"]}

    pop_uf = {l["uf"]: int(l[f"p{ANO}"]) for l in ler_csv(os.path.join(DADOS, "populacao", "uf.csv"))}
    pop_mun = {}
    for l in ler_csv(os.path.join(DADOS, "populacao", "municipios.csv")):
        if l[f"p{ANO}"]:
            pop_mun[l["mun"]] = int(l[f"p{ANO}"])

    # Pergunta 1: principais causas de óbito no Brasil (capítulos da CID-10)
    por_cap = {}
    for l in ler_csv(os.path.join(DADOS, "saude", "sim", ANO, "uf_mes.csv")):
        por_cap[l["cap"]] = por_cap.get(l["cap"], 0) + int(l["n"])
    total_obitos = sum(por_cap.values())
    causas = sorted(por_cap.items(), key=lambda kv: -kv[1])[:6]
    p1 = [{"nome": nome_cap.get(c, c), "n": n, "pct": round(100 * n / total_obitos, 1)} for c, n in causas]

    # Pergunta 2: óbitos por mês (sazonalidade)
    por_mes = [0] * 12
    for l in ler_csv(os.path.join(DADOS, "saude", "sim", ANO, "uf_mes.csv")):
        por_mes[int(l["mes"]) - 1] += int(l["n"])
    p2 = [{"mes": MESES[i], "n": n} for i, n in enumerate(por_mes)]

    # Pergunta 3: taxa de mortalidade por estado
    por_uf = {}
    for l in ler_csv(os.path.join(DADOS, "saude", "sim", ANO, "uf_mes.csv")):
        por_uf[l["uf"]] = por_uf.get(l["uf"], 0) + int(l["n"])
    p3 = sorted(
        ({"uf": uf, "nome": NOME_UF[uf], "taxa": round(n / pop_uf[uf] * 1e5, 1)} for uf, n in por_uf.items() if uf in pop_uf),
        key=lambda x: -x["taxa"],
    )

    # Pergunta 4: dengue ano a ano
    dengue_idx = ler_json(os.path.join(DADOS, "saude", "dengue", "indice.json"))
    sim_idx = ler_json(os.path.join(DADOS, "saude", "sim", "indice.json"))
    p4 = []
    for ano, info in sorted(dengue_idx["anos"].items()):
        p4.append({"ano": ano, "n": info["casos_provaveis"], "parcial": not sim_idx["anos"].get(ano, {}).get("ano_completo", True)})

    # Pergunta 5: saneamento × internações por doenças infecciosas (capítulo I, SIH/SUS)
    infecciosas = {}
    for l in ler_csv(os.path.join(DADOS, "saude", "sih", f"{ANO}.csv")):
        if l["cap"] == "1":
            infecciosas[l["mun"]] = int(l["n"])
    linhas = []
    for l in ler_csv(os.path.join(DADOS, "indicadores", "municipios.csv")):
        if l["esgoto_precario"] and l["mun"] in pop_mun:
            linhas.append((float(l["esgoto_precario"]), infecciosas.get(l["mun"], 0), pop_mun[l["mun"]]))
    linhas.sort()
    q = len(linhas) // 4
    faixas = [linhas[:q], linhas[q:2 * q], linhas[2 * q:3 * q], linhas[3 * q:]]
    rotulos = ["25% com melhor esgoto", "2º quarto", "3º quarto", "25% com pior esgoto"]
    p5 = []
    for rot, fx in zip(rotulos, faixas):
        internacoes = sum(o for _, o, _ in fx)
        pop = sum(p for _, _, p in fx)
        p5.append({
            "faixa": rot,
            "esgoto_precario_mediana": round(statistics.median(e for e, _, _ in fx), 1),
            "municipios": len(fx),
            "taxa": round(internacoes / pop * 1e5, 1),
        })

    # Números da pipeline e da qualidade
    validacao = ler_json(os.path.join(RELATORIOS, "validacao.json"))
    outliers = ler_json(os.path.join(RELATORIOS, "outliers.json"))
    sih_idx = ler_json(os.path.join(DADOS, "saude", "sih", "indice.json"))
    sih_total = sum(a.get("internacoes", 0) for a in sih_idx.get("anos", {}).values())
    sim_total = sum(a["obitos"] for a in sim_idx["anos"].values())
    dengue_total = sum(a["casos_provaveis"] for a in dengue_idx["anos"].values())

    saida = {
        "ano": ANO,
        "volume": {
            "obitos": sim_total,
            "internacoes": sih_total,
            "dengue": dengue_total,
            "municipios": len(ler_json(os.path.join(DADOS, "referencia", "municipios.json"))["municipios"]),
            "categorias_cid": len(cid["categorias"]),
        },
        "qualidade": {
            "aprovado": validacao.get("aprovado"),
            "verificacoes": len(validacao.get("verificacoes", [])),
            "invalidos": sum(outliers["invalidos"].values()),
            "sinalizados": outliers.get("total_sinalizados"),
        },
        "obitos_brasil": total_obitos,
        "taxa_brasil": round(total_obitos / pop_uf["BR"] * 1e5, 1),
        "p1_causas": p1,
        "p2_meses": p2,
        "p3_ufs": p3,
        "p4_dengue": p4,
        "p5_esgoto": p5,
    }
    destino = os.path.join(RELATORIOS, "apresentacao.json")
    with open(destino, "w", encoding="utf-8") as f:
        json.dump(saida, f, ensure_ascii=False, indent=1)
    print(f"gravado {destino}")
    print(json.dumps({k: saida[k] for k in ("volume", "qualidade", "taxa_brasil")}, ensure_ascii=False))
    print("p1", [(c["nome"][:30], c["pct"]) for c in p1])
    print("p2", por_mes)
    print("p3", [(u["uf"], u["taxa"]) for u in p3[:3]], "...", [(u["uf"], u["taxa"]) for u in p3[-3:]])
    print("p4", p4)
    print("p5", p5)


if __name__ == "__main__":
    main()
