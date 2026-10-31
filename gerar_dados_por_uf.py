#!/usr/bin/env python3
"""Divide o CSV tratado do SIM por UF usando CODMUNRES do ZIP oficial."""

import argparse
import csv
import io
import os
import re
import zipfile


UF_BY_PREFIX = {
    "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
    "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA",
    "31": "MG", "32": "ES", "33": "RJ", "35": "SP", "41": "PR", "42": "SC", "43": "RS",
    "50": "MS", "51": "MT", "52": "GO", "53": "DF",
}


def chronic_cause(code):
    match = re.fullmatch(r"([CEIJ])(\d{2})[A-Z0-9]*", (code or "").strip().upper())
    if not match:
        return False
    letter, number = match.group(1), int(match.group(2))
    return (
        (letter == "C" and 0 <= number <= 97)
        or (letter == "E" and 10 <= number <= 14)
        or (letter == "I" and 0 <= number <= 99)
        or (letter == "J" and 40 <= number <= 47)
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("official_zip")
    parser.add_argument("prepared_csv")
    parser.add_argument("output_dir")
    args = parser.parse_args()
    os.makedirs(args.output_dir, exist_ok=True)

    with zipfile.ZipFile(args.official_zip) as archive:
        source_name = next(name for name in archive.namelist() if name.lower().endswith(".csv"))
        source = csv.DictReader(
            io.TextIOWrapper(archive.open(source_name), encoding="latin1", newline=""),
            delimiter=";",
            quotechar='"',
        )
        prepared_file = open(args.prepared_csv, encoding="utf-8-sig", newline="")
        prepared = csv.DictReader(prepared_file, delimiter=";")
        fields = prepared.fieldnames + ["uf"]
        files, writers, counts = {}, {}, {}
        for uf in sorted(UF_BY_PREFIX):
            file = open(os.path.join(args.output_dir, f"{uf}.csv"), "w", encoding="utf-8", newline="")
            writer = csv.DictWriter(file, fieldnames=fields, delimiter=";", lineterminator="\n")
            writer.writeheader()
            files[uf], writers[uf], counts[uf] = file, writer, 0

        matched = unknown = 0
        for raw in source:
            if not chronic_cause(raw.get("CAUSABAS")):
                continue
            row = next(prepared, None)
            if row is None:
                raise RuntimeError("A base preparada terminou antes dos registros oficiais filtrados.")
            raw_date = raw.get("DTOBITO", "")
            date = f"{raw_date[4:8]}-{raw_date[2:4]}-{raw_date[:2]}" if len(raw_date) == 8 else ""
            if row.get("dt_obito") != date or row.get("co_cid_causa_basica", "").strip() != raw.get("CAUSABAS", "").strip():
                raise RuntimeError(f"As bases não estão alinhadas no registro {matched + 1}; nenhuma divisão foi validada.")
            matched += 1
            code = (raw.get("CODMUNRES") or "").strip()
            uf = code[:2] if len(code) >= 6 else ""
            if uf not in UF_BY_PREFIX:
                unknown += 1
                continue
            row["uf"] = UF_BY_PREFIX[uf]
            writers[uf].writerow(row)
            counts[uf] += 1

        if next(prepared, None) is not None:
            raise RuntimeError("A base preparada tem mais registros que a base oficial filtrada.")
        for file in files.values():
            file.close()
        prepared_file.close()

    print(f"Registros alinhados: {matched:,}; sem UF válida: {unknown:,}")
    for uf, count in sorted(counts.items()):
        if count:
            print(f"{uf}: {count:,}")


if __name__ == "__main__":
    main()
