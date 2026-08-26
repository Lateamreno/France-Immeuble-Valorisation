#!/usr/bin/env python3
"""Charge le fichier des locaux des personnes morales (DGFiP) dans le BO.

À relancer une fois par an, quand la DGFiP publie le millésime suivant. Le
fichier fait 21,8 millions de lignes et 164 Mo : on ne le met pas tel quel en
base. Ce script le dégraisse d'abord, puis n'envoie que le nécessaire.

Ce qu'on garde :
  · les droits de PROPRIÉTÉ seulement (P propriétaire, U usufruitier,
    N nu-propriétaire) — les gestionnaires et syndics ne signent pas un mandat ;
  · la clé d'adresse au format de la Base Adresse Nationale, « insee_rivoli » :
    le code RIVOLI de la voie est commun au cadastre et à la BAN, donc aucun
    libellé de rue à rapprocher, aucune approximation ;
  · le SIREN et le code du droit, repliés par voie dans une seule chaîne
    « 40=890018559P;91=520382656P,822797791U ».

Résultat : 972 312 lignes et 132 Mo au lieu de ~1 Go. Les dénominations ne sont
pas stockées — l'annuaire des entreprises les rend gratuitement à la volée, et
l'application les met en cache dans fi_pm_soc au fil de l'eau. Seules les
sociétés sans SIREN (identifiant interne du cadastre, préfixé U) sont chargées
ici, puisque aucun annuaire ne saurait les nommer.

Usage :
    pip install duckdb
    SUPABASE_SERVICE_ROLE_KEY=... python3 scripts/import-proprietaires-pm.py \
        https://static.data.gouv.fr/resources/.../locaux-personnes-morales-2024.parquet

L'URL se relève sur la fiche « Fichiers des locaux et des parcelles des
personnes morales (version unifiée) » de data.gouv.fr.
"""

import json
import os
import sys
import time
import urllib.request

import duckdb

SB_URL = os.environ.get("SUPABASE_URL", "https://sojtmhdrzmdbtqborxsi.supabase.co")
SB_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
PAQUET = 5000


def envoyer(table: str, conflit: str, lignes: list[dict]) -> None:
    """Envoi en upsert, avec reprise : une coupure ne doit pas tout perdre."""
    corps = json.dumps(lignes).encode()
    for essai in range(5):
        req = urllib.request.Request(
            f"{SB_URL}/rest/v1/{table}?on_conflict={conflit}",
            data=corps,
            headers={
                "apikey": SB_KEY,
                "Authorization": f"Bearer {SB_KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=120):
                return
        except Exception as e:  # noqa: BLE001 — on retente, quelle que soit la cause
            if essai == 4:
                raise
            print(f"  reprise ({e}) …")
            time.sleep(2**essai)


def verser(con, requete: str, table: str, colonnes: list[str]) -> None:
    curseur = con.execute(requete)
    envoyes, debut, paquet = 0, time.time(), []
    while True:
        lot = curseur.fetchmany(PAQUET)
        if not lot:
            break
        paquet = [dict(zip(colonnes, r)) for r in lot]
        envoyer(table, colonnes[0], paquet)
        envoyes += len(paquet)
        if envoyes % 100000 < PAQUET:
            print(f"  {envoyes} lignes  {int(time.time() - debut)}s")
    print(f"  {table} : {envoyes} lignes en {int(time.time() - debut)}s")


def main() -> None:
    if not SB_KEY:
        sys.exit("SUPABASE_SERVICE_ROLE_KEY absente.")
    if len(sys.argv) < 2:
        sys.exit("Donnez l'URL (ou le chemin) du parquet des locaux.")
    source = sys.argv[1]

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    print("Lecture et dégraissage…")
    con.execute(
        f"""
        CREATE TABLE plat AS
        SELECT DISTINCT
          code_insee AS insee,
          code_voie_rivoli AS rivoli,
          CAST(TRY_CAST(numero_voirie AS INTEGER) AS VARCHAR) AS num,
          COALESCE(upper(trim(indice_repetition)), '') AS rep,
          numero_siren AS siren,
          code_droit AS droit,
          denomination, forme_juridique_abregee AS forme
        FROM read_parquet('{source}')
        WHERE code_droit IN ('P','U','N')
          AND code_voie_rivoli IS NOT NULL AND code_insee IS NOT NULL
          AND TRY_CAST(numero_voirie AS INTEGER) IS NOT NULL
          AND numero_siren IS NOT NULL AND denomination IS NOT NULL;
        """
    )
    print("  lignes retenues :", con.execute("SELECT count(*) FROM plat").fetchone()[0])

    con.execute(
        """
        CREATE TABLE voie AS
        WITH parnum AS (
          SELECT insee, rivoli, num || rep AS pos,
                 string_agg(siren || droit, ',' ORDER BY siren) AS gens
          FROM plat GROUP BY 1,2,3
        )
        SELECT insee || '_' || rivoli AS cle,
               string_agg(pos || '=' || gens, ';' ORDER BY pos) AS biens
        FROM parnum GROUP BY 1;
        """
    )
    print("  voies :", con.execute("SELECT count(*) FROM voie").fetchone()[0])

    print("Sociétés sans SIREN (identifiant interne du cadastre)…")
    verser(
        con,
        """SELECT siren, any_value(denomination), any_value(forme) FROM plat
           WHERE NOT regexp_matches(siren, '^[0-9]{9}$') GROUP BY siren""",
        "fi_pm_soc",
        ["code", "nom", "forme"],
    )

    print("Adresses…")
    verser(con, "SELECT cle, biens FROM voie ORDER BY cle", "fi_pm_voie", ["cle", "biens"])
    print("Terminé. Pensez à mettre à jour MILLESIME dans lib/bo/proprio-actions.ts.")


if __name__ == "__main__":
    main()
