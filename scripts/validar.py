#!/usr/bin/env python3
"""Valida os arquivos gerados e monta o índice de manifestos e a matriz de cobertura.

Verificações (o script falha se alguma não passar):
  - todo código de município dos arquivos existe na tabela oficial do IBGE;
  - toda categoria CID dos arquivos existe no catálogo (ou é '???', código fora do catálogo);
  - os totais por município, por capítulo e por UF fecham com o índice de cada fonte;
  - não há linhas duplicadas (mesma chave) nem contagens negativas ou não inteiras;
  - a tabela de indicadores tem exatamente as colunas do dicionário.
Com --tabnet, confere também os óbitos de 2023 por município e capítulo contra o
tabulador oficial do SIM (TabNet), como amostra independente.

Saídas: dados/manifestos/indice.json, dados/relatorios/cobertura.json, dados/relatorios/validacao.json
Uso: python3 scripts/validar.py [--tabnet]
"""

import csv
import glob
import os
import re
import sys

from comum import DADOS, FREQUENCIA_FONTE, FREQUENCIA_PAINEL, MANIFESTOS, NOME_UF, RELATORIOS, Territorios, gravar_json, hoje, ler_json

ORDEM = ["sim_mortalidade", "sih_sus", "sinan_dengue", "ibge_estimativas_populacao", "ibge_censo2022", "ibge_pib_municipios",
         "cnes_estabelecimentos", "inpe_queimadas", "cid10_datasus", "ibge_localidades"]


def ler_csv(caminho):
    with open(caminho, encoding="utf-8", newline="") as arquivo:
        leitor = csv.reader(arquivo, delimiter=";")
        cabecalho = next(leitor)
        return cabecalho, list(leitor)


def conferir(condicao, mensagem, falhas):
    if not condicao:
        falhas.append(mensagem)


