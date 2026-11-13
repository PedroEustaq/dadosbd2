#!/usr/bin/env python3
"""Gera as camadas geográficas usadas pelo mapa.

Entrada: o GeoJSON de municípios (arquivo único da fonte geodata-br) ou a pasta
com um GeoJSON por UF já gerada por este script.

Saídas, dentro da pasta de destino:
  estados.geojson              fronteiras das UFs (dissolvidas e simplificadas)
                               com o ponto de rótulo de cada estado
  municipios/<código UF>.geojson  municípios de cada UF, carregados sob demanda
  municipios_indice.json       [código IBGE, nome] de todos os municípios

Requer shapely:  uv run --with shapely scripts/gerar_geo.py ENTRADA dados/geo
"""

import argparse
import json
import os

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

UF_BY_PREFIX = {
    "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
    "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA",
    "31": "MG", "32": "ES", "33": "RJ", "35": "SP", "41": "PR", "42": "SC", "43": "RS",
    "50": "MS", "51": "MT", "52": "GO", "53": "DF",
}
UF_NAMES = {
    "AC": "Acre", "AL": "Alagoas", "AP": "Amapá", "AM": "Amazonas", "BA": "Bahia", "CE": "Ceará",
    "DF": "Distrito Federal", "ES": "Espírito Santo", "GO": "Goiás", "MA": "Maranhão", "MT": "Mato Grosso",
    "MS": "Mato Grosso do Sul", "MG": "Minas Gerais", "PA": "Pará", "PB": "Paraíba", "PR": "Paraná",
    "PE": "Pernambuco", "PI": "Piauí", "RJ": "Rio de Janeiro", "RN": "Rio Grande do Norte",
    "RS": "Rio Grande do Sul", "RO": "Rondônia", "RR": "Roraima", "SC": "Santa Catarina",
    "SP": "São Paulo", "SE": "Sergipe", "TO": "Tocantins",
}
# Tolerância (graus) das fronteiras estaduais; elas só aparecem em zoom baixo.
STATE_TOLERANCE = 0.01


def round_coords(value, digits=4):
    if isinstance(value, (list, tuple)):
        return [round_coords(item, digits) for item in value]
    return round(value, digits)


def read_features(source):
    if os.path.isdir(source):
        features = []
        for name in sorted(os.listdir(source)):
            if name.endswith(".geojson"):
                with open(os.path.join(source, name), encoding="utf-8") as file:
                    features.extend(json.load(file)["features"])
        return features
    with open(source, encoding="utf-8") as file:
        return json.load(file)["features"]


def dump(path, data):
    with open(path, "w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, separators=(",", ":"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("municipios", help="GeoJSON de municípios ou pasta com um GeoJSON por UF")
    parser.add_argument("output_dir")
    args = parser.parse_args()

    features = read_features(args.municipios)
    by_prefix = {}
    for feature in features:
        prefix = str(feature["properties"]["id"])[:2]
        if prefix in UF_BY_PREFIX:
            by_prefix.setdefault(prefix, []).append(feature)

    muni_dir = os.path.join(args.output_dir, "municipios")
    os.makedirs(muni_dir, exist_ok=True)
    states, index = [], []
    for prefix, items in sorted(by_prefix.items()):
        items.sort(key=lambda f: str(f["properties"]["id"]))
        dump(os.path.join(muni_dir, f"{prefix}.geojson"), {"type": "FeatureCollection", "features": items})
        index.extend([str(f["properties"]["id"]), f["properties"]["name"]] for f in items)

        # buffer(0) corrige pequenas autointerseções herdadas da simplificação dos municípios.
        merged = unary_union([shape(f["geometry"]).buffer(0) for f in items])
        merged = merged.buffer(0.0005).buffer(-0.0005)  # fecha frestas entre municípios vizinhos
        simplified = merged.simplify(STATE_TOLERANCE, preserve_topology=True)
        label = merged.representative_point()
        uf = UF_BY_PREFIX[prefix]
        states.append({
            "type": "Feature",
            "properties": {
                "id": prefix, "uf": uf, "name": UF_NAMES[uf],
                "label": [round(label.y, 4), round(label.x, 4)],
            },
            "geometry": {**mapping(simplified), "coordinates": round_coords(mapping(simplified)["coordinates"])},
        })
        print(f"{uf}: {len(items)} municípios")

    dump(os.path.join(args.output_dir, "estados.geojson"), {"type": "FeatureCollection", "features": states})
    dump(os.path.join(args.output_dir, "municipios_indice.json"), index)


if __name__ == "__main__":
    main()
