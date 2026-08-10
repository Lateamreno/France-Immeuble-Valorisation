# Cartographie du BO France Immeuble (Bubble) — base réelle + écrans

> Produit le 2026-08-10 à partir de (1) la Data API Bubble `live` de
> `vente.france-immeuble.fr` et (2) des captures d'écran du Drive
> « Pour Claude / Refonte BO france immeuble ».
> Sert de matière première à la refonte Path B (Next.js + Supabase Plein Bail).

---

## 1. Base de données réelle (Bubble Data API — env `live`)

Accès vérifié le 2026-08-10. Les 11 data types demandés répondent **200**.

⚠️ Réglage d'environnement : `BUBBLE_APP_URL` doit valoir `https://vente.france-immeuble.fr`
(racine du site). La valeur actuelle de l'environnement contient à tort le chemin
complet de l'API de test (`…/version-test/api/1.1/obj`) → à corriger dans les
réglages d'environnement. En attendant, surcharger à l'exécution.

| Type | Lignes (estimé) | Rôle | Champs marquants |
|---|---:|---|---|
| `immeuble` | 1 824 | Le bien (équiv. `listings`) | ~110 champs : adresse décomposée + géo, `Statut`, `standby_Statut`, `priority`, `source`, `Motif_vente`/`Motif_archivage`, finances (`fin_loyers_an`, `fin_renta_*` ×8, `fin_charges_*`), prix (`prix_hai`, `prix_nv`, `prix_honos_ttc`, `prix_Charge_honos`, `prix_hai_m2`, variantes travaux), emplacement (`emp_gare/bus/com/school/route` ×4 chacun, `emp_population`, `emp_revenus`, `emp_zone_tendue`), PLU (`plu_zone`, `plu_Type_zone`), occupation (`lots_occ/tot`, `occupation_carrez`), checklist qualité (`ok_locatif`, `ok_photos`, `ok_prix`, `ok_proprio`…), liens vers LOTs, COMPOSANTs, CHARGEs, PRIXs, PARCELLEs, PHOTOs, DOSSIERs, ESTIMATIONs, AGENT, PROPRIETAIRE |
| `lot` | 8 911 | Lots (équiv. `listing_lots`) | `IMMEUBLE`, `numero`, `Type_lot` (T2…), `Destination` (Logement/Commerce…), `Etat` (Bon etat…), `surface_carrez`, `surface_sol`, `volume`, `loyer`, `loyer_max`, `loyer_vol_mois(_max)`, `travaux_m2` |
| `bail` | 105 | Baux (récent, peu rempli) | `IMMEUBLE`, `LOTs[]`, `Type_bail` (3/6/9…), `date_start/end`, `date_next_echeance`, `activ`, `preavis`, `impayes`, `expulsion`, `bailleur_pm` |
| `locataire` | 64 | Locataires (récent) | `formatted_name`, `pm`, `pm_nom`, `BAILs[]`, `IMMEUBLE` |
| `estimation` | 846 | Estimations | `IMMEUBLE`, `ESTIMATOR`, `Statut` (ex. « 4 - Interne »), `titre`, `priority` + beaucoup de champs `[SUPPR]` (ancien moteur de prix abandonné) |
| `mandat` | 251 | Registre des mandats | `numero` (ex. 1901), `Type`, `Type_exclu`, `Statut`, `date_signature/effet/fin`, `date_fin_exclu/irrevoc`, `durée_*`, `honos_taux`, `honos_ttc`, `Charge_hono`, `prix_hai`, `prix_nv`, état civil complet mandant (`nom_m1`, `prénom_m1`, `date/lieu_naissance_m1`, `cni_m1`…), société (`raison_sociale`, `siren`, `rcs`, `kbis`, `capital`, `siege_geo`), `ref_cadastre`, `pdf_signed`, `justif_propriete`, `IMMEUBLEs[]`, `MANDANTs[]`, `MANDAT_ENVOYEs[]`, `locked` |
| `contact` | 3 789 | Contacts (acheteurs/vendeurs/agents) | `nom`, `prénom`, `Civilité`, `email`, `portable(_formatted)`, `poste`, flags `acheteur`/`vendeur`/`agent`, `Types[]` (Investisseur…), `Source`, `SUIVI` (agent), `IMMEUBLES[]` |
| `offre` | 200 | Offres d'achat | `IMMEUBLEs[]`, `ACHETEURs[]`, `Statut` (ex. Refusée), `date`, `date_cloture`, `prix_hai`, `prix_nv`, `honos_ht/ttc`, `SUIVIs[]` |
| `proposition` | 27 479 | Propositions envoyées (gros volume — moteur de matching/relance) | `IMMEUBLE`, `ACHETEUR`, `mail_adresse`, `Statut` (Envoyée…), `Source_proposition` (Téléchargement dossier…), `date_envoi`, `date_last_relance`, `stop_relances_yn`, `DOWNLOADs[]` |
| `visite` | 109 | Visites | `IMMEUBLE`, `VISITEURs[]`, `date`, `Statut` (Effectuée…), `source`, `rex_fi` (compte-rendu) |
| `recherche` | 1 945 | Recherches acquéreurs (alertes) | `ACHETEUR`, `Cible` (Promoteur…), `Destinations[]`, `fourchette_prix/surface/occupation`, `prix_max`, `renta`, `Note` (A/B/C), `IMMEUBLEs_proposed[]`, flags qualif (`has_tel/contact/details/man`), `standby`, `source` |

Enseignements pour la migration :

- Le couple `immeuble`/`lot` mappe naturellement sur `listings`/`listing_lots` de
  Plein Bail. L'immeuble Bubble porte ~110 champs dont beaucoup de calculés
  (rentabilités, agrégats lots) → à recalculer par triggers côté Supabase plutôt
  qu'à migrer tels quels.
- `bail`/`locataire` sont récents et peu peuplés (105/64) : la modélisation
  locative fine est naissante côté Bubble — la refonte peut imposer son propre
  modèle sans grosse reprise.
- `proposition` (27 k lignes) est le vrai moteur commercial : matching
  recherche ↔ immeuble + relances. Gros levier IA/automatisation.
- Beaucoup de champs `[SUPPR] …` (immeuble, estimation) : reliquats à ne PAS
  migrer.
- Les mandats portent déjà un `numero` séquentiel (registre Hoguet) et des PDF
  signés → reprendre la numérotation existante sans trou.

---

## 2. Cartographie des écrans (captures Drive)

_(sections alimentées par le dépouillement des captures — voir ci-dessous)_
