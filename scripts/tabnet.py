"""Cliente mínimo do TabNet (DATASUS) — consulta os tabuladores públicos oficiais.

O TabNet recebe um formulário (POST) e devolve a tabela em texto separado por ';'
quando formato=prn. Todas as seleções ficam em "todas as categorias", exceto as
informadas em `filtros`. Os textos usam ISO-8859-1.
"""

import html
import os
import re
import time
import urllib.parse

from comum import BRUTOS, baixar

BASE = "http://tabnet.datasus.gov.br/cgi/"


def formulario(definicao, refazer=False):
    """Baixa o formulário e devolve {nome do campo: [(valor, rótulo)]}."""
    destino = os.path.join(BRUTOS, "tabnet", definicao.replace("/", "_") + ".form.html")
    baixar(f"{BASE}deftohtm.exe?{definicao}", destino, refazer=refazer)
    texto = open(destino, encoding="latin1").read()
    campos = {}
    for nome, corpo in re.findall(r'<select[^>]*name="?([^" >]+)"?[^>]*>(.*?)</select>', texto, re.S | re.I):
        opcoes = re.findall(r'<option value="?([^">]*)"?[^>]*>([^<\r\n]*)', corpo, re.I)
        campos[html.unescape(nome)] = [(html.unescape(v.strip()), html.unescape(r.strip())) for v, r in opcoes]
    return campos


def consultar(definicao, linha, coluna, incremento, arquivos, destino, filtros=None, refazer=False):
    """Executa a tabulação e grava a resposta bruta em `destino`. Devolve (cabeçalho, linhas)."""
    if not os.path.exists(destino) or refazer:
        campos = formulario(definicao)
        for nome, valor in (("Linha", linha), ("Coluna", coluna), ("Incremento", incremento)):
            if valor not in [v for v, _ in campos[nome]]:
                raise RuntimeError(f"TabNet {definicao}: opção '{valor}' não existe em {nome}.")
        disponiveis = {v for v, _ in campos["Arquivos"]}
        ausentes = [a for a in arquivos if a not in disponiveis]
        if ausentes:
            raise RuntimeError(f"TabNet {definicao}: arquivos indisponíveis: {ausentes}")
        pares = [("Linha", linha), ("Coluna", coluna), ("Incremento", incremento)]
        pares += [("Arquivos", a) for a in arquivos]
        for nome in campos:
            if nome.startswith("S"):
                pares.append((nome, (filtros or {}).get(nome, "TODAS_AS_CATEGORIAS__")))
        pares += [("zeradas", "exibirlz"), ("formato", "prn"), ("mostre", "Mostra")]
        corpo = "&".join(f"{urllib.parse.quote(k, encoding='latin1')}={urllib.parse.quote(v, encoding='latin1')}" for k, v in pares)
        baixar(f"{BASE}tabcgi.exe?{definicao}", destino, refazer=True, dados=corpo.encode("ascii"), timeout=600,
               cabecalhos={"Content-Type": "application/x-www-form-urlencoded"})
        time.sleep(1)  # respeita o serviço público
    texto = open(destino, encoding="latin1").read()
    bloco = re.search(r"<PRE>(.*?)</PRE>", texto, re.S | re.I)
    if not bloco:
        raise RuntimeError(f"TabNet {definicao}: resposta sem tabela (veja {destino}).")
    registros = [l.rstrip("\r") for l in html.unescape(bloco.group(1)).split("\n") if ";" in l]
    cabecalho = [c.strip().strip('"') for c in registros[0].split(";")]
    linhas = [[c.strip().strip('"') for c in l.split(";")] for l in registros[1:]]
    return cabecalho, linhas


def numero(texto):
    """'-' no TabNet significa zero; valores usam ponto como separador de milhar."""
    texto = texto.strip()
    if texto in ("-", ""):
        return 0
    return int(texto.replace(".", ""))
