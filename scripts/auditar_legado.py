#!/usr/bin/env python3
"""Audita os arquivos legados (dados/estados/2026/*.csv), que trazem NOME do município
na coluna `co_municipio_ibge_residencia`, resolvendo cada nome + UF para o código IBGE.

A resolução é exata (sem acentos) pela tabela oficial e pelas grafias antigas validadas
por código; nada é resolvido por semelhança. O resultado vai para
dados/relatorios/legado_municipios.json. Os arquivos legados não são mais usados pelo
painel: os agregados novos partem do CODMUNRES do arquivo oficial do SIM.

Uso: python3 scripts/auditar_legado.py [pasta]
"""

import collections
import csv
import glob
import os
import sys

from comum import DADOS, Territorios, gravar_relatorio


def main():
    pasta = sys.argv[1] if len(sys.argv) > 1 else os.path.join(DADOS, "estados", "2026")
    arquivos = sorted(glob.glob(os.path.join(pasta, "*.csv")))
    if not arquivos:
        raise SystemExit(f"Nenhum CSV legado em {pasta}.")
    territorios = Territorios()
    resolvidos = 0
    pendentes = collections.Counter()
    for caminho in arquivos:
        with open(caminho, encoding="utf-8-sig", newline="") as arquivo:
            for linha in csv.DictReader(arquivo, delimiter=";"):
                nome, uf = linha["co_municipio_ibge_residencia"], linha.get("uf", "")
                if territorios.de_nome(nome, uf):
                    resolvidos += 1
                else:
                    pendentes[(nome, uf)] += 1
    total = resolvidos + sum(pendentes.values())
    gravar_relatorio("legado_municipios", {
        "pasta": os.path.relpath(pasta, os.path.dirname(DADOS)),
        "registros": total,
        "resolvidos_por_nome_e_uf": resolvidos,
        "nao_resolvidos": sum(pendentes.values()),
        "proporcao_nao_resolvida": round(sum(pendentes.values()) / total, 5) if total else None,
        "itens_nao_resolvidos": [{"nome": n, "uf": u, "registros": q} for (n, u), q in pendentes.most_common()],
        "observacao": "A coluna co_municipio_ibge_residencia dos arquivos legados contém nomes, não códigos. "
                      "'Não identificado (código)' são municípios que faltavam na tabela usada na preparação original.",
    })
    print(f"{total} registros; resolvidos {resolvidos}; não resolvidos {sum(pendentes.values())} em {len(pendentes)} nomes")
    for (nome, uf), quantidade in pendentes.most_common(40):
        print(f"  {quantidade:6d}  {nome} / {uf}")


if __name__ == "__main__":
    main()
