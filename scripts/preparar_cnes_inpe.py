#!/usr/bin/env python3
"""Indicadores de acesso à saúde (CNES) e de ambiente (focos de queimada do INPE).

CNES — cadastro de estabelecimentos (dados abertos do Ministério da Saúde):
  conta estabelecimentos ativos (sem motivo de desabilitação) por município e tipo.
INPE — Programa Queimadas, focos do satélite de referência (AQUA, passagem da tarde):
  conta focos por município no ano. O município vem por nome + UF e é resolvido
  pela tabela oficial do IBGE, sem aproximação; o que não resolve vai ao relatório.

Saída: dados/brutos/partes/cnes.json e inpe.json (para montar_indicadores.py)
       dados/relatorios/cnes_inpe.json

Uso: python3 scripts/preparar_cnes_inpe.py [--refazer]
"""

import collections
import csv
import io
import os
import sys
import zipfile

from comum import (BRUTOS, DADOS, NOME_UF, Territorios, baixar, gravar_json, gravar_manifesto, gravar_relatorio,
                   normalizar)

REFAZER = "--refazer" in sys.argv
URL_CNES = "https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/CNES/cnes_estabelecimentos.zip"
ANO_INPE = 2025
URL_INPE = f"https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/anual/Brasil_todos_sats/focos_br_todos-sats_{ANO_INPE}.zip"
SATELITE_REFERENCIA = "AQUA_M-T"
# Tipos de unidade do CNES usados (tabela de domínio TP_UNIDADE do CNES).
UBS = {"1", "2"}            # posto de saúde; centro de saúde / unidade básica
HOSPITAIS = {"5", "7", "15"}  # hospital geral; hospital especializado; unidade mista
URGENCIA = {"20", "21", "73"}  # pronto-socorro geral e especializado; pronto atendimento


def ler_populacao(coluna):
    pop = {}
    with open(os.path.join(DADOS, "populacao", "municipios.csv"), encoding="utf-8", newline="") as arquivo:
        for linha in csv.DictReader(arquivo, delimiter=";"):
            if linha[coluna]:
                pop[linha["mun"]] = int(linha[coluna])
    return pop


def ler_populacao_uf(coluna):
    with open(os.path.join(DADOS, "populacao", "uf.csv"), encoding="utf-8", newline="") as arquivo:
        return {l["uf"]: int(l[coluna]) for l in csv.DictReader(arquivo, delimiter=";") if l[coluna]}


