#!/usr/bin/env python3
"""Agrega os microdados públicos do SIM (óbitos não fetais) por município de RESIDÊNCIA.

Entrada: Mortalidade_Geral_<ano>_csv.zip (dados abertos do Ministério da Saúde).
Saídas em dados/saude/sim/:
  indice.json                     anos, cobertura mensal, totais e contagens de exclusão
  <ano>/mun/<UF>.csv              mun;cid3;n            óbitos por município e categoria CID-10
  <ano>/perfil/<UF>.csv           mun;cap;sexo;faixa;n  óbitos por município, capítulo, sexo e faixa etária
  <ano>/mun_cap.csv               mun;cap;n             todos os municípios do país, por capítulo
  <ano>/uf_cid.csv                uf;cid;n              por UF e código completo (subcategoria quando informada)
  <ano>/uf_perfil.csv             uf;cap;sexo;faixa;n   por UF, capítulo, sexo e faixa etária
  <ano>/uf_mes.csv                uf;cap;mes;n          por UF, capítulo e mês do óbito
e dados/relatorios/sim.json (códigos não resolvidos, municípios ignorados etc.).

Nenhum registro individual é publicado: só contagens agregadas.

Uso: python3 scripts/preparar_sim.py [anos...] [--refazer]
"""

import collections
import csv
import email.utils
import io
import os
import sys
import urllib.request
import zipfile

from comum import (AGENTE, BRUTOS, DADOS, PREFIXO_POR_UF, UF_POR_PREFIXO, Territorios, baixar, gravar_csv,
                   gravar_json, gravar_manifesto, gravar_relatorio, hoje, ler_json)

ANOS = [2023, 2024, 2025, 2026]
URL = "https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/SIM/csv/Mortalidade_Geral_{ano}_csv.zip"
PAGINA = "https://dadosabertos.saude.gov.br/dataset/sim"
# Faixas etárias de 5 anos, iguais às do Censo 2022 usadas como denominador.
FAIXAS = [str(i) for i in range(0, 80, 5)] + ["80", "ign"]
MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]


