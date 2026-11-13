#!/usr/bin/env python3
"""Internações do SUS (SIH/SUS) e casos prováveis de dengue (SINAN), via TabNet/DATASUS.

Saídas:
  dados/saude/sih/<ano>.csv        mun;cap;n   internações por município de RESIDÊNCIA e capítulo CID-10
  dados/saude/sih/indice.json
  dados/saude/dengue/casos.csv     mun;ano;n   casos prováveis de dengue por município de residência e ano de notificação
  dados/saude/dengue/indice.json
  dados/relatorios/tabnet.json     linhas não resolvidas e conferência de totais

Uso: python3 scripts/preparar_tabnet.py [--refazer]
"""

import os
import re
import sys

import tabnet
from comum import (BRUTOS, DADOS, UF_POR_PREFIXO, Territorios, gravar_csv, gravar_json, gravar_manifesto,
                   gravar_relatorio, hoje)

REFAZER = "--refazer" in sys.argv
ANOS = [2023, 2024, 2025, 2026]
MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]


def separar_linhas(linhas, territorios, relatorio, rotulo):
    """Resolve '110001 NOME' → código IBGE de 7 dígitos. Devolve (dados por município, linha de total, ignorados)."""
    dados, total, ignorados, nao_resolvidos = {}, None, [], []
    for linha in linhas:
        nome = linha[0].strip()
        if nome == "Total":
            total = linha
            continue
        achado = re.match(r"(\d{6})\s", nome)
        municipio = territorios.de_seis(achado.group(1)) if achado else None
        if municipio is None:
            if any(tabnet.numero(c) for c in linha[1:]):
                (ignorados if "IGNORADO" in nome.upper() or "exterior" in nome else nao_resolvidos).append(linha)
            continue
        if municipio in dados:
            raise RuntimeError(f"{rotulo}: município repetido na resposta do TabNet: {nome}")
        dados[municipio] = linha
    relatorio[rotulo] = {
        "municipios_com_linha": len(dados),
        "linhas_ignorado_ou_exterior_com_eventos": [l[0] + " = " + l[-1] for l in ignorados],
        "linhas_nao_resolvidas_com_eventos": [l[0] + " = " + l[-1] for l in nao_resolvidos],
    }
    return dados, total, ignorados + nao_resolvidos