def cnes(territorios, relatorio):
    bruto = baixar(URL_CNES, os.path.join(BRUTOS, "cnes", "cnes_estabelecimentos.zip"), refazer=REFAZER, timeout=900)
    contagem = {"ubs": collections.Counter(), "hosp": collections.Counter(), "urg": collections.Counter()}
    r = collections.Counter()
    nao_resolvidos = collections.Counter()
    with zipfile.ZipFile(bruto) as z:
        info = z.infolist()[0]
        data_arquivo = "%04d-%02d-%02d" % info.date_time[:3]
        leitor = csv.DictReader(io.TextIOWrapper(z.open(info), encoding="latin1", newline=""), delimiter=";")
        for campo in ("CO_IBGE", "TP_UNIDADE", "CO_MOTIVO_DESAB"):
            if campo not in leitor.fieldnames:
                raise RuntimeError(f"CNES: campo obrigatório ausente: {campo}")
        for linha in leitor:
            r["registros"] += 1
            if linha["CO_MOTIVO_DESAB"].strip():
                r["desabilitados_excluidos"] += 1
                continue
            municipio = territorios.de_seis(linha["CO_IBGE"])
            if municipio is None and linha["CO_IBGE"].startswith("53"):
                municipio = "5300108"
            if municipio is None:
                r["municipio_nao_resolvido"] += 1
                nao_resolvidos[linha["CO_IBGE"]] += 1
                continue
            r["ativos"] += 1
            tipo = linha["TP_UNIDADE"].strip()
            if tipo in UBS:
                contagem["ubs"][municipio] += 1
            elif tipo in HOSPITAIS:
                contagem["hosp"][municipio] += 1
            elif tipo in URGENCIA:
                contagem["urg"][municipio] += 1
    ano = int(data_arquivo[:4])
    pop, pop_uf = ler_populacao(f"p{ano}"), ler_populacao_uf(f"p{ano}")
    limitacao = ("Cadastro administrativo: presença de estabelecimento não demonstra acesso efetivo, funcionamento, equipe completa nem qualidade. "
                 "Moradores podem ser atendidos em municípios vizinhos.")
    indicadores, valores, referencias = [], {}, {}

    def registrar(ident, nome, chave, por, definicao):
        fator = por
        valores[ident] = {m: round(fator * contagem[chave].get(m, 0) / p, 2) for m, p in pop.items() if p}
        ref = {}
        for uf in list(NOME_UF) + ["BR"]:
            total = sum(n for m, n in contagem[chave].items() if uf == "BR" or territorios.por_codigo[m]["uf"] == uf)
            if pop_uf.get(uf):
                ref[uf] = round(fator * total / pop_uf[uf], 2)
        referencias[ident] = ref
        indicadores.append({"id": ident, "nome": nome, "dimensao": "Acesso e capacidade de saúde", "unidade": f"por {por:,} hab.".replace(",", "."),
                            "ano": ano, "fonte": "cnes_estabelecimentos", "tabela": "cnes_estabelecimentos.csv", "sentido": "menor_pior", "casas": 2,
                            "definicao": definicao + f" Denominador: população estimada de {ano} (IBGE). Zero = nenhum estabelecimento ativo desse tipo no cadastro.",
                            "limitacoes": limitacao})

    registrar("ubs_10mil", "Unidades básicas e postos de saúde", "ubs", 10000,
              "Estabelecimentos ativos dos tipos posto de saúde e centro de saúde/unidade básica ÷ população × 10.000.")
    registrar("hospitais_100mil", "Hospitais e unidades mistas", "hosp", 100000,
              "Estabelecimentos ativos dos tipos hospital geral, hospital especializado e unidade mista ÷ população × 100.000.")
    registrar("urgencia_100mil", "Prontos-socorros e pronto atendimentos", "urg", 100000,
              "Estabelecimentos ativos dos tipos pronto-socorro geral, pronto-socorro especializado e pronto atendimento ÷ população × 100.000.")
    gravar_json(os.path.join(BRUTOS, "partes", "cnes.json"), {"indicadores": indicadores, "valores": valores, "referencias": referencias, "situacoes": {}})
    relatorio["cnes"] = {**r, "data_do_arquivo": data_arquivo, "codigos_nao_resolvidos": dict(nao_resolvidos),
                         "totais": {k: sum(v.values()) for k, v in contagem.items()}}
    gravar_manifesto("cnes_estabelecimentos", {
        "titulo": "CNES — Cadastro Nacional de Estabelecimentos de Saúde (estabelecimentos)",
        "instituicao": "Ministério da Saúde / DATASUS",
        "pagina": "https://dadosabertos.saude.gov.br/dataset/cnes-cadastro-nacional-de-estabelecimentos-de-saude",
        "recursos": [URL_CNES],
        "licenca": "Dados abertos do Ministério da Saúde; citar a fonte.",
        "versao": f"Arquivo datado de {data_arquivo}",
        "periodo_referencia": f"situação do cadastro em {data_arquivo}",
        "granularidade": "estabelecimento (agregado por município)",
        "unidade": "estabelecimentos por habitantes",
        "definicao": "Contagem de estabelecimentos sem motivo de desabilitação, por tipo de unidade (TP_UNIDADE) e município (CO_IBGE).",
        "cobertura": f'{r["ativos"]} estabelecimentos ativos em {len({m for c in contagem.values() for m in c})} municípios com ao menos um dos tipos contados',
        "campos": {i["id"]: i["nome"] + " (" + i["unidade"] + ")" for i in indicadores},
        "valores_ausentes": "Município sem estabelecimento do tipo recebe zero (observado no cadastro).",
        "limitacoes": limitacao + " Equipes, profissionais, leitos e cobertura da atenção primária (SISAB/e-Gestor) não foram importados.",
        "arquivos_gerados": ["dados/indicadores/municipios.csv"],
        "comando_atualizacao": "python3 scripts/preparar_cnes_inpe.py --refazer && python3 scripts/montar_indicadores.py",
    })
    print("CNES:", dict(r), relatorio["cnes"]["totais"])


