#!/usr/bin/env python3
"""Importa a base tratada (dados/) para MySQL ou MariaDB e confere a carga.

Etapas:
  1. cria o banco (padrão: saude_territorio) e as tabelas de sql/esquema.sql;
  2. converte cada arquivo da base para o formato das tabelas (formato longo,
     sem linhas para valores ausentes) e carrega com LOAD DATA LOCAL INFILE;
     com --insert, usa INSERT em lotes (quando o servidor não aceita LOAD DATA LOCAL);
  3. confere, tabela por tabela, o número de linhas e a soma da medida principal
     contra os arquivos de origem; a importação falha se algo não bater.

Com --gerar-sql ARQUIVO, só grava um script SQL completo (esquema + INSERTs),
sem conectar, para importar depois em outra máquina (ex.: MySQL Workbench).

Uso:
  python3 scripts/importar_mysql.py -- -u USUARIO -p
  python3 scripts/importar_mysql.py --banco outro_nome -- -h 127.0.0.1 -u root -p
  python3 scripts/importar_mysql.py --insert -- --socket=/caminho/mysql.sock
  python3 scripts/importar_mysql.py --gerar-sql saude_territorio.sql
Os argumentos depois de "--" vão direto para o cliente mysql/mariadb.
"""

import argparse
import csv
import datetime
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile

from comum import DADOS, FREQUENCIA_FONTE, NOME_UF, RAIZ, UF_POR_PREFIXO, ler_json

ESQUEMA = os.path.join(RAIZ, "sql", "esquema.sql")


def br(numero):
    """Número com separador de milhar brasileiro."""
    return f"{numero:,.0f}".replace(",", ".")


def ler_csv(caminho):
    with open(caminho, encoding="utf-8", newline="") as arquivo:
        return list(csv.DictReader(arquivo, delimiter=";"))


def versao_dados():
    with open(os.path.join(RAIZ, "assets", "js", "config.js"), encoding="utf-8") as arquivo:
        for linha in arquivo:
            if "DATA_VERSION" in linha and "=" in linha:
                return linha.split('"')[1]
    return "desconhecida"


