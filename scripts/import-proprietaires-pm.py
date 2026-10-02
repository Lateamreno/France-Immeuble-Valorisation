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

Le script remplit aussi la PROSPECTION : il rapproche le registre national
d'immatriculation des copropriétés (ANAH) pour marquer les adresses déjà en
copro, puis en tire `fi_pm_cible` — les immeubles de société qui ne sont PAS en
copropriété, c'est-à-dire la cible de la découpe.

Usage :
    pip install duckdb
    SUPABASE_SERVICE_ROLE_KEY=... python3 scripts/import-proprietaires-pm.py \
        https://static.data.gouv.fr/resources/.../locaux-personnes-morales-2024.parquet \
        https://static.data.gouv.fr/resources/.../fichier-t3-2025.csv

Les deux URL se relèvent sur data.gouv.fr, fiches « Fichiers des locaux et des
parcelles des personnes morales (version unifiée) » et « Registre national
d'Immatriculation des Copropriétés ».

Avant de relancer : `truncate fi_pm_voie; truncate fi_pm_cible;` — les tables
se rechargent en entier, elles ne se complètent pas.
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
    """Envoi en upsert, avec reprise : une coupure ne doit pas tout perdre.

    `conflit` vaut « - » pour les tables sans clé (fi_pm_cible se recharge en
    entier, une clé unique n'y coûterait que de l'index).
    """
    corps = json.dumps(lignes).encode()
    sans_cle = conflit == "-"
    for essai in range(5):
        req = urllib.request.Request(
            f"{SB_URL}/rest/v1/{table}" + ("" if sans_cle else f"?on_conflict={conflit}"),
            data=corps,
            headers={
                "apikey": SB_KEY,
                "Authorization": f"Bearer {SB_KEY}",
                "Content-Type": "application/json",
                "Prefer": ("return=minimal" if sans_cle
                           else "resolution=merge-duplicates,return=minimal"),
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


def verser(con, requete: str, table: str, colonnes: list[str], conflit: str | None = None) -> None:
    curseur = con.execute(requete)
    envoyes, debut, paquet = 0, time.time(), []
    while True:
        lot = curseur.fetchmany(PAQUET)
        if not lot:
            break
        paquet = [dict(zip(colonnes, r)) for r in lot]
        envoyer(table, conflit or colonnes[0], paquet)
        envoyes += len(paquet)
        if envoyes % 100000 < PAQUET:
            print(f"  {envoyes} lignes  {int(time.time() - debut)}s")
    print(f"  {table} : {envoyes} lignes en {int(time.time() - debut)}s")


def main() -> None:
    if not SB_KEY:
        sys.exit("SUPABASE_SERVICE_ROLE_KEY absente.")
    if len(sys.argv) < 3:
        sys.exit(
            "Usage : import-proprietaires-pm.py <parquet des locaux> <csv du registre des copros>"
        )
    source, source_rnc = sys.argv[1], sys.argv[2]

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    print("Lecture et dégraissage…")
    con.execute(
        f"""
        CREATE TABLE plat AS
        SELECT
          code_insee AS insee,
          nom_commune AS commune,
          departement AS dep,
          nature_voie AS nature,
          nom_voie AS voie,
          TRY_CAST(numero_voirie AS INTEGER) AS num,
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
        GROUP BY 1,2,3,4,5,6,7,8,9,10;
        """
    )
    print("  lignes retenues :", con.execute("SELECT count(*) FROM plat").fetchone()[0])

    # Les parcelles de chaque adresse : c'est par elles qu'on reconnaîtra une
    # copropriété dans le registre de l'ANAH.
    con.execute(
        f"""
        CREATE TABLE parc AS
        SELECT DISTINCT code_insee AS insee, code_voie_rivoli AS rivoli,
          CAST(TRY_CAST(numero_voirie AS INTEGER) AS VARCHAR)
            || COALESCE(upper(trim(indice_repetition)), '') AS pos,
          lpad(COALESCE(prefixe, '000'), 3, '0') AS prefixe,
          upper(section) AS section, numero_parcelle
        FROM read_parquet('{source}')
        WHERE code_droit IN ('P','U','N') AND code_voie_rivoli IS NOT NULL
          AND code_insee IS NOT NULL AND section IS NOT NULL
          AND TRY_CAST(numero_voirie AS INTEGER) IS NOT NULL;
        """
    )

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

    coproprietes(con, source_rnc)
    prospection(con)
    print("\nTerminé. Pensez à mettre à jour MILLESIME dans lib/bo/proprio-actions.ts,")
    print("et le nombre de cibles affiché dans app/prospection/page.tsx.")


def coproprietes(con, source_rnc: str) -> None:
    """Repère les adresses en copropriété — d'abord par la parcelle, puis par l'adresse.

    Le registre de l'ANAH ne porte une référence cadastrale que deux fois sur
    trois : sans le second rapprochement, un tiers des copropriétés passerait
    pour des monopropriétés, et on irait démarcher des gens qui n'ont rien à
    vendre.
    """
    print("\nRegistre des copropriétés…")
    con.execute(f"CREATE TABLE rnc AS SELECT * FROM read_csv('{source_rnc}', header=true, "
                "sample_size=200000, ignore_errors=true);")
    print("  copropriétés immatriculées :", con.execute("SELECT count(*) FROM rnc").fetchone()[0])

    # Les voies s'écrivent sans leur type dans le cadastre : « DU TONDU », pas
    # « RUE DU TONDU ». On compare donc des noyaux.
    types = ("RUE|R|AVENUE|AV|BOULEVARD|BD|IMPASSE|IMP|ALLEE|ALLEES|ALL|PLACE|PL|ROUTE|RTE|"
             "CHEMIN|CHE|CH|SQUARE|SQ|COURS|CRS|QUAI|QU|RESIDENCE|RES|LOTISSEMENT|LOT|VILLA|"
             "VLA|PASSAGE|PAS|SENTIER|SENTE|SEN|GRANDE RUE|MONTEE|MTE|ESPLANADE|ESP|PROMENADE|"
             "PROM|HAMEAU|HAM|CITE|VOIE|ROND POINT|RPT|FAUBOURG|FG|MAIL|PARC|TRAVERSE|TRA")
    con.execute(f"""
        CREATE OR REPLACE MACRO norm(a) AS
          trim(regexp_replace(regexp_replace(
            regexp_replace(upper(strip_accents(COALESCE(a,''))), '[^A-Z0-9 ]', ' ', 'g'),
            '\\s+', ' ', 'g'), '^({types}) ', ''));
    """)

    con.execute("""
        CREATE TABLE copro AS
        WITH par_parcelle AS (
          SELECT p.insee, p.rivoli, p.pos, max(k.lots) AS lots
          FROM parc p JOIN (
            SELECT insee, lpad(prefixe,3,'0') AS prefixe, upper(section) AS section,
                   TRY_CAST(parcelle AS INTEGER) AS parcelle, max(lots) AS lots
            FROM (
              SELECT code_insee_commune_1 AS insee, prefixe_1 AS prefixe, section_1 AS section,
                     numero_parcelle_1 AS parcelle, nombre_total_de_lots AS lots FROM rnc
              UNION ALL SELECT code_insee_commune_2, prefixe_2, section_2, numero_parcelle_2,
                     nombre_total_de_lots FROM rnc
              UNION ALL SELECT code_insee_commune_3, prefixe_3, section_3, numero_parcelle_3,
                     nombre_total_de_lots FROM rnc)
            WHERE section IS NOT NULL AND section <> 'non connu' AND parcelle <> 'non connu'
              AND insee IS NOT NULL AND insee <> 'non connu'
              AND TRY_CAST(parcelle AS INTEGER) IS NOT NULL
            GROUP BY 1,2,3,4) k
          ON k.insee = p.insee AND k.section = p.section
             AND k.parcelle = p.numero_parcelle AND k.prefixe = p.prefixe
          GROUP BY 1,2,3
        ),
        rnc_adr AS (
          SELECT commune AS insee,
                 TRY_CAST(regexp_extract(trim(numero_et_voie_adresse_de_reference),
                          '^([0-9]+)', 1) AS INTEGER) AS num,
                 -- L'indice de répétition ne se retire que s'il est un mot à
                 -- lui seul : sinon « 43 CHE DES … » perdrait son C.
                 norm(regexp_replace(regexp_replace(
                        upper(strip_accents(trim(numero_et_voie_adresse_de_reference))),
                        '[^A-Z0-9 ]', ' ', 'g'),
                      '^[0-9]+ *((BIS|TER|QUATER|[A-Z]) )?', '')) AS voie,
                 max(nombre_total_de_lots) AS lots
          FROM rnc
          WHERE numero_et_voie_adresse_de_reference IS NOT NULL AND commune IS NOT NULL
          GROUP BY 1,2,3
        ),
        par_adresse AS (
          SELECT p.insee, p.rivoli, p.pos, max(r.lots) AS lots
          FROM (SELECT DISTINCT insee, rivoli, pos, num, norm(voie) AS voien FROM plat) p
          JOIN rnc_adr r ON r.insee = p.insee AND r.num = p.num AND r.voie = p.voien
          GROUP BY 1,2,3
        )
        SELECT insee, rivoli, pos, max(lots) AS lots
        FROM (SELECT * FROM par_parcelle UNION ALL SELECT * FROM par_adresse)
        GROUP BY 1,2,3;
    """)
    print("  adresses en copropriété :", con.execute("SELECT count(*) FROM copro").fetchone()[0])

    # La marque part dans une table de passage : `fi_pm_voie.biens` est NOT NULL,
    # un upsert partiel ne passerait pas.
    con.execute("""
        CREATE TABLE copro_voie AS
        SELECT insee || '_' || rivoli AS cle,
               string_agg(pos || '=' || COALESCE(CAST(lots AS VARCHAR), '?'), ';' ORDER BY pos) AS copro
        FROM copro
        WHERE (insee, rivoli, pos) IN (SELECT insee, rivoli, pos FROM garde)
        GROUP BY 1;
    """)
    verser(con, "SELECT cle, copro FROM copro_voie", "fi_pm_copro_tmp", ["cle", "copro"])  # noqa: E501
    print("  → puis, en SQL : "
          "update fi_pm_voie v set copro = t.copro from fi_pm_copro_tmp t where t.cle = v.cle; "
          "drop table fi_pm_copro_tmp;")


def prospection(con) -> None:
    """La table des cibles : immeubles de société, hors copropriété.

    Trois exclusions, dans cet ordre d'évidence : les adresses déjà en copro
    (un immeuble divisé n'est plus à diviser), les numéros de voirie ≥ 9000
    (convention du cadastre pour « pas de numéro » : inexploitable pour aller
    sonner), et les bailleurs sociaux et personnes publiques — un office HLM ne
    vend pas son immeuble à un marchand, et ils pèsent un tiers du fichier.
    """
    print("\nCibles de prospection…")
    con.execute("""
        CREATE TABLE cible AS
        SELECT p.insee, p.num, p.voie, p.nature, p.siren, p.denomination AS nom, p.forme, p.nb AS locaux
        FROM garde p
        LEFT JOIN copro k USING (insee, rivoli, pos)
        WHERE k.insee IS NULL
          AND p.droit = 'P' AND p.nb >= 4
          AND p.num < 9000
          AND NOT regexp_matches(upper(p.denomination),
              '(HABITAT|H\\.?L\\.?M|LOYERS? MODERE|OFFICE PUBLIC|OPH|LOGEMENT SOCIAL|ADOMA|SONACOTRA)')
          AND COALESCE(p.forme,'') NOT IN ('EPIC','COLL','MET','COM','DEP','REG','ETAT','SEM');
    """)
    print("  cibles :", con.execute("SELECT count(*) FROM cible").fetchone()[0])

    print("Communes…")
    verser(con, """SELECT insee, any_value(commune), any_value(dep) FROM plat GROUP BY insee""",
           "fi_pm_commune", ["insee", "nom", "dep"])
    print("Cibles…")
    verser(con, "SELECT insee, num, voie, nature, siren, nom, forme, locaux FROM cible",
           "fi_pm_cible", ["insee", "num", "voie", "nature", "siren", "nom", "forme", "locaux"],
           conflit="-")


if __name__ == "__main__":
    main()