def sih(territorios, relatorio):
    definicao = "sih/cnv/nrbr.def"
    disponiveis = {v: r for v, r in tabnet.formulario(definicao, refazer=REFAZER)["Arquivos"]}
    indice = {"anos": {}}
    for ano in ANOS:
        arquivos = [f"nrbr{ano % 100:02d}{m:02d}.dbf" for m in range(1, 13)]
        arquivos = [a for a in arquivos if a in disponiveis]
        if not arquivos:
            continue
        cabecalho, linhas = tabnet.consultar(definicao, "Município", "Capítulo_CID-10", "Internações", arquivos,
                                             os.path.join(BRUTOS, "tabnet", f"sih_{ano}.html"), refazer=REFAZER)
        capitulos = []
        for coluna in cabecalho[1:-1]:
            achado = re.fullmatch(r"Cap (\d+)", coluna)
            if not achado:
                raise RuntimeError(f"SIH {ano}: coluna inesperada '{coluna}'")
            capitulos.append(int(achado.group(1)))
        dados, total, fora = separar_linhas(linhas, territorios, relatorio, f"sih_{ano}")
        registros, soma = [], 0
        for municipio, linha in sorted(dados.items()):
            for capitulo, celula in zip(capitulos, linha[1:-1]):
                n = tabnet.numero(celula)
                if n:
                    registros.append((municipio, capitulo, n))
                    soma += n
        fora_total = sum(tabnet.numero(l[-1]) for l in fora)
        total_fonte = tabnet.numero(total[-1])
        if soma + fora_total != total_fonte:
            raise RuntimeError(f"SIH {ano}: soma {soma} + fora {fora_total} ≠ total da fonte {total_fonte}")
        gravar_csv(os.path.join(DADOS, "saude", "sih", f"{ano}.csv"), ["mun", "cap", "n"], registros)
        meses = [int(a[6:8]) for a in arquivos]
        indice["anos"][str(ano)] = {
            "ano": ano, "internacoes": total_fonte, "internacoes_com_municipio": soma,
            "meses_processamento": meses, "ano_completo": len(meses) == 12,
            "periodo": "janeiro a dezembro" if len(meses) == 12 else f"{MESES[meses[0] - 1].lower()}–{MESES[meses[-1] - 1].lower()} (competências já publicadas)",
            "capitulos": capitulos,
        }
        relatorio[f"sih_{ano}"]["total_da_fonte"] = total_fonte
        relatorio[f"sih_{ano}"]["soma_dos_municipios"] = soma
        print(f"SIH {ano}: {total_fonte:,} internações; {len(dados)} municípios; meses {meses[0]}–{meses[-1]}; fora de município: {fora_total}")
    indice.update({
        "fonte": "SIH/SUS — Morbidade hospitalar do SUS por local de residência (TabNet/DATASUS)",
        "evento": "internações (AIH aprovadas) no SUS por município de residência e capítulo CID-10 do diagnóstico principal",
        "gerado_em": hoje(),
    })
    gravar_json(os.path.join(DADOS, "saude", "sih", "indice.json"), indice, compacto=False)
    gravar_manifesto("sih_sus", {
        "titulo": "SIH/SUS — Morbidade hospitalar do SUS, por local de residência",
        "instituicao": "Ministério da Saúde / DATASUS",
        "pagina": "http://tabnet.datasus.gov.br/cgi/deftohtm.exe?sih/cnv/nrbr.def",
        "recursos": ["http://tabnet.datasus.gov.br/cgi/tabcgi.exe?sih/cnv/nrbr.def (Linha: Município; Coluna: Capítulo CID-10; Conteúdo: Internações; Períodos: meses de processamento de cada ano)"],
        "licenca": "Informações de saúde de acesso público (TabNet/DATASUS); citar a fonte.",
        "versao": "Situação da base nacional na data da coleta; dados dos últimos meses sujeitos a atualização",
        "periodo_referencia": "; ".join(f'{a}: {v["periodo"]}' for a, v in sorted(indice["anos"].items())),
        "granularidade": "município de residência",
        "unidade": "internações (AIH aprovadas)",
        "definicao": "Quantidade de internações pagas pelo SUS, pelo capítulo CID-10 do diagnóstico principal, por mês de processamento.",
        "cobertura": "Somente internações financiadas pelo SUS. Capítulo XX (causas externas) e XXII não aparecem como diagnóstico principal.",
        "campos": {"mun": "código IBGE (7 dígitos)", "cap": "capítulo CID-10", "n": "internações"},
        "valores_ausentes": "'-' no TabNet é zero internações registradas; combinações zeradas não são gravadas.",
        "limitacoes": "Não inclui internações particulares ou por planos de saúde; conta internações, não pessoas (reinternações e transferências contam mais de uma vez); depende da oferta de leitos e do acesso; período é o de processamento da AIH, não o da doença. Detalhe abaixo de capítulo não foi importado.",
        "arquivos_gerados": ["dados/saude/sih/<ano>.csv", "dados/saude/sih/indice.json"],
        "comando_atualizacao": "python3 scripts/preparar_tabnet.py --refazer",
    })