def faixa_etaria(idade):
    """Campo IDADE do SIM: 1º dígito = unidade (0 min, 1 h, 2 d, 3 meses, 4 anos, 5 = 100+)."""
    idade = (idade or "").strip()
    if len(idade) != 3 or not idade.isdigit() or idade == "999":
        return "ign"
    unidade, valor = idade[0], int(idade[1:])
    if unidade in "0123":
        return "0"
    if unidade == "5":
        return "80"
    if unidade == "4":
        return str(min(valor // 5 * 5, 80))
    return "ign"


def data_publicacao(url):
    try:
        requisicao = urllib.request.Request(url, method="HEAD", headers={"User-Agent": AGENTE})
        with urllib.request.urlopen(requisicao, timeout=60) as resposta:
            return email.utils.parsedate_to_datetime(resposta.headers["Last-Modified"]).date().isoformat()
    except Exception:
        return None


def carregar_cid():
    cid = ler_json(os.path.join(DADOS, "referencia", "cid10.json"))
    capitulos = cid["capitulos"]
    categorias = {}
    for codigo, *_ in cid["categorias"]:
        categorias[codigo] = next(c["n"] for c in capitulos if c["ini"] <= codigo <= c["fim"])
    return categorias


def processar(ano, territorios, categorias, refazer):
    url = URL.format(ano=ano)
    bruto = baixar(url, os.path.join(BRUTOS, "sim", f"Mortalidade_Geral_{ano}_csv.zip"), refazer=refazer, timeout=900)
    mun_cid = collections.Counter()
    perfil = collections.Counter()
    uf_cid = collections.Counter()
    uf_perfil = collections.Counter()
    uf_mes = collections.Counter()
    meses = collections.Counter()
    r = collections.Counter()
    cids_invalidos = collections.Counter()
    municipios_nao_resolvidos = collections.Counter()

    with zipfile.ZipFile(bruto) as z:
        nome = next(n for n in z.namelist() if n.lower().endswith(".csv"))
        leitor = csv.reader(io.TextIOWrapper(z.open(nome), encoding="latin1", newline=""), delimiter=";", quotechar='"')
        cabecalho = [c.strip().upper() for c in next(leitor)]
        obrigatorios = ["TIPOBITO", "DTOBITO", "IDADE", "SEXO", "CODMUNRES", "CAUSABAS"]
        faltando = [c for c in obrigatorios if c not in cabecalho]
        if faltando:
            raise RuntimeError(f"SIM {ano}: campos obrigatórios ausentes: {faltando}")
        i_tipo, i_data, i_idade, i_sexo, i_mun, i_causa = (cabecalho.index(c) for c in obrigatorios)

        for linha in leitor:
            r["linhas"] += 1
            if linha[i_tipo].strip() != "2":
                r["fetais_ou_tipo_ignorado_excluidos"] += 1
                continue
            data = linha[i_data].strip().zfill(8)
            if len(data) != 8 or not data.isdigit() or data[4:] != str(ano) or not 1 <= int(data[2:4]) <= 12:
                r["data_invalida_ou_de_outro_ano_excluidos"] += 1
                continue
            causa = linha[i_causa].strip().upper().lstrip("*")
            if causa.endswith("X") and len(causa) == 4:
                causa = causa[:3]
            cid3 = causa[:3]
            capitulo = categorias.get(cid3)
            if capitulo is None or len(causa) not in (3, 4):
                # Código fora do catálogo: mantido nos totais, sem categoria.
                cids_invalidos[causa] += 1
                cid3, causa, capitulo = "???", "???", 0
            codigo = linha[i_mun].strip()
            uf = UF_POR_PREFIXO.get(codigo[:2])
            if uf is None:
                r["residencia_sem_uf_valida_excluidos"] += 1
                continue
            mes = int(data[2:4])
            sexo = {"1": "M", "2": "F"}.get(linha[i_sexo].strip(), "I")
            faixa = faixa_etaria(linha[i_idade])
            r["obitos"] += 1
            meses[mes] += 1
            uf_cid[(uf, causa)] += 1
            uf_perfil[(uf, capitulo, sexo, faixa)] += 1
            uf_mes[(uf, capitulo, mes)] += 1
            municipio = territorios.de_seis(codigo)
            if municipio is None and uf == "DF":
                municipio = "5300108"  # regiões administrativas do DF pertencem a Brasília
            if municipio is None:
                if codigo[2:6] == "0000":
                    r["municipio_ignorado_contado_so_na_uf"] += 1
                else:
                    r["municipio_nao_resolvido_contado_so_na_uf"] += 1
                    municipios_nao_resolvidos[codigo] += 1
                continue
            r["obitos_com_municipio"] += 1
            mun_cid[(municipio, cid3)] += 1
            perfil[(municipio, capitulo, sexo, faixa)] += 1

    pasta = os.path.join(DADOS, "saude", "sim", str(ano))
    for uf, prefixo in sorted(PREFIXO_POR_UF.items()):
        gravar_csv(os.path.join(pasta, "mun", f"{uf}.csv"), ["mun", "cid3", "n"],
                   ((m, c, n) for (m, c), n in sorted(mun_cid.items()) if m.startswith(prefixo)))
        gravar_csv(os.path.join(pasta, "perfil", f"{uf}.csv"), ["mun", "cap", "sexo", "faixa", "n"],
                   ((*k, n) for k, n in sorted(perfil.items(), key=lambda x: (x[0][0], x[0][1], x[0][2], FAIXAS.index(x[0][3]))) if k[0].startswith(prefixo)))
    mun_cap = collections.Counter()
    for (m, cap, _s, _f), n in perfil.items():
        mun_cap[(m, cap)] += n
    gravar_csv(os.path.join(pasta, "mun_cap.csv"), ["mun", "cap", "n"], ((*k, n) for k, n in sorted(mun_cap.items())))
    gravar_csv(os.path.join(pasta, "uf_cid.csv"), ["uf", "cid", "n"], ((*k, n) for k, n in sorted(uf_cid.items())))
    gravar_csv(os.path.join(pasta, "uf_perfil.csv"), ["uf", "cap", "sexo", "faixa", "n"],
               ((*k, n) for k, n in sorted(uf_perfil.items(), key=lambda x: (x[0][0], x[0][1], x[0][2], FAIXAS.index(x[0][3])))))
    gravar_csv(os.path.join(pasta, "uf_mes.csv"), ["uf", "cap", "mes", "n"], ((*k, n) for k, n in sorted(uf_mes.items())))

    # Validação: os totais de todas as saídas têm de fechar com o total de óbitos aceitos.
    assert sum(uf_cid.values()) == sum(uf_perfil.values()) == sum(uf_mes.values()) == r["obitos"]
    assert sum(mun_cid.values()) == sum(perfil.values()) == sum(mun_cap.values()) == r["obitos_com_municipio"]

    # Cobertura mensal: um mês é "incompleto" quando tem menos de 70% da mediana dos meses com registro.
    contagens = [meses[m] for m in range(1, 13) if meses[m]]
    mediana = sorted(contagens)[len(contagens) // 2]
    presentes = [m for m in range(1, 13) if meses[m]]
    completos = [m for m in presentes if meses[m] >= 0.7 * mediana]
    ano_completo = len(completos) == 12
    if ano_completo:
        periodo = "janeiro a dezembro"
    else:
        periodo = f"{MESES[presentes[0] - 1]}–{MESES[presentes[-1] - 1]}"
        incompletos = [MESES[m - 1] for m in presentes if m not in completos]
        if incompletos:
            periodo += f" ({', '.join(incompletos)} com registro ainda incompleto)"
    resumo = {
        "ano": ano,
        "recurso": url,
        "publicado_em": data_publicacao(url),
        "ano_completo": ano_completo,
        "periodo": periodo,
        "situacao": ("Ano completo no arquivo. " if ano_completo else "Arquivo parcial (prévia): não cobre o ano inteiro. ") +
                    "Os números podem mudar em novas publicações do Ministério da Saúde.",
        "obitos": r["obitos"],
        "obitos_com_municipio": r["obitos_com_municipio"],
        "por_mes": [meses[m] for m in range(1, 13)],
        "contagens": dict(r),
        "codigos_cid_fora_do_catalogo": sum(cids_invalidos.values()),
    }
    detalhes = {
        "codigos_cid_fora_do_catalogo": dict(sorted(cids_invalidos.items())),
        "codigos_de_municipio_nao_resolvidos": dict(sorted(municipios_nao_resolvidos.items())),
    }
    print(ano, {k: v for k, v in resumo.items() if k in ("obitos", "obitos_com_municipio", "periodo", "publicado_em")}, dict(r))
    return resumo, detalhes


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    anos = [int(a) for a in args] or ANOS
    refazer = "--refazer" in sys.argv
    territorios = Territorios()
    categorias = carregar_cid()
    caminho_indice = os.path.join(DADOS, "saude", "sim", "indice.json")
    indice = ler_json(caminho_indice) if os.path.exists(caminho_indice) else {"anos": {}}
    caminho_relatorio = os.path.join(DADOS, "relatorios", "sim.json")
    relatorio = ler_json(caminho_relatorio) if os.path.exists(caminho_relatorio) else {"anos": {}}
    for ano in anos:
        resumo, detalhes = processar(ano, territorios, categorias, refazer)
        indice["anos"][str(ano)] = resumo
        relatorio["anos"][str(ano)] = {**resumo["contagens"], **detalhes}
    indice.update({
        "fonte": "SIM — Sistema de Informações sobre Mortalidade (Ministério da Saúde)",
        "evento": "óbitos não fetais por município de residência e causa básica (CID-10)",
        "faixas": FAIXAS,
        "gerado_em": hoje(),
    })
    gravar_json(caminho_indice, indice, compacto=False)
    gravar_relatorio("sim", {"anos": relatorio["anos"], "regras": {
        "residencia": "Contagem pelo município de residência (CODMUNRES). O município de ocorrência não é usado.",
        "codigo_municipal": "CODMUNRES tem 6 dígitos; convertido para 7 pela tabela oficial do IBGE. Códigos terminados em 0000 são 'município ignorado' e entram só no total da UF.",
        "cid": "Causa básica (CAUSABAS). Códigos fora do catálogo entram nos totais como '???' e são listados aqui.",
    }})
    anos_txt = ", ".join(sorted(indice["anos"]))
    gravar_manifesto("sim_mortalidade", {
        "titulo": "SIM — Mortalidade geral (microdados)",
        "instituicao": "Ministério da Saúde / SVSA / DAENT",
        "pagina": PAGINA,
        "recursos": [URL.format(ano=a) for a in sorted(indice["anos"])],
        "licenca": "Dados abertos do Ministério da Saúde (Creative Commons Atribuição, conforme o portal de dados abertos).",
        "versao": "; ".join(f'{a}: publicado em {v["publicado_em"]}' for a, v in sorted(indice["anos"].items())),
        "periodo_referencia": "; ".join(f'{a}: {v["periodo"]}' for a, v in sorted(indice["anos"].items())),
        "granularidade": "município de residência (agregado a partir de registros individuais)",
        "unidade": "óbitos",
        "definicao": "Óbitos não fetais (TIPOBITO = 2) por causa básica (CID-10), contados no município de residência.",
        "cobertura": "Todas as UFs. Anos: " + anos_txt + ". Anos recentes são prévias com meses incompletos (ver dados/saude/sim/indice.json).",
        "campos": {"mun": "código IBGE (7 dígitos)", "cid3": "categoria CID-10", "cap": "capítulo CID-10 (0 = código fora do catálogo)",
                   "sexo": "M, F ou I (ignorado)", "faixa": "idade inicial da faixa de 5 anos; 80 = 80 anos ou mais; ign = ignorada", "n": "óbitos"},
        "valores_ausentes": "Combinação ausente no arquivo significa nenhum óbito registrado com aquela combinação no arquivo publicado; em prévias, registros ainda podem chegar.",
        "limitacoes": "Sub-registro e causas mal definidas variam entre municípios; prévias são incompletas e sofrem revisão; a causa básica não descreve todas as doenças presentes; o município de residência não é necessariamente o local de exposição.",
        "arquivos_gerados": ["dados/saude/sim/indice.json", "dados/saude/sim/<ano>/...", "dados/relatorios/sim.json"],
        "comando_atualizacao": "python3 scripts/preparar_sim.py --refazer",
    })


if __name__ == "__main__":
    main()