# ---------- Tabelas: (nome, colunas, linhas, coluna somada na conferência) ----------
def tabelas():
    saida = []
    ref = os.path.join(DADOS, "referencia")

    saida.append(("uf", ["sigla", "codigo_ibge", "nome"],
                  [[uf, prefixo, NOME_UF[uf]] for prefixo, uf in sorted(UF_POR_PREFIXO.items())], None))
    municipios = ler_json(os.path.join(ref, "municipios.json"))["municipios"]
    saida.append(("municipio", ["codigo_ibge", "nome", "uf"], [[m["c"], m["n"], m["uf"]] for m in municipios], None))

    pop = []
    for arquivo, chave in (("municipios.csv", "mun"), ("uf.csv", "uf")):
        for linha in ler_csv(os.path.join(DADOS, "populacao", arquivo)):
            for coluna, valor in linha.items():
                if coluna == chave or not valor:          # ausente: sem linha
                    continue
                ano = int(coluna[1:])
                pop.append([linha[chave], ano, int(valor), "IBGE, Censo 2022" if ano == 2022 else "IBGE, estimativa da população"])
    saida.append(("populacao", ["local", "ano", "populacao", "fonte"], pop, "populacao"))

    idade = []
    for caminho in sorted(glob.glob(os.path.join(DADOS, "populacao", "censo2022_idade", "*.csv"))):
        idade += [[l["mun"], l["sexo"], int(l["faixa"]), int(l["pop"])] for l in ler_csv(caminho)]
    idade += [[l["uf"], l["sexo"], int(l["faixa"]), int(l["pop"])] for l in ler_csv(os.path.join(DADOS, "populacao", "censo2022_idade_uf.csv"))]
    saida.append(("populacao_censo_idade", ["local", "sexo", "faixa", "populacao"], idade, "populacao"))

    cid = ler_json(os.path.join(ref, "cid10.json"))
    saida.append(("cid_capitulo", ["numero", "romano", "cod_inicio", "cod_fim", "nome", "natureza"],
                  [[c["n"], c["rom"], c["ini"], c["fim"], c["nome"], c["tipo"]] for c in cid["capitulos"]], None))
    saida.append(("cid_grupo", ["id", "cod_inicio", "cod_fim", "nome", "capitulo"],
                  [[i, g["ini"], g["fim"], g["nome"], g["cap"]] for i, g in enumerate(cid["grupos"])], None))
    saida.append(("cid_categoria", ["codigo", "nome", "grupo_id", "capitulo", "marcador", "suplemento"],
                  [[c[0], c[1], c[2], cid["grupos"][c[2]]["cap"], c[3] or None, int(bool(c[4]))] for c in cid["categorias"]], None))

    sim = os.path.join(DADOS, "saude", "sim")
    anos_sim = sorted(os.path.basename(p) for p in glob.glob(os.path.join(sim, "[0-9]" * 4)))
    obitos, perfil, uf_cid, uf_mes = [], [], [], []
    for ano in anos_sim:
        for caminho in sorted(glob.glob(os.path.join(sim, ano, "mun", "*.csv"))):
            obitos += [[int(ano), l["mun"], l["cid3"], int(l["n"])] for l in ler_csv(caminho)]
        for caminho in sorted(glob.glob(os.path.join(sim, ano, "perfil", "*.csv"))):
            perfil += [[int(ano), l["mun"], int(l["cap"]), l["sexo"], l["faixa"], int(l["n"])] for l in ler_csv(caminho)]
        uf_cid += [[int(ano), l["uf"], l["cid"], int(l["n"])] for l in ler_csv(os.path.join(sim, ano, "uf_cid.csv"))]
        uf_mes += [[int(ano), l["uf"], int(l["cap"]), int(l["mes"]), int(l["n"])] for l in ler_csv(os.path.join(sim, ano, "uf_mes.csv"))]
    saida.append(("obito_municipio_cid", ["ano", "codigo_ibge", "cid3", "obitos"], obitos, "obitos"))
    saida.append(("obito_municipio_perfil", ["ano", "codigo_ibge", "capitulo", "sexo", "faixa", "obitos"], perfil, "obitos"))
    saida.append(("obito_uf_cid", ["ano", "uf", "cid", "obitos"], uf_cid, "obitos"))
    saida.append(("obito_uf_mes", ["ano", "uf", "capitulo", "mes", "obitos"], uf_mes, "obitos"))

    sih = []
    for caminho in sorted(glob.glob(os.path.join(DADOS, "saude", "sih", "[0-9]" * 4 + ".csv"))):
        ano = int(os.path.basename(caminho)[:4])
        sih += [[ano, l["mun"], int(l["cap"]), int(l["n"])] for l in ler_csv(caminho)]
    saida.append(("internacao_municipio_capitulo", ["ano", "codigo_ibge", "capitulo", "internacoes"], sih, "internacoes"))
    saida.append(("dengue_municipio", ["ano", "codigo_ibge", "casos_provaveis"],
                  [[int(l["ano"]), l["mun"], int(l["n"])] for l in ler_csv(os.path.join(DADOS, "saude", "dengue", "casos.csv"))], "casos_provaveis"))

    dic = ler_json(os.path.join(DADOS, "indicadores", "dicionario.json"))
    saida.append(("indicador", ["id", "nome", "dimensao", "unidade", "ano_referencia", "fonte", "tabela", "sentido", "definicao", "limitacoes"],
                  [[i["id"], i["nome"], i["dimensao"], i["unidade"], i["ano"], i["fonte"], i["tabela"], i["sentido"], i["definicao"], i.get("limitacoes") or None]
                   for i in dic["indicadores"]], None))
    valores = []
    for linha in ler_csv(os.path.join(DADOS, "indicadores", "municipios.csv")):
        for i in dic["indicadores"]:
            if linha[i["id"]] not in ("", None):          # ausente: sem linha
                valores.append([linha["mun"], i["id"], linha[i["id"]]])
    saida.append(("indicador_valor", ["codigo_ibge", "indicador_id", "valor"], valores, "valor"))
    saida.append(("lacuna_dados", ["dimensao", "situacao", "motivo"], [[l["dimensao"], l["situacao"], l["motivo"]] for l in dic["lacunas"]], None))

    outliers = ler_csv(os.path.join(DADOS, "relatorios", "outliers.csv"))
    saida.append(("outlier", ["tipo", "medida", "ano", "codigo_ibge", "valor", "limite_inferior", "limite_superior", "metodo", "decisao"],
                  [[o["tipo"], o["medida"], o["ano"], o["codigo_ibge"], o["valor"], o["limite_inferior"] or None, o["limite_superior"] or None, o["metodo"], o["decisao"]]
                   for o in outliers], None))

    indice = ler_json(os.path.join(DADOS, "manifestos", "indice.json"))
    saida.append(("fonte", ["id", "titulo", "instituicao", "pagina", "licenca", "periodo_referencia", "frequencia_fonte", "coletado_em"],
                  [[m["id"], m["titulo"], m["instituicao"], m["pagina"], m.get("licenca"), m.get("periodo_referencia"),
                    FREQUENCIA_FONTE.get(m["id"]), m["coletado_em"]] for m in indice["fontes"]], None))
    cobertura = ler_json(os.path.join(DADOS, "relatorios", "cobertura.json"))
    saida.append(("controle_carga", ["carregado_em", "dados_gerados_em", "versao_dados", "observacao"],
                  [[datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), cobertura["gerado_em"], versao_dados(),
                    "Carga completa por scripts/importar_mysql.py"]], None))
    return saida


