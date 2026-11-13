#!/usr/bin/env python3
"""Gera o catálogo da CID-10 (edição brasileira distribuída pelo DATASUS).

Entrada: CID10CSV.zip (DATASUS, versão 2008 da CID-10 em português).
Saídas:
  dados/referencia/cid10.json            capítulos, grupos e categorias (3 caracteres)
  dados/referencia/cid10_sub/<letra>.json  subcategorias (4 caracteres) por letra inicial
  dados/relatorios/cid10.json            validações do catálogo

Os códigos U04, U07 etc., criados pela OMS depois da edição de 2008, não existem no
arquivo do DATASUS. Eles entram por scripts/referencias/cid10_suplemento.csv, marcados
como "suplemento", com a fonte indicada no próprio arquivo.

Uso: python3 scripts/preparar_cid10.py [--refazer]
"""

import csv
import io
import os
import sys
import zipfile

from comum import BRUTOS, DADOS, RAIZ, baixar, gravar_json, gravar_manifesto, gravar_relatorio, hoje

URL = "http://www2.datasus.gov.br/cid10/V2008/downloads/CID10CSV.zip"
PAGINA = "http://www2.datasus.gov.br/cid10/V2008/cid10.htm"
ROMANOS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV",
           "XVI", "XVII", "XVIII", "XIX", "XX", "XXI", "XXII"]
# Natureza do que cada capítulo classifica (nem tudo na CID é doença).
TIPO_CAPITULO = {
    15: "condição ligada a gravidez, parto e puerpério",
    16: "afecção do período perinatal",
    17: "malformação ou anomalia congênita",
    18: "sintoma, sinal ou achado (causa mal definida)",
    19: "lesão, envenenamento ou outra consequência de causa externa",
    20: "causa externa (acidente, violência ou outra circunstância)",
    21: "fator que influencia o estado de saúde ou contato com serviços",
    22: "código para propósitos especiais",
}


def ler(arquivo_zip, nome):
    texto = io.TextIOWrapper(arquivo_zip.open(nome), encoding="latin1", newline="")
    return list(csv.DictReader(texto, delimiter=";"))


def limpar(texto):
    return " ".join(str(texto or "").split())


