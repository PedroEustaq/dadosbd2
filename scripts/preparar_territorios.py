#!/usr/bin/env python3
"""Gera a tabela oficial de municípios a partir da API de localidades do IBGE.

Saída: dados/referencia/municipios.json
  municipios: [{c: código IBGE de 7 dígitos (texto), n: nome, uf: sigla}]
Também confere a malha usada no mapa (dados/geo/municipios) contra a tabela oficial
e grava dados/relatorios/territorios.json.

Uso: python3 scripts/preparar_territorios.py [--refazer]
"""

import json
import os
import sys

from comum import (BRUTOS, DADOS, UF_POR_PREFIXO, baixar, gravar_json, gravar_manifesto,
                   gravar_relatorio, hoje, ler_json, normalizar)

URL = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado"


def main():
    bruto = baixar(URL, os.path.join(BRUTOS, "ibge", "localidades_municipios.json"), refazer="--refazer" in sys.argv)
    registros = ler_json(bruto)
    municipios = []
    for registro in registros:
        codigo = str(registro["municipio-id"])
        uf = registro["UF-sigla"]
        if len(codigo) != 7 or UF_POR_PREFIXO.get(codigo[:2]) != uf:
            raise RuntimeError(f"Registro inconsistente na tabela do IBGE: {registro}")
        municipios.append({"c": codigo, "n": registro["municipio-nome"], "uf": uf})
    municipios.sort(key=lambda m: m["c"])
    codigos = {m["c"] for m in municipios}
    if len(codigos) != len(municipios):
        raise RuntimeError("Códigos duplicados na tabela do IBGE.")

    homonimos = {}
    for municipio in municipios:
        homonimos.setdefault(normalizar(municipio["n"]), []).append(f'{municipio["c"]} {municipio["uf"]}')
    homonimos_mesma_uf = {}
    for municipio in municipios:
        homonimos_mesma_uf.setdefault((normalizar(municipio["n"]), municipio["uf"]), []).append(municipio["c"])

    gravar_json(os.path.join(DADOS, "referencia", "municipios.json"), {
        "fonte": "IBGE — API de localidades", "url": URL, "coletado_em": hoje(), "municipios": municipios,
    })

    # Confere a malha do mapa contra a tabela oficial.
    pasta_malha = os.path.join(DADOS, "geo", "municipios")
    na_malha = {}
    for nome in sorted(os.listdir(pasta_malha)):
        if nome.endswith(".geojson"):
            for feicao in ler_json(os.path.join(pasta_malha, nome))["features"]:
                na_malha[str(feicao["properties"]["id"])] = feicao["properties"]["name"]
    sem_malha = sorted(codigos - set(na_malha))
    malha_sem_tabela = sorted(set(na_malha) - codigos)
    nomes_diferentes = [
        {"codigo": c, "ibge": m["n"], "malha": na_malha[c]}
        for c, m in ((m["c"], m) for m in municipios)
        if c in na_malha and normalizar(na_malha[c]) != normalizar(m["n"])
    ]
    por_codigo = {m["c"]: m for m in municipios}
    # Grafias antigas: a malha traz, para o MESMO código IBGE, o nome anterior de municípios que
    # mudaram de nome ou grafia. Servem para resolver fontes que só informam nome + UF.
    gravar_json(os.path.join(DADOS, "referencia", "municipios_nomes_alternativos.json"), {
        "origem": "Nomes da malha geodata-br para o mesmo código IBGE (correspondência por código, não por semelhança)",
        "nomes": [{"c": d["codigo"], "uf": por_codigo[d["codigo"]]["uf"], "alternativo": d["malha"], "oficial": d["ibge"]} for d in nomes_diferentes],
    }, compacto=False)
    gravar_relatorio("territorios", {
        "total_municipios_ibge": len(municipios),
        "total_feicoes_malha": len(na_malha),
        "municipios_sem_geometria_na_malha": [{"codigo": c, "nome": por_codigo[c]["n"], "uf": por_codigo[c]["uf"]} for c in sem_malha],
        "feicoes_da_malha_fora_da_tabela": [{"codigo": c, "nome": na_malha[c]} for c in malha_sem_tabela],
        "nomes_diferentes_entre_malha_e_tabela": nomes_diferentes,
        "nomes_repetidos_em_ufs_diferentes": sum(1 for v in homonimos.values() if len(v) > 1),
        "homonimos_na_mesma_uf": [{"nome": k[0], "uf": k[1], "codigos": v} for k, v in homonimos_mesma_uf.items() if len(v) > 1],
        "observacao": "Municípios sem geometria continuam disponíveis em buscas, tabelas e fichas; apenas não são desenhados no mapa.",
    })
    gravar_manifesto("ibge_localidades", {
        "titulo": "Tabela de municípios e UFs",
        "instituicao": "IBGE",
        "pagina": "https://servicodados.ibge.gov.br/api/docs/localidades",
        "recursos": [URL],
        "licenca": "Dados públicos do IBGE; uso livre com citação da fonte.",
        "versao": "Divisão territorial vigente na data da coleta",
        "periodo_referencia": "vigente",
        "granularidade": "município",
        "unidade": "registro de município",
        "definicao": "Código IBGE de 7 dígitos, nome e UF de cada município.",
        "cobertura": f"{len(municipios)} municípios",
        "campos": {"c": "código IBGE (7 dígitos, texto)", "n": "nome oficial", "uf": "sigla da UF"},
        "valores_ausentes": "não há",
        "limitacoes": "Fontes de saúde usam o código de 6 dígitos (sem dígito verificador); a conversão é feita pelos 6 primeiros dígitos, que são únicos na tabela (verificado no script).",
        "arquivos_gerados": ["dados/referencia/municipios.json", "dados/relatorios/territorios.json"],
        "comando_atualizacao": "python3 scripts/preparar_territorios.py --refazer",
    })
    print(f"{len(municipios)} municípios; sem geometria: {len(sem_malha)}; malha fora da tabela: {len(malha_sem_tabela)}; nomes diferentes: {len(nomes_diferentes)}")
    print(json.dumps(sem_malha), json.dumps(malha_sem_tabela))


if __name__ == "__main__":
    main()