def dengue(territorios, relatorio):
    definicao = "sinannet/cnv/denguebbr.def"
    disponiveis = {v for v, _ in tabnet.formulario(definicao, refazer=REFAZER)["Arquivos"]}
    indice = {"anos": {}}
    registros = []
    for ano in ANOS:
        arquivo = f"dengbr{ano % 100:02d}.dbf"
        if arquivo not in disponiveis:
            continue
        _cabecalho, linhas = tabnet.consultar(definicao, "Município_de_residência", "--Não-Ativa--", "Casos_Prováveis", [arquivo],
                                              os.path.join(BRUTOS, "tabnet", f"dengue_{ano}.html"), refazer=REFAZER)
        dados, total, fora = separar_linhas(linhas, territorios, relatorio, f"dengue_{ano}")
        soma = 0
        for municipio, linha in sorted(dados.items()):
            n = tabnet.numero(linha[-1])
            registros.append((municipio, ano, n))
            soma += n
        fora_total = sum(tabnet.numero(l[-1]) for l in fora)
        total_fonte = tabnet.numero(total[-1])
        if soma + fora_total != total_fonte:
            raise RuntimeError(f"Dengue {ano}: soma {soma} + fora {fora_total} ≠ total da fonte {total_fonte}")
        indice["anos"][str(ano)] = {"ano": ano, "casos_provaveis": total_fonte, "casos_com_municipio": soma,
                                    "municipios_na_tabela": len(dados)}
        relatorio[f"dengue_{ano}"]["total_da_fonte"] = total_fonte
        print(f"Dengue {ano}: {total_fonte:,} casos prováveis; {len(dados)} municípios; fora de município: {fora_total}")
    gravar_csv(os.path.join(DADOS, "saude", "dengue", "casos.csv"), ["mun", "ano", "n"], registros)
    indice.update({
        "fonte": "SINAN — Dengue, notificações registradas (TabNet/DATASUS)",
        "evento": "casos prováveis de dengue por município de residência e ano de notificação",
        "cid": ["A90", "A91", "A97"],
        "gerado_em": hoje(),
    })
    gravar_json(os.path.join(DADOS, "saude", "dengue", "indice.json"), indice, compacto=False)
    gravar_manifesto("sinan_dengue", {
        "titulo": "SINAN — Dengue: casos prováveis",
        "instituicao": "Ministério da Saúde / SVSA — Sistema de Informação de Agravos de Notificação",
        "pagina": "http://tabnet.datasus.gov.br/cgi/deftohtm.exe?sinannet/cnv/denguebbr.def",
        "recursos": ["http://tabnet.datasus.gov.br/cgi/tabcgi.exe?sinannet/cnv/denguebbr.def (Linha: Município de residência; Conteúdo: Casos prováveis; um período por ano)"],
        "licenca": "Informações de saúde de acesso público (TabNet/DATASUS); citar a fonte.",
        "versao": "Situação da base na data da coleta; anos recentes sujeitos a revisão",
        "periodo_referencia": ", ".join(sorted(indice["anos"])) + " (ano de notificação)",
        "granularidade": "município de residência",
        "unidade": "casos prováveis",
        "definicao": "Casos prováveis: todas as notificações, exceto as descartadas (definição do tabulador do Ministério da Saúde).",
        "cobertura": "Municípios com notificação registrada no SINAN; o ano corrente é parcial.",
        "campos": {"mun": "código IBGE (7 dígitos)", "ano": "ano de notificação", "n": "casos prováveis"},
        "valores_ausentes": "Zero significa nenhuma notificação provável registrada; não prova ausência de transmissão (pode haver subnotificação).",
        "limitacoes": "Notificações dependem da procura por atendimento e da vigilância local; caso provável não é caso confirmado por laboratório; não é incidência em sentido estrito; município de residência pode não ser o local de infecção.",
        "arquivos_gerados": ["dados/saude/dengue/casos.csv", "dados/saude/dengue/indice.json"],
        "comando_atualizacao": "python3 scripts/preparar_tabnet.py --refazer",
    })


def main():
    territorios = Territorios()
    relatorio = {}
    sih(territorios, relatorio)
    dengue(territorios, relatorio)
    gravar_relatorio("tabnet", relatorio)


if __name__ == "__main__":
    main()
