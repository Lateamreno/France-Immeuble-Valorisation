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
  · le SIREN, le code du droit et le NOMBRE DE LOCAUX détenus à l'adresse,
    repliés par voie dans une seule chaîne « 40=890018559P10;91=520382656P3 ».
    Ce compte est ce qui sépare « la société détient l'immeuble » de « elle
    détient un appartement dedans » : le fichier recense tout local bâti, pas
    seulement les immeubles en bloc.

Ce qu'on jette, et pourquoi ce seuil et pas un autre : une adresse où les
sociétés ne détiennent, à elles toutes, qu'UN seul local n'est pas un immeuble
— c'est un studio, une boutique, une maison. Cela représente 2,2 millions
d'adresses sur 4, et c'est là qu'est tout le poids inutile. On coupe au niveau
de l'ADRESSE, jamais du détenteur : dès qu'une adresse est retenue, tous ses
détenteurs le sont. Écarter « les adresses à plusieurs sociétés » serait le
contraire d'un bon filtre — ce sont souvent deux SCI qui se partagent un
immeuble, ou un démembrement usufruit / nue-propriété, donc des cibles.

Résultat : 553 713 lignes et 75 Mo au lieu de ~1 Go. Les dénominations ne sont
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
        SELECT
          code_insee AS insee,
          code_voie_rivoli AS rivoli,
          CAST(TRY_CAST(numero_voirie AS INTEGER) AS VARCHAR)
            || COALESCE(upper(trim(indice_repetition)), '') AS pos,
          numero_siren AS siren,
          code_droit AS droit,
          -- Un local, c'est une parcelle et une place dedans : bâtiment,
          -- entrée, niveau, porte. `numero_majic` n'y sert pas — c'est
          -- l'identifiant du PROPRIÉTAIRE, pas celui du local.
          count(DISTINCT (COALESCE(prefixe,'') || section || '-' || numero_parcelle || '-'
                || COALESCE(batiment,'') || '-' || COALESCE(entree,'') || '-'
                || COALESCE(CAST(niveau AS VARCHAR),'') || '-'
                || COALESCE(CAST(porte AS VARCHAR),''))) AS nb,
          any_value(denomination) AS denomination,
          any_value(forme_juridique_abregee) AS forme
        FROM read_parquet('{source}')
        WHERE code_droit IN ('P','U','N')
          AND code_voie_rivoli IS NOT NULL AND code_insee IS NOT NULL
          AND TRY_CAST(numero_voirie AS INTEGER) IS NOT NULL
          AND numero_siren IS NOT NULL AND denomination IS NOT NULL
        GROUP BY 1,2,3,4,5;
        """
    )
    print("  lignes retenues :", con.execute("SELECT count(*) FROM plat").fetchone()[0])

    # Le tri « c'est un immeuble ou pas » : au moins deux locaux à l'adresse,
    # tous détenteurs confondus. En dessous, ce n'est pas un immeuble.
    con.execute(
        """
        CREATE TABLE garde AS
        SELECT p.* FROM plat p
        JOIN (SELECT insee, rivoli, pos, sum(nb) AS nloc FROM plat GROUP BY 1,2,3) a
          USING (insee, rivoli, pos)
        WHERE a.nloc >= 2;
        """
    )
    print("  entrées gardées :", con.execute("SELECT count(*) FROM garde").fetchone()[0])

    con.execute(
        """
        CREATE TABLE voie AS
        WITH parnum AS (
          SELECT insee, rivoli, pos,
                 string_agg(siren || droit || nb, ',' ORDER BY siren) AS gens
          FROM garde GROUP BY 1,2,3
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
        """SELECT siren, any_value(denomination), any_value(forme) FROM garde
           WHERE NOT regexp_matches(siren, '^[0-9]{9}$') GROUP BY siren""",
        "fi_pm_soc",
        ["code", "nom", "forme"],
    )

    print("Adresses…")
    verser(con, "SELECT cle, biens FROM voie ORDER BY cle", "fi_pm_voie", ["cle", "biens"])
    print("Terminé. Pensez à mettre à jour MILLESIME dans lib/bo/proprio-actions.ts.")


if __name__ == "__main__":
    main()