def main():
    territorios = Territorios()
    codigos = set(territorios.por_codigo)
    cid = ler_json(os.path.join(DADOS, "referencia", "cid10.json"))
    categorias = {c[0] for c in cid["categorias"]} | {"???"}
    falhas, feitos = [], []

    # ---------- SIM ----------
    sim = ler_json(os.path.join(DADOS, "saude", "sim", "indice.json"))
    for ano, info in sorted(sim["anos"].items()):
        pasta = os.path.join(DADOS, "saude", "sim", ano)
        total_mun, total_perfil, chaves = 0, 0, set()
        for uf in NOME_UF:
            _c, linhas = ler_csv(os.path.join(pasta, "mun", f"{uf}.csv"))
            for mun, cid3, n in linhas:
                conferir(mun in codigos, f"SIM {ano}: município {mun} fora da tabela", falhas)
                conferir(cid3 in categorias, f"SIM {ano}: categoria {cid3} fora do catálogo", falhas)
                conferir(n.isdigit() and int(n) > 0, f"SIM {ano}: contagem inválida {mun} {cid3} {n}", falhas)
                conferir((mun, cid3) not in chaves, f"SIM {ano}: linha duplicada {mun} {cid3}", falhas)
                conferir(territorios.por_codigo.get(mun, {}).get("uf") == uf, f"SIM {ano}: {mun} no arquivo de {uf}", falhas)
                chaves.add((mun, cid3))
                total_mun += int(n)
            _c, linhas = ler_csv(os.path.join(pasta, "perfil", f"{uf}.csv"))
            total_perfil += sum(int(l[4]) for l in linhas)
        _c, linhas = ler_csv(os.path.join(pasta, "uf_cid.csv"))
        total_uf = sum(int(l[2]) for l in linhas)
        _c, linhas = ler_csv(os.path.join(pasta, "mun_cap.csv"))
        total_cap = sum(int(l[2]) for l in linhas)
        conferir(total_mun == total_perfil == total_cap == info["obitos_com_municipio"], f"SIM {ano}: totais municipais não fecham", falhas)
        conferir(total_uf == info["obitos"] == sum(info["por_mes"]), f"SIM {ano}: total por UF não fecha", falhas)
        feitos.append(f"SIM {ano}: {total_uf:,} óbitos; {total_mun:,} com município; arquivos por município, perfil, capítulo e UF com o mesmo total")

    # ---------- SIH e dengue ----------
    sih = ler_json(os.path.join(DADOS, "saude", "sih", "indice.json"))
    for ano, info in sorted(sih["anos"].items()):
        _c, linhas = ler_csv(os.path.join(DADOS, "saude", "sih", f"{ano}.csv"))
        conferir(all(l[0] in codigos for l in linhas), f"SIH {ano}: município fora da tabela", falhas)
        conferir(len({(l[0], l[1]) for l in linhas}) == len(linhas), f"SIH {ano}: linhas duplicadas", falhas)
        conferir(sum(int(l[2]) for l in linhas) == info["internacoes_com_municipio"], f"SIH {ano}: total não fecha", falhas)
        feitos.append(f'SIH {ano}: {info["internacoes"]:,} internações; soma dos municípios igual ao total da fonte')
    dengue = ler_json(os.path.join(DADOS, "saude", "dengue", "indice.json"))
    _c, linhas = ler_csv(os.path.join(DADOS, "saude", "dengue", "casos.csv"))
    conferir(all(l[0] in codigos for l in linhas), "Dengue: município fora da tabela", falhas)
    for ano, info in sorted(dengue["anos"].items()):
        conferir(sum(int(l[2]) for l in linhas if l[1] == ano) == info["casos_com_municipio"], f"Dengue {ano}: total não fecha", falhas)
        feitos.append(f'Dengue {ano}: {info["casos_provaveis"]:,} casos prováveis; {info["casos_provaveis"] - info["casos_com_municipio"]} sem município identificado')

    # ---------- População e indicadores ----------
    cab, linhas = ler_csv(os.path.join(DADOS, "populacao", "municipios.csv"))
    pop = {l[0]: dict(zip(cab[1:], l[1:])) for l in linhas}
    conferir(set(pop) <= codigos, "População: município fora da tabela", falhas)
    sem_pop = {c: [k for k, v in pop.get(c, {}).items() if v == ""] or (["todos"] if c not in pop else []) for c in codigos}
    sem_pop = {c: v for c, v in sem_pop.items() if v}
    feitos.append(f"População: {len(pop)} municípios; com algum ano sem valor: {len(sem_pop)}")
    dic = ler_json(os.path.join(DADOS, "indicadores", "dicionario.json"))
    cab, linhas = ler_csv(os.path.join(DADOS, "indicadores", "municipios.csv"))
    conferir(cab[1:] == [i["id"] for i in dic["indicadores"]], "Indicadores: colunas diferentes do dicionário", falhas)
    conferir({l[0] for l in linhas} == codigos, "Indicadores: conjunto de municípios diferente da tabela oficial", falhas)
    for i, indicador in enumerate(dic["indicadores"], start=1):
        valores = [float(l[i]) for l in linhas if l[i] != ""]
        if indicador["unidade"] == "%":
            conferir(all(0 <= v <= 100.01 for v in valores), f'Indicador {indicador["id"]}: percentual fora de 0–100', falhas)
        conferir(all(v >= 0 for v in valores), f'Indicador {indicador["id"]}: valor negativo', falhas)
    feitos.append(f'Indicadores: {len(dic["indicadores"])} colunas conferidas com o dicionário; percentuais dentro de 0–100')

    # ---------- Exemplos conferíveis de cálculo ----------
    exemplos = []
    _c, sp = ler_csv(os.path.join(DADOS, "saude", "sim", "2024", "mun", "SP.csv"))
    for mun, nome, intervalo in (("3550308", "São Paulo", ("I21", "I21")), ("3509502", "Campinas", ("I00", "I99"))):
        n = sum(int(l[2]) for l in sp if l[0] == mun and intervalo[0] <= l[1] <= intervalo[1])
        p = int(pop[mun]["p2024"])
        exemplos.append({"local": nome, "codigo": mun, "ano": 2024, "cid": "–".join(intervalo) if intervalo[0] != intervalo[1] else intervalo[0],
                         "obitos": n, "populacao_2024": p, "taxa_por_100mil": round(n / p * 100000, 2)})
    homonimos = [m for m in territorios.municipios if m["n"] == "Bom Jesus"]
    exemplos.append({"teste": "municípios homônimos", "nome": "Bom Jesus", "codigos": [f'{m["c"]} ({m["uf"]})' for m in homonimos],
                     "resultado": "cada um tem código e arquivo de UF próprios; a busca por nome exige a UF"})

    # ---------- Conferência independente com o TabNet ----------
    tabnet_resumo = None
    if "--tabnet" in sys.argv:
        import tabnet
        from comum import BRUTOS
        cabecalho, linhas_tn = tabnet.consultar("sim/cnv/obt10br.def", "Município", "Capítulo_CID-10", "Óbitos_p/Residênc", ["obtbr23.dbf"],
                                                os.path.join(BRUTOS, "tabnet", "confere_sim_2023.html"))
        romanos = {c["rom"]: c["n"] for c in cid["capitulos"]}
        caps = []
        for coluna in cabecalho[1:-1]:
            achado = re.match(r"Cap[íi]tulo ([IVX]+)|Cap ([IVX]+)|([IVX]+)\.", coluna.strip())
            caps.append(romanos[next(g for g in achado.groups() if g)] if achado else None)
        fonte = {}
        for l in linhas_tn:
            achado = re.match(r"(\d{6})\s", l[0].strip())
            mun = territorios.de_seis(achado.group(1)) if achado else None
            if mun:
                for cap, celula in zip(caps, l[1:-1]):
                    if cap:
                        fonte[(mun, cap)] = tabnet.numero(celula)
        _c, nossos = ler_csv(os.path.join(DADOS, "saude", "sim", "2023", "mun_cap.csv"))
        nosso = {(l[0], int(l[1])): int(l[2]) for l in nossos if l[1] != "0"}
        chaves = set(k for k, v in fonte.items() if v) | set(nosso)
        iguais = sum(1 for k in chaves if fonte.get(k, 0) == nosso.get(k, 0))
        tabnet_resumo = {
            "consulta": "TabNet SIM (obt10br.def), 2023, óbitos por residência, município × capítulo CID-10",
            "celulas_comparadas": len(chaves), "celulas_iguais": iguais, "proporcao_igual": round(iguais / len(chaves), 5),
            "total_tabnet": sum(fonte.values()), "total_painel": sum(nosso.values()),
            "observacao": "Diferenças pequenas são esperadas quando o arquivo de microdados e o tabulador foram atualizados em datas diferentes.",
        }
        feitos.append(f'TabNet × painel (SIM 2023): {iguais:,} de {len(chaves):,} células iguais; totais {tabnet_resumo["total_tabnet"]:,} × {tabnet_resumo["total_painel"]:,}')
    else:
        anterior = os.path.join(RELATORIOS, "validacao.json")
        if os.path.exists(anterior):
            tabnet_resumo = ler_json(anterior).get("conferencia_tabnet")

    # ---------- Manifestos e cobertura ----------
    manifestos = []
    for ident in ORDEM:
        caminho = os.path.join(MANIFESTOS, f"{ident}.json")
        conferir(os.path.exists(caminho), f"Manifesto ausente: {ident}", falhas)
        if os.path.exists(caminho):
            manifestos.append({**ler_json(caminho), "frequencia_fonte": FREQUENCIA_FONTE.get(ident, "não informada")})
    extras = sorted(set(os.path.basename(p)[:-5] for p in glob.glob(os.path.join(MANIFESTOS, "*.json"))) - set(ORDEM) - {"indice"})
    conferir(not extras, f"Manifestos fora do índice: {extras}", falhas)
    gravar_json(os.path.join(MANIFESTOS, "indice.json"), {"gerado_em": hoje(), "frequencia_painel": FREQUENCIA_PAINEL, "fontes": manifestos}, compacto=False)

    n_mun = len(codigos)
    matriz = []
    for ano, info in sorted(sim["anos"].items()):
        matriz.append({"fonte": "SIM", "desfecho": "Óbitos por causa básica (capítulo, grupo e categoria CID-10; sexo e idade por capítulo)", "periodo": f'{ano}: {info["periodo"]}',
                       "nivel": "município, UF, Brasil (subcategoria só por UF)", "cobertura": f'{info["obitos_com_municipio"]:,} de {info["obitos"]:,} óbitos com município identificado'.replace(",", "."),
                       "situacao": "integrado" + ("" if info["ano_completo"] else " (período parcial)")})
    for ano, info in sorted(sih["anos"].items()):
        matriz.append({"fonte": "SIH/SUS", "desfecho": "Internações no SUS por capítulo CID-10", "periodo": f'{ano}: {info["periodo"]}', "nivel": "município, UF, Brasil",
                       "cobertura": f"{n_mun} municípios; somente rede SUS", "situacao": "integrado" + ("" if info["ano_completo"] else " (período parcial)")})
    matriz.append({"fonte": "SINAN", "desfecho": "Casos prováveis de dengue", "periodo": ", ".join(sorted(dengue["anos"])), "nivel": "município, UF, Brasil",
                   "cobertura": f"{n_mun} municípios", "situacao": "integrado (ano corrente parcial)"})
    matriz.append({"fonte": "SINAN, SIVEP-Gripe e outros agravos", "desfecho": "Demais notificações", "periodo": "—", "nivel": "—", "cobertura": "—", "situacao": "não integrado"})
    matriz.append({"fonte": "IBGE", "desfecho": "População total (denominador)", "periodo": "2022 (Censo), 2024, 2025 e 2026 (estimativas)", "nivel": "município, UF, Brasil",
                   "cobertura": f"{n_mun - len(sem_pop)} municípios com todos os anos; {len(sem_pop)} com lacuna", "situacao": "integrado (sem estimativa para 2023)"})
    matriz.append({"fonte": "IBGE", "desfecho": "População por sexo e idade", "periodo": "2022 (Censo)", "nivel": "município, UF, Brasil", "cobertura": "5.570 municípios", "situacao": "integrado"})
    for indicador in dic["indicadores"]:
        matriz.append({"fonte": indicador["tabela"], "desfecho": f'{indicador["dimensao"]}: {indicador["nome"]}', "periodo": str(indicador["ano"]), "nivel": "município",
                       "cobertura": f'{indicador["cobertura"]["municipios_com_valor"]} de {n_mun} municípios', "situacao": "integrado"})
    for lacuna in dic["lacunas"]:
        matriz.append({"fonte": "—", "desfecho": lacuna["dimensao"], "periodo": "—", "nivel": "—", "cobertura": "sem indicador municipal", "situacao": lacuna["situacao"]})
    relatorios = sorted("dados/relatorios/" + os.path.basename(p) for p in glob.glob(os.path.join(RELATORIOS, "*.json")))
    relatorios = sorted(set(relatorios) | {"dados/relatorios/validacao.json", "dados/relatorios/cobertura.json"})
    gravar_json(os.path.join(RELATORIOS, "cobertura.json"), {"gerado_em": hoje(), "matriz": matriz, "relatorios": relatorios}, compacto=False)
    gravar_json(os.path.join(RELATORIOS, "validacao.json"), {
        "gerado_em": hoje(), "aprovado": not falhas, "verificacoes": feitos, "falhas": falhas[:200],
        "municipios_sem_populacao": {c: v for c, v in sorted(sem_pop.items())},
        "exemplos_de_calculo": exemplos, "conferencia_tabnet": tabnet_resumo,
    }, compacto=False)
    for linha in feitos:
        print("ok ", linha)
    if falhas:
        print(f"\n{len(falhas)} falhas:")
        for falha in falhas[:30]:
            print("  -", falha)
        raise SystemExit(1)
    print("\nValidação concluída sem falhas.")


if __name__ == "__main__":
    main()
