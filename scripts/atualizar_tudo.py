#!/usr/bin/env python3
"""Executa toda a preparação dos dados, na ordem correta.

Uso:
  python3 scripts/atualizar_tudo.py            reaproveita os arquivos já baixados em dados/brutos
  python3 scripts/atualizar_tudo.py --refazer  baixa tudo de novo das fontes oficiais

Para carregar a base no MySQL/MariaDB depois de atualizar:
  python3 scripts/importar_mysql.py -- -u USUARIO -p

Depois de atualizar, mude DATA_VERSION em assets/js/config.js e o sufixo ?v= dos
arquivos em index.html, para que os navegadores não misturem versões em cache.
"""

import os
import subprocess
import sys

PASSOS = [
    ["preparar_territorios.py"],
    ["preparar_cid10.py"],
    ["preparar_sim.py"],
    ["preparar_ibge.py"],
    ["preparar_tabnet.py"],
    ["preparar_cnes_inpe.py"],
    ["montar_indicadores.py"],
    ["montar_conhecimento.py"],
    ["detectar_outliers.py"],
    ["validar.py", "--tabnet"],
]
SEM_REFAZER = {"montar_indicadores.py", "montar_conhecimento.py", "detectar_outliers.py", "validar.py"}


def main():
    pasta = os.path.dirname(os.path.abspath(__file__))
    refazer = "--refazer" in sys.argv
    for passo in PASSOS:
        comando = [sys.executable, os.path.join(pasta, passo[0]), *passo[1:]]
        if refazer and passo[0] not in SEM_REFAZER:
            comando.append("--refazer")
        print(f"\n=== {' '.join(passo)} ===", flush=True)
        resultado = subprocess.run(comando)
        if resultado.returncode != 0:
            raise SystemExit(f"Falha em {passo[0]}. Corrija o problema e execute de novo: os downloads já feitos são reaproveitados.")
    print("\nDados atualizados e validados.")


if __name__ == "__main__":
    main()
