#!/usr/bin/env python3
"""Junta os indicadores territoriais preparados por fonte em uma tabela municipal única.

Entradas: dados/brutos/partes/{ibge,cnes,inpe}.json
Saídas:
  dados/indicadores/municipios.csv    mun;<indicador>...  (vazio = sem valor; ver situacoes.json)
  dados/indicadores/dicionario.json   definição, unidade, ano, fonte, cobertura e referências (Brasil e UFs)
  dados/indicadores/situacoes.json    por indicador: municípios sem valor e o motivo

Uso: python3 scripts/montar_indicadores.py
"""

import os
import statistics

from comum import BRUTOS, DADOS, NOME_UF, Territorios, gravar_csv, gravar_json, hoje, ler_json

PARTES = ["ibge", "cnes", "inpe"]
ORDEM_DIMENSOES = ["Demografia", "Água, esgoto e resíduos", "Vulnerabilidade social", "Acesso e capacidade de saúde",
                   "Ambiente", "Trabalho e exposições"]
# Dimensões pedidas na especificação que NÃO têm indicador municipal integrado, com o motivo verificado.
LACUNAS = [
    {"dimensao": "Clima e desastres",
     "situacao": "não integrado",
     "motivo": "O portal de dados históricos do INMET (portal.inmet.gov.br/dadoshistoricos) recusou a conexão nas tentativas de coleta de 12/11/2026. "
               "Mesmo disponível, a rede tem cerca de 600 estações automáticas: a maioria dos municípios não tem medição própria, e atribuir a estação mais próxima exigiria um método de interpolação documentado. "
               "Reconhecimentos de desastre (S2iD/Defesa Civil) não têm arquivo aberto estável para download automático.",
     "fontes_avaliadas": ["https://portal.inmet.gov.br/dadoshistoricos", "https://s2id.mi.gov.br/"]},
    {"dimensao": "Imunização",
     "situacao": "não integrado",
     "motivo": "O tabulador público de coberturas (TabNet, bd_pni/cpnibr.def) termina em 2022 e pertence ao sistema antigo (SI-PNI), anterior à migração para a RNDS. "
               "Os dados atuais são publicados como registros de doses aplicadas, sem a cobertura municipal calculada com o denominador oficial; calcular cobertura por conta própria misturaria denominadores.",
     "fontes_avaliadas": ["http://tabnet.datasus.gov.br/cgi/dhdat.exe?bd_pni/cpnibr.def", "https://www.gov.br/saude/pt-br/vacinacao"]},
    {"dimensao": "Vetores e contexto sanitário",
     "situacao": "parcial",
     "motivo": "Não há arquivo nacional aberto de índices entomológicos (LIRAa/LIA) por município. O painel usa os casos prováveis de dengue do SINAN como informação de vigilância, que é um desfecho, não uma medida de infestação.",
     "fontes_avaliadas": ["http://tabnet.datasus.gov.br/cgi/deftohtm.exe?sinannet/cnv/denguebbr.def"]},
    {"dimensao": "Comportamento e nutrição",
     "situacao": "fora do escopo",
     "motivo": "Dimensão deixada de fora desta entrega. PNS e Vigitel não produzem estimativas para todos os municípios; valores de capitais ou estados não podem ser atribuídos aos municípios.",
     "fontes_avaliadas": []},
    {"dimensao": "Qualidade do ar",
     "situacao": "não integrado",
     "motivo": "Não existe rede nacional de monitoramento com cobertura municipal. Focos de calor do INPE entram como indicador indireto de queimadas, não como medida de fumaça ou de exposição.",
     "fontes_avaliadas": ["https://terrabrasilis.dpi.inpe.br/queimadas/portal/"]},
]


def main():
    territorios = Territorios()
    codigos = sorted(territorios.por_codigo)
    indicadores, valores, referencias, situacoes = [], {}, {}, {}
    for parte in PARTES:
        caminho = os.path.join(BRUTOS, "partes", f"{parte}.json")
        if not os.path.exists(caminho):
            raise SystemExit(f"Parte ausente: {caminho}. Execute o script de preparação correspondente.")
        dados = ler_json(caminho)
        for indicador in dados["indicadores"]:
            ident = indicador["id"]
            if ident in valores:
                raise RuntimeError(f"Indicador duplicado: {ident}")
            indicadores.append(indicador)
            valores[ident] = dados["valores"][ident]
            referencias[ident] = dados["referencias"].get(ident, {})
            situacoes[ident] = dados["situacoes"].get(ident, {})
    indicadores.sort(key=lambda i: ORDEM_DIMENSOES.index(i["dimensao"]))

    def formatar(valor):
        if valor is None:
            return ""
        return str(int(valor)) if float(valor).is_integer() else str(valor)

    gravar_csv(os.path.join(DADOS, "indicadores", "municipios.csv"), ["mun"] + [i["id"] for i in indicadores],
               ([c] + [formatar(valores[i["id"]].get(c)) for i in indicadores] for c in codigos))

    dicionario, saida_situacoes = [], {}
    for indicador in indicadores:
        ident = indicador["id"]
        serie = valores[ident]
        estranhos = set(serie) - set(codigos)
        if estranhos:
            raise RuntimeError(f"{ident}: códigos fora da tabela oficial: {sorted(estranhos)[:5]}")
        ref = dict(referencias[ident])
        ref_tipo = "valor calculado para o território inteiro (fonte)"
        if "BR" not in ref:
            # Sem agregado oficial: a referência é a mediana dos municípios (indicada na interface).
            ref_tipo = "mediana dos municípios"
            ref = {"BR": round(statistics.median(serie.values()), 2)}
            for uf in NOME_UF:
                dos_municipios = [v for c, v in serie.items() if territorios.por_codigo[c]["uf"] == uf]
                if dos_municipios:
                    ref[uf] = round(statistics.median(dos_municipios), 2)
        sem_valor = {c: situacoes[ident].get(c, "indisponivel") for c in codigos if c not in serie}
        saida_situacoes[ident] = sem_valor
        ordenados = sorted(serie.values())
        dicionario.append({
            **indicador,
            "cobertura": {"municipios_com_valor": len(serie), "municipios_total": len(codigos)},
            "ref": ref, "ref_tipo": ref_tipo,
            "distribuicao": {"min": ordenados[0], "p25": ordenados[len(ordenados) // 4], "mediana": ordenados[len(ordenados) // 2],
                             "p75": ordenados[3 * len(ordenados) // 4], "max": ordenados[-1]},
        })
        print(f'{ident:28s} {len(serie):5d} municípios | BR {ref.get("BR")} ({ref_tipo})')
    gravar_json(os.path.join(DADOS, "indicadores", "dicionario.json"), {
        "gerado_em": hoje(), "dimensoes": ORDEM_DIMENSOES, "indicadores": dicionario, "lacunas": LACUNAS,
        "situacoes_possiveis": {"indisponivel": "a fonte não traz valor para o município", "suprimido": "valor ocultado pela fonte para evitar identificação",
                                "nao_se_aplica": "a medida não se aplica ao município"},
    }, compacto=False)
    gravar_json(os.path.join(DADOS, "indicadores", "situacoes.json"), saida_situacoes)


if __name__ == "__main__":
    main()