# ---------- Formatação ----------
def tsv(valor):
    if valor is None:
        return "\\N"
    return str(valor).replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n")


def literal(valor):
    if valor is None:
        return "NULL"
    if isinstance(valor, (int, float)):
        return str(valor)
    return "'" + str(valor).replace("\\", "\\\\").replace("'", "''") + "'"


def inserts(nome, colunas, linhas, lote=2000):
    for i in range(0, len(linhas), lote):
        valores = ",\n".join("(" + ",".join(literal(v) for v in linha) + ")" for linha in linhas[i:i + lote])
        yield f"INSERT INTO {nome} ({', '.join(colunas)}) VALUES\n{valores};\n"


def script_sql(banco, dados, modo, pasta_tmp):
    """Gera o script de carga como uma sequência de pedaços de texto."""
    yield f"CREATE DATABASE IF NOT EXISTS `{banco}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\nUSE `{banco}`;\n"
    yield "SET sql_notes = 0;\n"          # silencia "tabela inexistente" do DROP IF EXISTS
    with open(ESQUEMA, encoding="utf-8") as arquivo:
        yield arquivo.read() + "\n"
    yield "SET sql_notes = 1;\n"
    yield "SET FOREIGN_KEY_CHECKS = 0;\nSET UNIQUE_CHECKS = 0;\nSET autocommit = 0;\n"
    for nome, colunas, linhas, _ in dados:
        if modo == "load":
            caminho = os.path.join(pasta_tmp, f"{nome}.tsv")
            with open(caminho, "w", encoding="utf-8", newline="") as arquivo:
                for linha in linhas:
                    arquivo.write("\t".join(tsv(v) for v in linha) + "\n")
            yield (f"LOAD DATA LOCAL INFILE {literal(caminho)} INTO TABLE {nome} CHARACTER SET utf8mb4\n"
                   f"  FIELDS TERMINATED BY '\\t' ESCAPED BY '\\\\' LINES TERMINATED BY '\\n' ({', '.join(colunas)});\n")
        else:
            yield from inserts(nome, colunas, linhas)
        yield "COMMIT;\n"
    yield "SET FOREIGN_KEY_CHECKS = 1;\nSET UNIQUE_CHECKS = 1;\nSET autocommit = 1;\n"


