#!/usr/bin/env python3
"""População (denominadores) e indicadores territoriais do IBGE, via API do SIDRA.

Saídas:
  dados/populacao/municipios.csv            mun;p2022;p2024;p2025;p2026 (2022 = Censo; demais = estimativas)
  dados/populacao/uf.csv                    uf;p2022;p2024;p2025;p2026  (inclui BR)
  dados/populacao/censo2022_idade/<UF>.csv  mun;sexo;faixa;pop  (faixas de 5 anos; 80 = 80 anos ou mais)
  dados/populacao/censo2022_idade_uf.csv    uf;sexo;faixa;pop   (inclui BR)
  dados/brutos/partes/ibge.json             indicadores municipais para montar_indicadores.py

Valores especiais do SIDRA são preservados: "-" = zero; "X" = suprimido (sigilo);
"..." = indisponível; ".." = não se aplica.

Uso: python3 scripts/preparar_ibge.py [--refazer]
"""

import os
import sys
import time
import urllib.parse

from comum import (BRUTOS, DADOS, PREFIXO_POR_UF, UF_POR_PREFIXO, Territorios, baixar, gravar_csv, gravar_json,
                   gravar_manifesto, hoje, ler_json)

API = "https://apisidra.ibge.gov.br/values"
REFAZER = "--refazer" in sys.argv
FAIXAS_CENSO = {
    93070: "0", 93084: "5", 93085: "10", 93086: "15", 93087: "20", 93088: "25", 93089: "30", 93090: "35",
    93091: "40", 93092: "45", 93093: "50", 93094: "55", 93095: "60", 93096: "65", 93097: "70", 93098: "75",
    49108: "80", 49109: "80", 60040: "80", 60041: "80", 6653: "80",
}
consultas = []  # URLs efetivamente usadas, para o manifesto


def sidra(tabela, variaveis, periodo, classificacoes=None, niveis=("n6", "n3", "n1")):
    """Devolve linhas {nivel, local, variavel, periodo, cats: {classificação: categoria}, valor, situacao}."""
    caminho_classes = "".join(f"/c{c}/{','.join(str(x) for x in cats)}" for c, cats in (classificacoes or {}).items())
    base = f"/v/{','.join(str(v) for v in variaveis)}/p/{periodo}{caminho_classes}"
    pedidos = []
    if "n6" in niveis:
        pedidos += [(f"n6_{prefixo}", f"/t/{tabela}/n6/in%20n3%20{prefixo}{base}") for prefixo in sorted(UF_POR_PREFIXO)]
    if "n3" in niveis:
        pedidos.append(("n3", f"/t/{tabela}/n3/all{base}"))
    if "n1" in niveis:
        pedidos.append(("n1", f"/t/{tabela}/n1/all{base}"))
    chave = urllib.parse.quote(base, safe="").replace("%", "_")[:150]
    linhas = []
    for rotulo, caminho in pedidos:
        destino = os.path.join(BRUTOS, "ibge", "sidra", str(tabela), f"{rotulo}{chave}.json")
        existia = os.path.exists(destino)
        baixar(API + caminho, destino, refazer=REFAZER, timeout=240, tentativas=5)
        if not existia or REFAZER:
            time.sleep(0.4)  # respeita o serviço público
        dados = ler_json(destino)
        cabecalho, registros = dados[0], dados[1:]
        dimensoes = {}
        for campo, nome in cabecalho.items():
            if campo.endswith("C") and campo.startswith("D"):
                dimensoes[campo] = nome
        for registro in registros:
            cats = {}
            local = variavel = per = None
            for campo, nome in dimensoes.items():
                valor = registro[campo]
                if nome.startswith(("Município", "Unidade da Federação", "Brasil")):
                    local = valor
                elif nome.startswith("Variável"):
                    variavel = int(valor)
                elif nome.startswith("Ano"):
                    per = valor
                else:
                    cats[nome.replace(" (Código)", "")] = int(valor)
            bruto = registro["V"]
            situacao, valor = None, None
            if bruto == "-":
                valor = 0.0
            elif bruto == "X":
                situacao = "suprimido"
            elif bruto in ("...", ".."):
                situacao = "indisponivel" if bruto == "..." else "nao_se_aplica"
            else:
                try:
                    valor = float(bruto)
                except ValueError:
                    situacao = "indisponivel"
            nivel = "mun" if rotulo.startswith("n6") else ("uf" if rotulo == "n3" else "br")
            if nivel == "uf":
                local = UF_POR_PREFIXO[local]
            elif nivel == "br":
                local = "BR"
            linhas.append({"nivel": nivel, "local": local, "variavel": variavel, "periodo": per, "cats": cats,
                           "valor": valor, "situacao": situacao})
    consultas.append(f"{API}/t/{tabela}/n6/all{base}".replace("%20", " "))
    return linhas