def main():
    bruto = baixar(URL, os.path.join(BRUTOS, "cid10", "CID10CSV.zip"), refazer="--refazer" in sys.argv)
    with zipfile.ZipFile(bruto) as z:
        capitulos_brutos = ler(z, "CID-10-CAPITULOS.CSV")
        grupos_brutos = ler(z, "CID-10-GRUPOS.CSV")
        categorias_brutas = ler(z, "CID-10-CATEGORIAS.CSV")
        subcategorias_brutas = ler(z, "CID-10-SUBCATEGORIAS.CSV")

    capitulos = []
    for linha in capitulos_brutos:
        numero = int(linha["NUMCAP"])
        nome = limpar(linha["DESCRICAO"]).split(" - ", 1)[-1].strip()
        capitulos.append({"n": numero, "rom": ROMANOS[numero - 1], "ini": linha["CATINIC"], "fim": linha["CATFIM"],
                          "nome": nome, "tipo": TIPO_CAPITULO.get(numero, "doença")})

    def capitulo_de(codigo):
        for capitulo in capitulos:
            if capitulo["ini"] <= codigo[:3] <= capitulo["fim"]:
                return capitulo["n"]
        return None

    grupos = []
    for linha in grupos_brutos:
        grupos.append({"ini": linha["CATINIC"], "fim": linha["CATFIM"], "nome": limpar(linha["DESCRICAO"]),
                       "cap": capitulo_de(linha["CATINIC"])})

    problemas = {"categorias_sem_capitulo": [], "categorias_sem_grupo": [], "categorias_em_mais_de_um_grupo": [],
                 "subcategorias_sem_categoria": []}
    categorias = {}
    for linha in categorias_brutas:
        codigo = linha["CAT"].strip()
        indices = [i for i, g in enumerate(grupos) if g["ini"] <= codigo <= g["fim"]]
        if capitulo_de(codigo) is None:
            problemas["categorias_sem_capitulo"].append(codigo)
        if not indices:
            problemas["categorias_sem_grupo"].append(codigo)
        elif len(indices) > 1:
            # O arquivo do DATASUS tem alguns grupos aninhados; fica valendo o mais específico.
            problemas["categorias_em_mais_de_um_grupo"].append(codigo)
            indices.sort(key=lambda i: (ord(grupos[i]["fim"][0]) * 100 + int(grupos[i]["fim"][1:])) - (ord(grupos[i]["ini"][0]) * 100 + int(grupos[i]["ini"][1:])))
        categorias[codigo] = {"nome": limpar(linha["DESCRICAO"]), "g": indices[0] if indices else None,
                              "classif": linha["CLASSIF"].strip(), "sup": False}

    subcategorias = {}
    for linha in subcategorias_brutas:
        codigo = linha["SUBCAT"].strip()
        if codigo[:3] not in categorias:
            problemas["subcategorias_sem_categoria"].append(codigo)
            continue
        subcategorias[codigo] = {"nome": limpar(linha["DESCRICAO"]), "sexo": linha["RESTRSEXO"].strip(),
                                 "causa_obito": linha["CAUSAOBITO"].strip() != "N", "sup": False}

    # Suplemento documentado (códigos criados após a edição de 2008).
    suplemento = []
    with open(os.path.join(RAIZ, "scripts", "referencias", "cid10_suplemento.csv"), encoding="utf-8", newline="") as arquivo:
        for linha in csv.DictReader(arquivo, delimiter=";"):
            codigo = linha["codigo"].strip()
            suplemento.append(codigo)
            if len(codigo) == 3:
                if codigo not in categorias:
                    indices = [i for i, g in enumerate(grupos) if g["ini"] <= codigo <= g["fim"]]
                    categorias[codigo] = {"nome": linha["nome"], "g": indices[0] if indices else None, "classif": "", "sup": True}
            elif codigo not in subcategorias:
                subcategorias[codigo] = {"nome": linha["nome"], "sexo": "", "causa_obito": True, "sup": True}

    # Categorias do suplemento fora de qualquer grupo do arquivo de 2008: a OMS ampliou o
    # agrupamento vizinho (ex.: K55–K63 passou a K55–K64). Estendemos o grupo imediatamente anterior.
    def ordem(codigo):
        return ord(codigo[0]) * 100 + int(codigo[1:3])

    for codigo, categoria in sorted(categorias.items()):
        if categoria["g"] is None and categoria["sup"]:
            candidatos = [i for i, g in enumerate(grupos) if g["cap"] == capitulo_de(codigo) and g["fim"] < codigo]
            if not candidatos:
                raise RuntimeError(f"Sem grupo vizinho para o código suplementar {codigo}")
            indice = max(candidatos, key=lambda i: (ordem(grupos[i]["fim"]), -(ordem(grupos[i]["fim"]) - ordem(grupos[i]["ini"]))))
            grupos[indice]["fim_original"] = grupos[indice].get("fim_original", grupos[indice]["fim"])
            grupos[indice]["fim"] = codigo
            categoria["g"] = indice

    meta = {
        "classificacao": "CID-10",
        "edicao": "CID-10, 10ª revisão — versão 2008 em português distribuída pelo DATASUS (tabelas CID10CSV)",
        "idioma": "pt-BR",
        "origem": "Ministério da Saúde / DATASUS, a partir da tradução do Centro Brasileiro de Classificação de Doenças (CBCD/USP)",
        "pagina": PAGINA,
        "recurso": URL,
        "data_dos_arquivos_na_fonte": "2007-10-01",
        "coletado_em": hoje(),
        "suplemento": "scripts/referencias/cid10_suplemento.csv (códigos U e outros criados depois de 2008)",
        "totais": {"capitulos": len(capitulos), "grupos": len(grupos), "categorias": len(categorias), "subcategorias": len(subcategorias)},
        "outras_versoes": "O modelo guarda a classificação e a edição junto de cada conjunto de dados. Não há correspondência com a CID-11 neste projeto.",
    }
    gravar_json(os.path.join(DADOS, "referencia", "cid10.json"), {
        "meta": meta,
        "capitulos": capitulos,
        "grupos": grupos,
        # [código, nome, índice do grupo, marcador (+ adaga, * asterisco), suplemento]
        "categorias": [[c, v["nome"], v["g"], v["classif"], 1 if v["sup"] else 0] for c, v in sorted(categorias.items())],
    })
    por_letra = {}
    for codigo, sub in sorted(subcategorias.items()):
        por_letra.setdefault(codigo[0], {}).setdefault(codigo[:3], []).append(
            [codigo, sub["nome"], sub["sexo"], 1 if sub["causa_obito"] else 0, 1 if sub["sup"] else 0])
    for letra, conteudo in por_letra.items():
        gravar_json(os.path.join(DADOS, "referencia", "cid10_sub", f"{letra}.json"), conteudo)

    gravar_relatorio("cid10", {
        "totais_gerados": meta["totais"],
        "totais_no_arquivo_oficial": {"capitulos": len(capitulos_brutos), "grupos": len(grupos_brutos),
                                      "categorias": len(categorias_brutas), "subcategorias": len(subcategorias_brutas)},
        "codigos_do_suplemento": suplemento,
        "problemas": {k: (len(v) if k == "categorias_em_mais_de_um_grupo" else v) for k, v in problemas.items()},
        "observacao": "O arquivo oficial tem grupos aninhados (ex.: C00–C97 contém C00–C14). Cada categoria fica no grupo mais específico; os grupos amplos continuam selecionáveis como intervalo de códigos.",
    })
    gravar_manifesto("cid10_datasus", {
        "titulo": "CID-10 — tabelas em português (capítulos, grupos, categorias e subcategorias)",
        "instituicao": "Ministério da Saúde / DATASUS (tradução CBCD/USP da classificação da OMS)",
        "pagina": PAGINA,
        "recursos": [URL],
        "licenca": "Distribuição pública do DATASUS; a CID-10 é publicação da OMS.",
        "versao": "CID-10 versão 2008",
        "periodo_referencia": "edição de 2008",
        "data_publicacao": "2007-10-01 (data dos arquivos)",
        "granularidade": "classificação (sem território)",
        "unidade": "código",
        "definicao": "Capítulos, grupos (agrupamentos), categorias de 3 caracteres e subcategorias de 4 caracteres.",
        "cobertura": f'{len(capitulos)} capítulos, {len(grupos)} grupos, {len(categorias)} categorias e {len(subcategorias)} subcategorias',
        "campos": {"categorias": "[código, nome, índice do grupo, marcador, suplemento]",
                   "subcategorias": "[código, nome, restrição de sexo, pode ser causa básica, suplemento]"},
        "valores_ausentes": "Categorias sem subdivisão não têm subcategorias.",
        "limitacoes": "Edição de 2008: não traz os códigos criados depois (ex.: U07 COVID-19), incluídos por suplemento documentado. Não há sinônimos oficiais no arquivo.",
        "arquivos_gerados": ["dados/referencia/cid10.json", "dados/referencia/cid10_sub/*.json", "dados/relatorios/cid10.json"],
        "comando_atualizacao": "python3 scripts/preparar_cid10.py --refazer",
    })
    print(meta["totais"], {k: len(v) for k, v in problemas.items()})


if __name__ == "__main__":
    main()