def cliente():
    for nome in ("mariadb", "mysql"):
        if shutil.which(nome):
            return nome
    raise SystemExit("Cliente mysql/mariadb não encontrado no PATH.")


def consultar(base_cmd, banco, sql):
    r = subprocess.run([*base_cmd, "-N", "-B", banco, "-e", sql], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"Falha na consulta de conferência: {r.stderr.strip()}")
    return r.stdout.strip()


def main():
    if "--" in sys.argv:
        corte = sys.argv.index("--")
        meus, do_cliente = sys.argv[1:corte], sys.argv[corte + 1:]
    else:
        meus, do_cliente = sys.argv[1:], []
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--banco", default="saude_territorio")
    ap.add_argument("--insert", action="store_true", help="usar INSERT em lotes em vez de LOAD DATA LOCAL INFILE")
    ap.add_argument("--gerar-sql", metavar="ARQUIVO", help="só gravar o script SQL completo, sem conectar")
    args = ap.parse_args(meus)

    print("Lendo a base tratada em dados/ ...", flush=True)
    dados = tabelas()
    total = sum(len(t[2]) for t in dados)
    print(f"{len(dados)} tabelas, {br(total)} linhas", flush=True)

    if args.gerar_sql:
        with open(args.gerar_sql, "w", encoding="utf-8") as saida:
            for pedaco in script_sql(args.banco, dados, "insert", None):
                saida.write(pedaco)
        print(f"Script gravado em {args.gerar_sql}")
        return

    base_cmd = [cliente(), "--local-infile=1", "--default-character-set=utf8mb4", *do_cliente]
    modo = "insert" if args.insert else "load"
    with tempfile.TemporaryDirectory(prefix="carga_saude_") as pasta_tmp:
        processo = subprocess.Popen([*base_cmd, "--show-warnings"], stdin=subprocess.PIPE, text=True, encoding="utf-8")
        try:
            for pedaco in script_sql(args.banco, dados, modo, pasta_tmp):
                processo.stdin.write(pedaco)
            processo.stdin.close()
        except BrokenPipeError:
            pass
        if processo.wait() != 0:
            dica = "" if args.insert else " Se o servidor recusou LOAD DATA LOCAL, ative local_infile=1 ou rode de novo com --insert."
            raise SystemExit(f"A carga falhou (veja a mensagem do cliente acima).{dica}")

    # ---------- Conferência ----------
    print("Conferindo a carga ...", flush=True)
    falhas = 0
    for nome, colunas, linhas, medida in dados:
        consulta = f"SELECT COUNT(*){f', COALESCE(SUM({medida}), 0)' if medida else ''} FROM {nome}"
        resultado = consultar(base_cmd, args.banco, consulta).split("\t")
        esperado_linhas = len(linhas)
        ok = int(resultado[0]) == esperado_linhas
        texto = f"{nome}: {br(int(resultado[0]))} linhas"
        if medida:
            indice = colunas.index(medida)
            soma = sum(float(l[indice]) for l in linhas)
            ok = ok and abs(float(resultado[1]) - soma) <= 1e-4 * len(linhas) + 0.01   # arredondamento de DECIMAL(16,4)
            texto += f", soma de {medida} = {br(float(resultado[1]))}"
        print(("  ok    " if ok else "  FALHA ") + texto + ("" if ok else f" (esperado: {esperado_linhas} linhas)"))
        falhas += not ok
    if falhas:
        raise SystemExit(f"{falhas} tabela(s) não conferem com os arquivos de origem.")
    print(f"Carga conferida: banco `{args.banco}` pronto.")


if __name__ == "__main__":
    main()