def inpe(territorios, relatorio):
    bruto = baixar(URL_INPE, os.path.join(BRUTOS, "inpe", f"focos_br_todos-sats_{ANO_INPE}.zip"), refazer=REFAZER, timeout=900)
    uf_por_nome = {normalizar(nome): uf for uf, nome in NOME_UF.items()}
    focos = collections.Counter()
    r = collections.Counter()
    nao_resolvidos = collections.Counter()
    meses = set()
    with zipfile.ZipFile(bruto) as z:
        leitor = csv.DictReader(io.TextIOWrapper(z.open(z.namelist()[0]), encoding="utf-8", newline=""))
        for campo in ("satelite", "estado", "municipio", "data_pas"):
            if campo not in leitor.fieldnames:
                raise RuntimeError(f"INPE: campo obrigatório ausente: {campo}")
        for linha in leitor:
            if linha["satelite"] != SATELITE_REFERENCIA:
                continue
            r["focos_satelite_referencia"] += 1
            meses.add(linha["data_pas"][:7])
            uf = uf_por_nome.get(normalizar(linha["estado"]))
            municipio = territorios.de_nome(linha["municipio"], uf) if uf else None
            if municipio is None:
                r["focos_nao_resolvidos"] += 1
                nao_resolvidos[f'{linha["municipio"]} / {linha["estado"]}'] += 1
                continue
            focos[municipio] += 1
    areas = {}
    partes_ibge = os.path.join(BRUTOS, "partes", "ibge.json")
    if os.path.exists(partes_ibge):
        import json
        with open(partes_ibge, encoding="utf-8") as arquivo:
            areas = json.load(arquivo)["valores"]["area_km2"]
    valores = {
        "focos_calor": {m: focos.get(m, 0) for m in territorios.por_codigo},
        "focos_por_1000km2": {m: round(1000 * focos.get(m, 0) / a, 2) for m, a in areas.items() if a},
    }
    limitacao = ("Foco de calor detectado por satélite é um indicador indireto: não mede a área queimada, a concentração de fumaça nem a exposição das pessoas. "
                 "A fumaça se desloca por centenas de quilômetros; um município sem focos pode receber fumaça de outros. Nuvens e queimadas pequenas reduzem a detecção.")
    comum = {"dimensao": "Ambiente", "ano": ANO_INPE, "fonte": "inpe_queimadas", "tabela": f"focos_br_todos-sats_{ANO_INPE}.csv (satélite {SATELITE_REFERENCIA})",
             "sentido": "maior_pior", "limitacoes": limitacao}
    indicadores = [
        {**comum, "id": "focos_calor", "nome": "Focos de calor (queimadas) no ano", "unidade": "focos", "casas": 0,
         "definicao": f"Número de focos detectados pelo satélite de referência do INPE ({SATELITE_REFERENCIA}) dentro do município em {ANO_INPE}. Zero = nenhum foco detectado."},
        {**comum, "id": "focos_por_1000km2", "nome": "Focos de calor por 1.000 km²", "unidade": "focos por 1.000 km²", "casas": 1,
         "definicao": f"Focos do satélite de referência em {ANO_INPE} ÷ área territorial do município (IBGE, 2022) × 1.000."},
    ]
    gravar_json(os.path.join(BRUTOS, "partes", "inpe.json"), {"indicadores": indicadores, "valores": valores, "referencias": {}, "situacoes": {}})
    relatorio["inpe"] = {**r, "meses_cobertos": sorted(meses), "municipios_com_foco": len(focos),
                         "nomes_nao_resolvidos": dict(nao_resolvidos.most_common())}
    gravar_manifesto("inpe_queimadas", {
        "titulo": "INPE — Programa Queimadas: focos de calor",
        "instituicao": "Instituto Nacional de Pesquisas Espaciais (INPE)",
        "pagina": "https://terrabrasilis.dpi.inpe.br/queimadas/portal/",
        "recursos": [URL_INPE],
        "licenca": "Dados públicos do INPE; uso livre com citação da fonte.",
        "versao": f"Arquivo anual de {ANO_INPE}",
        "periodo_referencia": f"{min(meses)} a {max(meses)}",
        "granularidade": "foco (ponto), agregado por município",
        "unidade": "focos de calor",
        "definicao": f"Somente o satélite de referência ({SATELITE_REFERENCIA}), usado pelo INPE para comparar anos e regiões; os demais satélites do arquivo repetem detecções e não são somados.",
        "cobertura": f'{len(focos)} municípios com ao menos um foco; {r["focos_nao_resolvidos"]} focos sem município resolvido',
        "campos": {"focos_calor": "focos no ano", "focos_por_1000km2": "focos por 1.000 km²"},
        "valores_ausentes": "Município sem foco detectado recebe zero.",
        "limitacoes": limitacao + " Qualidade do ar medida por estações não foi importada: não há rede nacional com cobertura municipal.",
        "arquivos_gerados": ["dados/indicadores/municipios.csv"],
        "comando_atualizacao": "python3 scripts/preparar_cnes_inpe.py --refazer && python3 scripts/montar_indicadores.py",
    })
    print("INPE:", dict(r), "municípios com foco:", len(focos), "não resolvidos:", list(nao_resolvidos.most_common(12)))


def main():
    territorios = Territorios()
    relatorio = {}
    cnes(territorios, relatorio)
    inpe(territorios, relatorio)
    gravar_relatorio("cnes_inpe", relatorio)


if __name__ == "__main__":
    main()
