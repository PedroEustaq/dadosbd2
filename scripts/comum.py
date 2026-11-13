"""Funções compartilhadas pelos scripts de preparação dos dados.

Somente biblioteca padrão. Todos os caminhos são relativos à raiz do repositório,
de modo que os scripts podem ser executados de qualquer pasta.
"""

import csv
import datetime
import gzip
import json
import os
import time
import unicodedata
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRUTOS = os.path.join(RAIZ, "dados", "brutos")
DADOS = os.path.join(RAIZ, "dados")
MANIFESTOS = os.path.join(DADOS, "manifestos")
RELATORIOS = os.path.join(DADOS, "relatorios")

UF_POR_PREFIXO = {
    "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
    "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA",
    "31": "MG", "32": "ES", "33": "RJ", "35": "SP", "41": "PR", "42": "SC", "43": "RS",
    "50": "MS", "51": "MT", "52": "GO", "53": "DF",
}
PREFIXO_POR_UF = {uf: prefixo for prefixo, uf in UF_POR_PREFIXO.items()}
NOME_UF = {
    "AC": "Acre", "AL": "Alagoas", "AP": "Amapá", "AM": "Amazonas", "BA": "Bahia", "CE": "Ceará",
    "DF": "Distrito Federal", "ES": "Espírito Santo", "GO": "Goiás", "MA": "Maranhão", "MT": "Mato Grosso",
    "MS": "Mato Grosso do Sul", "MG": "Minas Gerais", "PA": "Pará", "PB": "Paraíba", "PR": "Paraná",
    "PE": "Pernambuco", "PI": "Piauí", "RJ": "Rio de Janeiro", "RN": "Rio Grande do Norte",
    "RS": "Rio Grande do Sul", "RO": "Rondônia", "RR": "Roraima", "SC": "Santa Catarina",
    "SP": "São Paulo", "SE": "Sergipe", "TO": "Tocantins",
}

AGENTE = "painel-saude-territorial/1.0 (script de preparacao de dados publicos)"


def hoje():
    return datetime.date.today().isoformat()


def normalizar(texto):
    """Maiúsculas, sem acentos, sem pontuação e com espaços simples."""
    texto = unicodedata.normalize("NFD", str(texto or ""))
    texto = "".join(c for c in texto if unicodedata.category(c) != "Mn").upper()
    texto = "".join(c if c.isalnum() else " " for c in texto)
    return " ".join(texto.split())


def garantir_pasta(caminho):
    os.makedirs(caminho, exist_ok=True)
    return caminho


def baixar(url, destino, refazer=False, tentativas=4, espera=5, timeout=180, dados=None, cabecalhos=None):
    """Baixa `url` para `destino`. Reaproveita o arquivo existente (retomada simples)."""
    if os.path.exists(destino) and os.path.getsize(destino) > 0 and not refazer:
        return destino
    garantir_pasta(os.path.dirname(destino))
    ultimo_erro = None
    for tentativa in range(1, tentativas + 1):
        try:
            requisicao = urllib.request.Request(url, data=dados, headers={"User-Agent": AGENTE, **(cabecalhos or {})})
            with urllib.request.urlopen(requisicao, timeout=timeout) as resposta, open(destino + ".parcial", "wb") as saida:
                fluxo = gzip.GzipFile(fileobj=resposta) if resposta.headers.get("Content-Encoding") == "gzip" else resposta
                while True:
                    bloco = fluxo.read(1 << 20)
                    if not bloco:
                        break
                    saida.write(bloco)
            os.replace(destino + ".parcial", destino)
            return destino
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as erro:
            ultimo_erro = erro
            print(f"  tentativa {tentativa}/{tentativas} falhou para {url}: {erro}")
            time.sleep(espera * tentativa)
    raise RuntimeError(f"Não foi possível baixar {url}: {ultimo_erro}")


def ler_json(caminho):
    with open(caminho, encoding="utf-8") as arquivo:
        return json.load(arquivo)


def gravar_json(caminho, dados, compacto=True):
    garantir_pasta(os.path.dirname(caminho))
    with open(caminho, "w", encoding="utf-8") as arquivo:
        if compacto:
            json.dump(dados, arquivo, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(dados, arquivo, ensure_ascii=False, indent=2)
            arquivo.write("\n")


def gravar_csv(caminho, cabecalho, linhas):
    garantir_pasta(os.path.dirname(caminho))
    with open(caminho, "w", encoding="utf-8", newline="") as arquivo:
        escritor = csv.writer(arquivo, delimiter=";", lineterminator="\n")
        escritor.writerow(cabecalho)
        total = 0
        for linha in linhas:
            escritor.writerow(linha)
            total += 1
    return total


def gravar_manifesto(identificador, conteudo):
    """Registra o manifesto de uma fonte em dados/manifestos/<identificador>.json."""
    conteudo = {"id": identificador, **conteudo, "coletado_em": conteudo.get("coletado_em", hoje())}
    gravar_json(os.path.join(MANIFESTOS, f"{identificador}.json"), conteudo, compacto=False)


def gravar_relatorio(nome, conteudo):
    gravar_json(os.path.join(RELATORIOS, f"{nome}.json"), {"gerado_em": hoje(), **conteudo}, compacto=False)


class Territorios:
    """Tabela oficial de municípios (IBGE) com as correspondências validadas."""

    def __init__(self):
        caminho = os.path.join(DADOS, "referencia", "municipios.json")
        if not os.path.exists(caminho):
            raise SystemExit("Execute antes: python3 scripts/preparar_territorios.py")
        self.municipios = ler_json(caminho)["municipios"]
        self.por_codigo = {m["c"]: m for m in self.municipios}
        # Código de 6 dígitos (sem dígito verificador), usado por SIM, SIH, SINAN e CNES.
        self.por_seis = {}
        for municipio in self.municipios:
            seis = municipio["c"][:6]
            if seis in self.por_seis:
                raise RuntimeError(f"Código de 6 dígitos ambíguo: {seis}")
            self.por_seis[seis] = municipio["c"]
        # Nome normalizado + UF. Homônimos dentro da mesma UF ficam marcados como ambíguos.
        self.por_nome_uf = {}
        self.ambiguos = set()
        for municipio in self.municipios:
            chave = (normalizar(municipio["n"]), municipio["uf"])
            if chave in self.por_nome_uf:
                self.ambiguos.add(chave)
            self.por_nome_uf[chave] = municipio["c"]
        # Grafias antigas validadas por código (ver preparar_territorios.py).
        alternativos = os.path.join(DADOS, "referencia", "municipios_nomes_alternativos.json")
        if os.path.exists(alternativos):
            for item in ler_json(alternativos)["nomes"]:
                chave = (normalizar(item["alternativo"]), item["uf"])
                if chave in self.por_nome_uf and self.por_nome_uf[chave] != item["c"]:
                    self.ambiguos.add(chave)
                self.por_nome_uf.setdefault(chave, item["c"])

    def de_seis(self, codigo):
        """Converte código de 6 dígitos em código IBGE de 7 dígitos; None se não existir."""
        return self.por_seis.get(str(codigo or "").strip()[:6])

    def de_nome(self, nome, uf):
        """Resolve por nome exato (sem acentos) e UF. Não faz aproximação."""
        chave = (normalizar(nome), uf)
        if chave in self.ambiguos:
            return None
        return self.por_nome_uf.get(chave)