def main():
    territorios = Territorios()
    codigos = set(territorios.por_codigo)
    indicadores, valores, referencias, situacoes = [], {}, {}, {}

    def registrar(definicao, por_local, situacao_por_local=None):
        """por_local: {código do município | UF | 'BR': valor}."""
        ind = definicao["id"]
        indicadores.append(definicao)
        valores[ind] = {k: v for k, v in por_local.items() if k in codigos and v is not None}
        referencias[ind] = {k: v for k, v in por_local.items() if k not in codigos and v is not None}
        situacoes[ind] = {k: v for k, v in (situacao_por_local or {}).items() if k in codigos}
        desconhecidos = [k for k in por_local if len(k) == 7 and k not in codigos]
        if desconhecidos:
            raise RuntimeError(f"{ind}: códigos fora da tabela oficial: {desconhecidos[:5]}")

    def proporcao(linhas, variavel, classe, numeradores, total):
        """% = soma das categorias do numerador / categoria total, por local."""
        num, den, sit = {}, {}, {}
        for l in linhas:
            if l["variavel"] != variavel:
                continue
            categoria = l["cats"][classe]
            if l["situacao"]:
                if categoria == total or categoria in numeradores:
                    sit[l["local"]] = l["situacao"]
                continue
            if categoria == total:
                den[l["local"]] = l["valor"]
            elif categoria in numeradores:
                num[l["local"]] = num.get(l["local"], 0) + l["valor"]
        resultado = {}
        for local, d in den.items():
            if local in sit:
                continue
            if d:
                resultado[local] = round(100 * num.get(local, 0) / d, 2)
        return resultado, sit

    def simples(linhas, variavel, filtro=None, casas=2):
        res, sit = {}, {}
        for l in linhas:
            if l["variavel"] != variavel or (filtro and not filtro(l)):
                continue
            if l["situacao"]:
                sit[l["local"]] = l["situacao"]
            else:
                res[l["local"]] = round(l["valor"], casas)
        return res, sit

    # ---------- População: Censo 2022 e estimativas ----------
    censo = sidra(4714, [93, 6318, 614], 2022)
    estimativas = sidra(6579, [9324], "2024,2025,2026")
    pop = {}
    for l in censo:
        if l["variavel"] == 93 and l["valor"] is not None:
            pop.setdefault(l["local"], {})["2022"] = int(l["valor"])
    for l in estimativas:
        if l["valor"] is not None:
            pop.setdefault(l["local"], {})[l["periodo"]] = int(l["valor"])
    anos_pop = ["2022", "2024", "2025", "2026"]
    gravar_csv(os.path.join(DADOS, "populacao", "municipios.csv"), ["mun"] + [f"p{a}" for a in anos_pop],
               ([c] + [pop[c].get(a, "") for a in anos_pop] for c in sorted(codigos) if c in pop))
    gravar_csv(os.path.join(DADOS, "populacao", "uf.csv"), ["uf"] + [f"p{a}" for a in anos_pop],
               ([u] + [pop[u].get(a, "") for a in anos_pop] for u in ["BR"] + sorted(PREFIXO_POR_UF) if u in pop))
    sem_pop = {a: sorted(c for c in codigos if a not in pop.get(c, {})) for a in anos_pop}
    for a in anos_pop:
        soma = sum(pop[c].get(a, 0) for c in codigos if c in pop)
        print(f"população {a}: soma municipal {soma:,} | Brasil {pop['BR'].get(a, 0):,} | municípios sem valor: {len(sem_pop[a])}")

    area, sit = simples(censo, 6318)
    registrar({"id": "area_km2", "nome": "Área territorial", "dimensao": "Demografia", "unidade": "km²", "ano": 2022,
               "fonte": "ibge_censo2022", "tabela": "SIDRA 4714", "sentido": "neutro", "casas": 1,
               "definicao": "Área da unidade territorial.", "limitacoes": ""}, area, sit)
    dens, sit = simples(censo, 614)
    registrar({"id": "densidade", "nome": "Densidade demográfica", "dimensao": "Demografia", "unidade": "hab./km²", "ano": 2022,
               "fonte": "ibge_censo2022", "tabela": "SIDRA 4714", "sentido": "neutro", "casas": 1,
               "definicao": "População residente dividida pela área territorial.",
               "limitacoes": "Média do município inteiro: não mostra o adensamento dentro da área urbana."}, dens, sit)

    urb = sidra(9923, [93], 2022, {1: [6795, 1]})
    v, sit = proporcao(urb, 93, "Situação do domicílio", {1}, 6795)
    registrar({"id": "pct_urbana", "nome": "População em área urbana", "dimensao": "Demografia", "unidade": "%", "ano": 2022,
               "fonte": "ibge_censo2022", "tabela": "SIDRA 9923", "sentido": "neutro", "casas": 1,
               "definicao": "População residente em situação urbana ÷ população residente total × 100.",
               "limitacoes": "A delimitação urbana segue a legislação municipal vigente no Censo."}, v, sit)

    # ---------- População por sexo e idade (Censo 2022) ----------
    idade = sidra(9514, [93], 2022, {2: [4, 5], 287: sorted(FAIXAS_CENSO), 286: [113635]})
    piramide = {}
    for l in idade:
        if l["valor"] is None:
            continue
        sexo = "M" if l["cats"]["Sexo"] == 4 else "F"
        faixa = FAIXAS_CENSO[l["cats"]["Idade"]]
        chave = (l["local"], sexo, faixa)
        piramide[chave] = piramide.get(chave, 0) + int(l["valor"])
    ordem = [str(i) for i in range(0, 85, 5)]
    for uf, prefixo in sorted(PREFIXO_POR_UF.items()):
        gravar_csv(os.path.join(DADOS, "populacao", "censo2022_idade", f"{uf}.csv"), ["mun", "sexo", "faixa", "pop"],
                   ((k[0], k[1], k[2], n) for k, n in sorted(piramide.items(), key=lambda x: (x[0][0], x[0][1], ordem.index(x[0][2])))
                    if len(k[0]) == 7 and k[0].startswith(prefixo)))
    gravar_csv(os.path.join(DADOS, "populacao", "censo2022_idade_uf.csv"), ["uf", "sexo", "faixa", "pop"],
               ((k[0], k[1], k[2], n) for k, n in sorted(piramide.items(), key=lambda x: (x[0][0], x[0][1], ordem.index(x[0][2])))
                if len(k[0]) != 7))
    total_idade, idosos, criancas = {}, {}, {}
    for (local, _sexo, faixa), n in piramide.items():
        total_idade[local] = total_idade.get(local, 0) + n
        if int(faixa) >= 60:
            idosos[local] = idosos.get(local, 0) + n
        if faixa == "0":
            criancas[local] = criancas.get(local, 0) + n
    divergencias = [c for c in codigos if c in total_idade and total_idade[c] != pop[c].get("2022")]
    print(f"pirâmide etária: {len([k for k in total_idade if len(k) == 7])} municípios; soma por idade ≠ população total em {len(divergencias)}")
    registrar({"id": "pct_60mais", "nome": "População com 60 anos ou mais", "dimensao": "Demografia", "unidade": "%", "ano": 2022,
               "fonte": "ibge_censo2022", "tabela": "SIDRA 9514", "sentido": "neutro", "casas": 1,
               "definicao": "Residentes com 60 anos ou mais ÷ população residente × 100.",
               "limitacoes": "Estrutura etária de 2022; municípios mais envelhecidos tendem a ter mais óbitos por doenças crônicas sem que o risco em cada idade seja maior."},
              {k: round(100 * idosos.get(k, 0) / t, 2) for k, t in total_idade.items() if t})
    registrar({"id": "pct_0a4", "nome": "População de 0 a 4 anos", "dimensao": "Demografia", "unidade": "%", "ano": 2022,
               "fonte": "ibge_censo2022", "tabela": "SIDRA 9514", "sentido": "neutro", "casas": 1,
               "definicao": "Residentes de 0 a 4 anos ÷ população residente × 100.", "limitacoes": "Estrutura etária de 2022."},
              {k: round(100 * criancas.get(k, 0) / t, 2) for k, t in total_idade.items() if t})

    # ---------- Água, esgoto e resíduos (Censo 2022) ----------
    agua = sidra(6803, [381], 2022, {1821: [72129, 72144, 72153]})
    v, sit = proporcao(agua, 381, "Existência de ligação à rede geral de distribuição de água e principal forma de abastecimento de água", {72144}, 72129)
    registrar({"id": "agua_rede", "nome": "Domicílios abastecidos principalmente pela rede geral de água", "dimensao": "Água, esgoto e resíduos",
               "unidade": "%", "ano": 2022, "fonte": "ibge_censo2022", "tabela": "SIDRA 6803", "sentido": "menor_pior", "casas": 1,
               "definicao": "Domicílios particulares permanentes ocupados que possuem ligação à rede geral e a usam como forma principal ÷ total de domicílios × 100.",
               "limitacoes": "Não mede intermitência, tratamento nem qualidade da água. Poço ou nascente não significam, por si, água insegura."}, v, sit)
    v, sit = proporcao(agua, 381, "Existência de ligação à rede geral de distribuição de água e principal forma de abastecimento de água", {72153}, 72129)
    registrar({"id": "agua_sem_rede", "nome": "Domicílios sem ligação à rede geral de água", "dimensao": "Água, esgoto e resíduos",
               "unidade": "%", "ano": 2022, "fonte": "ibge_censo2022", "tabela": "SIDRA 6803", "sentido": "maior_pior", "casas": 1,
               "definicao": "Domicílios sem ligação com a rede geral de distribuição ÷ total de domicílios × 100.",
               "limitacoes": "Inclui poços profundos e outras soluções que podem ser adequadas; não mede a qualidade da água consumida."}, v, sit)
    esgoto = sidra(6805, [381], 2022, {11558: [46292, 46290, 72112, 72113, 92858, 72114, 72115, 92861]})
    classe = "Tipo de esgotamento sanitário"
    v, sit = proporcao(esgoto, 381, classe, {46290}, 46292)
    registrar({"id": "esgoto_rede", "nome": "Domicílios com esgoto ligado à rede geral ou pluvial", "dimensao": "Água, esgoto e resíduos",
               "unidade": "%", "ano": 2022, "fonte": "ibge_censo2022", "tabela": "SIDRA 6805", "sentido": "menor_pior", "casas": 1,
               "definicao": "Domicílios com esgotamento por rede geral, rede pluvial ou fossa ligada à rede ÷ total de domicílios × 100.",
               "limitacoes": "Coleta não significa tratamento: o Censo não informa se o esgoto coletado é tratado."}, v, sit)
    v, sit = proporcao(esgoto, 381, classe, {72113, 92858, 72114, 72115, 92861}, 46292)
    registrar({"id": "esgoto_precario", "nome": "Domicílios com esgotamento precário ou sem banheiro", "dimensao": "Água, esgoto e resíduos",
               "unidade": "%", "ano": 2022, "fonte": "ibge_censo2022", "tabela": "SIDRA 6805", "sentido": "maior_pior", "casas": 1,
               "definicao": "Domicílios com fossa rudimentar ou buraco, vala, lançamento em rio, lago, córrego ou mar, outra forma, ou sem banheiro nem sanitário ÷ total de domicílios × 100. Agrupamento definido neste projeto a partir das categorias do Censo.",
               "limitacoes": "Fossa séptica não ligada à rede fica fora do numerador. Indicador domiciliar: não mede contato efetivo das pessoas com esgoto."}, v, sit)
    v, sit = proporcao(esgoto, 381, classe, {92861}, 46292)
    registrar({"id": "sem_banheiro", "nome": "Domicílios sem banheiro nem sanitário", "dimensao": "Água, esgoto e resíduos",
               "unidade": "%", "ano": 2022, "fonte": "ibge_censo2022", "tabela": "SIDRA 6805", "sentido": "maior_pior", "casas": 2,
               "definicao": "Domicílios que não tinham banheiro nem sanitário ÷ total de domicílios × 100.", "limitacoes": ""}, v, sit)
    lixo = sidra(6892, [381], 2022, {67: [10972, 2520, 72122, 72124]})
    v, sit = proporcao(lixo, 381, "Destino do lixo", {2520}, 10972)
    registrar({"id": "lixo_coletado", "nome": "Domicílios com lixo coletado", "dimensao": "Água, esgoto e resíduos",
               "unidade": "%", "ano": 2022, "fonte": "ibge_censo2022", "tabela": "SIDRA 6892", "sentido": "menor_pior", "casas": 1,
               "definicao": "Domicílios com lixo coletado no domicílio ou em caçamba de serviço de limpeza ÷ total de domicílios × 100.",
               "limitacoes": "Não informa frequência da coleta nem a destinação final dos resíduos."}, v, sit)
    v, sit = proporcao(lixo, 381, "Destino do lixo", {72122, 72124}, 10972)
    registrar({"id": "lixo_queimado_ou_jogado", "nome": "Domicílios que queimam o lixo ou o jogam em terreno ou área pública", "dimensao": "Água, esgoto e resíduos",
               "unidade": "%", "ano": 2022, "fonte": "ibge_censo2022", "tabela": "SIDRA 6892", "sentido": "maior_pior", "casas": 1,
               "definicao": "Domicílios com lixo queimado na propriedade ou jogado em terreno baldio, encosta ou área pública ÷ total de domicílios × 100.",
               "limitacoes": ""}, v, sit)

    # ---------- Vulnerabilidade social (Censo 2022) ----------
    alfa = sidra(9543, [2513], 2022, {2: [6794], 86: [95251], 287: [100362]})
    v, sit = simples(alfa, 2513)
    registrar({"id": "alfabetizacao", "nome": "Taxa de alfabetização (15 anos ou mais)", "dimensao": "Vulnerabilidade social",
               "unidade": "%", "ano": 2022, "fonte": "ibge_censo2022", "tabela": "SIDRA 9543", "sentido": "menor_pior", "casas": 1,
               "definicao": "Pessoas de 15 anos ou mais que sabem ler e escrever ÷ pessoas de 15 anos ou mais × 100 (taxa publicada pelo IBGE).",
               "limitacoes": "Alfabetização declarada; não mede anos de estudo nem letramento em saúde."}, v, sit)
    renda = sidra(10295, [13431, 13534], 2022, {2: [6794], 86: [95251], 58: [95253]})
    v, sit = simples(renda, 13431)
    registrar({"id": "renda_media", "nome": "Rendimento domiciliar per capita médio", "dimensao": "Vulnerabilidade social",
               "unidade": "R$ por mês", "ano": 2022, "fonte": "ibge_censo2022", "tabela": "SIDRA 10295", "sentido": "menor_pior", "casas": 0,
               "definicao": "Valor do rendimento nominal médio mensal domiciliar per capita dos moradores em domicílios particulares permanentes (Censo 2022, amostra).",
               "limitacoes": "Valor nominal de 2022, sem correção. A média é puxada por rendas altas; veja também a mediana. Resultado da amostra do Censo."}, v, sit)
    v, sit = simples(renda, 13534)
    registrar({"id": "renda_mediana", "nome": "Rendimento domiciliar per capita mediano", "dimensao": "Vulnerabilidade social",
               "unidade": "R$ por mês", "ano": 2022, "fonte": "ibge_censo2022", "tabela": "SIDRA 10295", "sentido": "menor_pior", "casas": 0,
               "definicao": "Valor do rendimento nominal mediano mensal domiciliar per capita: metade dos moradores vive com até esse valor (Censo 2022, amostra).",
               "limitacoes": "Valor nominal de 2022, sem correção. Não é uma medida de pobreza oficial. Resultado da amostra do Censo."}, v, sit)
    moradores = sidra(9877, [9325], 2022, {11561: [100679], 12237: [104570], 11562: [72593]})
    v, sit = simples(moradores, 9325)
    registrar({"id": "moradores_por_domicilio", "nome": "Média de moradores por domicílio", "dimensao": "Vulnerabilidade social",
               "unidade": "pessoas", "ano": 2022, "fonte": "ibge_censo2022", "tabela": "SIDRA 9877", "sentido": "neutro", "casas": 2,
               "definicao": "Média de moradores em domicílios particulares.",
               "limitacoes": "Indicador indireto de adensamento domiciliar: não considera o número de cômodos ou dormitórios."}, v, sit)

    # ---------- Atividade econômica (PIB dos Municípios) ----------
    pib = sidra(5938, [498, 513, 517, 6575, 525], 2021)
    vab, setores = {}, {513: {}, 517: {}, 6575: {}, 525: {}}
    for l in pib:
        if l["valor"] is None:
            continue
        if l["variavel"] == 498:
            vab[l["local"]] = l["valor"]
        else:
            setores[l["variavel"]][l["local"]] = l["valor"]
    for variavel, ident, nome in ((513, "vab_agropecuaria", "agropecuária"), (517, "vab_industria", "indústria"),
                                  (6575, "vab_servicos", "serviços (exceto setor público)"), (525, "vab_adm_publica", "administração, saúde e educação públicas")):
        registrar({"id": ident, "nome": f"Participação da {nome} no valor adicionado", "dimensao": "Trabalho e exposições",
                   "unidade": "%", "ano": 2021, "fonte": "ibge_pib_municipios", "tabela": "SIDRA 5938", "sentido": "neutro", "casas": 1,
                   "definicao": f"Valor adicionado bruto da {nome} ÷ valor adicionado bruto total do município × 100.",
                   "limitacoes": "Indicador indireto do perfil econômico. Não mede número de trabalhadores nem exposição ocupacional; o valor pode ser atribuído ao município da sede da empresa."},
                  {k: round(100 * setores[variavel].get(k, 0) / t, 2) for k, t in vab.items() if t > 0},
                  # Valor adicionado total negativo ou nulo: a participação não tem interpretação.
                  {k: "nao_se_aplica" for k, t in vab.items() if t <= 0})

    gravar_json(os.path.join(BRUTOS, "partes", "ibge.json"), {
        "indicadores": indicadores, "valores": valores, "referencias": referencias, "situacoes": situacoes})

    comum_manifesto = {
        "instituicao": "IBGE",
        "licenca": "Dados públicos do IBGE; uso livre com citação da fonte.",
        "granularidade": "município, UF e Brasil",
        "valores_ausentes": "'-' no SIDRA é zero; 'X' é valor suprimido para evitar identificação; '...' é indisponível. Suprimidos e indisponíveis ficam vazios nos arquivos e listados em dados/indicadores/situacoes.json.",
        "comando_atualizacao": "python3 scripts/preparar_ibge.py --refazer && python3 scripts/montar_indicadores.py",
    }
    gravar_manifesto("ibge_censo2022", {
        **comum_manifesto,
        "titulo": "Censo Demográfico 2022 — população, idade, domicílios, saneamento, alfabetização e rendimento",
        "pagina": "https://sidra.ibge.gov.br/pesquisa/censo-demografico/demografico-2022/inicial",
        "recursos": [c for c in consultas if "/t/6579/" not in c and "/t/5938/" not in c],
        "versao": "Resultados do universo e da amostra disponíveis no SIDRA na data da coleta",
        "periodo_referencia": "2022 (data de referência: 1º de agosto de 2022)",
        "unidade": "pessoas, domicílios, % e R$",
        "definicao": "Tabelas SIDRA 4714, 9923, 9514, 6803, 6805, 6892, 9543, 10295 e 9877.",
        "cobertura": f"{len(valores['densidade'])} municípios com população e área; ver cobertura por indicador em dados/indicadores/dicionario.json",
        "campos": {i["id"]: f'{i["nome"]} ({i["unidade"]})' for i in indicadores if i["fonte"] == "ibge_censo2022"},
        "limitacoes": "Retrato de 2022: usado como contexto para eventos de saúde de anos posteriores, com a defasagem indicada. Rendimento vem da amostra do Censo.",
        "arquivos_gerados": ["dados/populacao/municipios.csv (coluna p2022)", "dados/populacao/censo2022_idade/*.csv", "dados/indicadores/municipios.csv"],
    })
    gravar_manifesto("ibge_estimativas_populacao", {
        **comum_manifesto,
        "titulo": "Estimativas da população residente (EstimaPop)",
        "pagina": "https://sidra.ibge.gov.br/tabela/6579",
        "recursos": [c for c in consultas if "/t/6579/" in c],
        "versao": "Tabela SIDRA 6579",
        "periodo_referencia": "2024, 2025 e 2026 (data de referência: 1º de julho de cada ano). Não há estimativa publicada para 2023.",
        "unidade": "pessoas",
        "definicao": "População residente estimada, total do município. Não há estimativa anual por idade e sexo para municípios.",
        "cobertura": "; ".join(f"{a}: {len(codigos) - len(sem_pop[a])} municípios" for a in anos_pop[1:]),
        "campos": {"mun": "código IBGE", "p2024…p2026": "população estimada"},
        "limitacoes": "Sem recorte de idade ou sexo: taxas específicas por idade usam a população do Censo 2022. Para 2023 o painel usa o Censo 2022 e indica a defasagem.",
        "arquivos_gerados": ["dados/populacao/municipios.csv", "dados/populacao/uf.csv"],
    })
    gravar_manifesto("ibge_pib_municipios", {
        **comum_manifesto,
        "titulo": "Produto Interno Bruto dos Municípios — valor adicionado por atividade",
        "pagina": "https://sidra.ibge.gov.br/tabela/5938",
        "recursos": [c for c in consultas if "/t/5938/" in c],
        "versao": "Tabela SIDRA 5938 (referência 2010)",
        "periodo_referencia": "2021 (último ano com valores nesta tabela; 2022 e 2023 constam como indisponíveis no SIDRA)",
        "unidade": "% do valor adicionado bruto",
        "definicao": "Participação de agropecuária, indústria, serviços e administração pública no valor adicionado bruto municipal.",
        "cobertura": f"{len(valores['vab_agropecuaria'])} municípios",
        "campos": {i["id"]: i["nome"] for i in indicadores if i["fonte"] == "ibge_pib_municipios"},
        "limitacoes": "Perfil econômico não é medida de exposição ocupacional.",
        "arquivos_gerados": ["dados/indicadores/municipios.csv"],
    })
    gravar_json(os.path.join(DADOS, "relatorios", "populacao.json"), {
        "gerado_em": hoje(),
        "municipios_sem_populacao": {a: [f'{c} {territorios.por_codigo[c]["n"]}/{territorios.por_codigo[c]["uf"]}' for c in v] for a, v in sem_pop.items()},
        "soma_por_idade_diferente_do_total_2022": divergencias,
        "regra_denominador": "Óbitos e internações de 2024, 2025 e 2026 usam a estimativa do mesmo ano; 2023 usa o Censo 2022 (sem estimativa oficial para 2023). Taxas por idade e a padronização usam a pirâmide do Censo 2022.",
    }, compacto=False)
    print(f"{len(indicadores)} indicadores do IBGE preparados")
    for i in indicadores:
        print(f'  {i["id"]}: {len(valores[i["id"]])} municípios; BR = {referencias[i["id"]].get("BR")}; não numéricos: {len(situacoes[i["id"]])}')


if __name__ == "__main__":
    main()
