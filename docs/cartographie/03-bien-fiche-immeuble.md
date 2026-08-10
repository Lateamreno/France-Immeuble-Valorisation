# Cartographie back-office Bubble — Fiche « Bien » (fiche immeuble détaillée)

> Source : ~100 captures du dossier Drive « Bien », lues en 3 lots chronologiques.
> Immeubles d'exemple : Villejuif (94800) — 9 Av. de Paris (statut « À transformer », 640 000 €)
> et Brueil-en-Vexin (78440) — 37 Rue du Vexin (mandat n°2070, « Commercialisé (public) », 1 050 000 €).

---

## PARTIE A — Sections basses de la fiche : Lots, Parcelles/PLU, Prix du secteur, Adresse, Propriétaire, Suivi (16h52–17h00)

_(sera complétée par le lot 1/3 — en cours de dépouillement)_

---

## PARTIE B — Travaux, Prix, Descriptif, Photos, Estimation (wizard), Mandat, Dossiers, Acheteurs, Notes (17h00–17h05)

### Détail capture par capture

#### 05.00.00 — Modale « Nouveaux travaux » (section État technique)
- Champs : **« Objet des travaux »** (« Sélectionnez un ou plusieurs lots » / « Sélectionnez un ou plusieurs composants ») ; **« Détails des travaux »** → **« Description »** ; **« Documents »** ; **« Commentaire »** ; bloc **« Estimer les travaux »** → **« Montant »**, **« Urgence »**, **« Devis »**. Bouton **« Créer les travaux »**.
- Arrière-plan : liste de travaux existants + compteurs « …€ sur les lots / …€ sur le bâti ».

#### 05.00.05 — Modale « Modifier les travaux » (travaux sur lot)
- Objet = **« 1 lot »** → **« Lot 3 »** ; Description = « Peinture et remise en état après départ locataire » ; Document lié = « Façade » ; **Urgence : « Haute »**, **Devis : « Non »**, **Montant : « 6 000 € »**. Boutons « Supprimer les travaux », « Enregistrer ».

#### 05.00.15 — Modale « Modifier les travaux » (travaux sur le bâti)
- Objet = **« 1 composant : Façade »** ; « Peinture facade et communs » ; **15 000 €**, Urgence « Moyenne ». → Distinction structurelle **travaux sur lots** vs **travaux sur le bâti/composants**.

#### 05.00.23 — Section « Description et prix » → modale « Modifier le prix »
- **« Prix actuel : 640 000 € HAI »** (daté 18/02/26, « Prix estimé », Net Vendeur 609 524 €).
- Décomposition : **« Prix » (net vendeur) + « Honoraires » (30 476 €, 5,0 %) = « Prix HAI »**.
- Comparateur **« Actuel » / « Potentiel »** vs marché : **« Loyer au m² »** (32,6 €/m²/mois, +41 % / 30,7, +33 %), **« Prix au m² »** (4 414 €/m², −4 % / 4 559, 0 %), rendements **« Brut »** (5,5 % / 8,1 %), **« Net »** (5,1 % / 7,7 %), **« Acte en main »** (4,8 % / 7,2 %).
- **« Marge de négociation »** : « Net vendeur actuel » / **« Net vendeur minimum »**.
- **« Conditions de la vente »** : **« Charge honoraires »** (toggle **Vendeur / Acheteur**), **« Financements »** (Refusés / Acceptés), **« Permis de construire »** (Refusés / Acceptés).

#### 05.00.29 — Section « Descriptif »
- **« Cible »** : 4 profils — **« Investisseurs »** (« Bon rendement actuel, peu de travaux »), **« Marchands de biens »** (« Opération d'achat-revente avec travaux »), **« Investisseurs patrimoniaux »** (« Potentiel de valorisation à long terme »), **« Promoteurs »** (« Construction/démolition »).
- **« Descriptif automatique »** généré depuis les données, avec alerte **« Terminez d'abord l'état locatif »** + bouton **« Compléter l'état locatif »**. Compteur **« 483 caractères / 200 minimum »**. Données manquantes → phrases trouées (« à min des écoles »).

#### 05.00.35 / 05.00.42 — Section « Photos »
- **« 1 photos »**, bouton **« + Ajouter une photo »**, compteurs par type : « photo extérieure / photos des PC / photos des lots ».
- Modale « Nouvelle photo » : **« Type de document »** : **« Extérieur » / « Parties communes » / « Lot »** ; « Sélectionnez d'abord un type » ; case **« Compresser automatiquement »**.

#### 05.00.59 — Vue d'ensemble de la fiche Bien + navigation
- Bandeau : **« Villejuif (94800) »**, badge **« À transformer »**, **« 640 000 € »**, statut **« Attente infos »**, agent « MAV ».
- **Menu latéral de la fiche** : **Suivi, Propriétaire, Emplacement, État locatif, État technique, Description et prix, Photos, Documents, Estimations, Mandats, Dossiers, Tous les documents, Acheteurs, Notes** — pictos « ⚠ » sur sections incomplètes.
- Barre d'actions : **« + Contact », « + Immeuble », « + Mandat », « + Recherche », « + Proposition », « + Visite », « + Offre », « Réactiver »**.

#### 05.01.04 → 05.01.51 — Wizard « Nouvelle estimation » (6 étapes)
- Stepper : **Immeuble → Secteur → Prix → Analyse → PDF → Envoi**.
- **Étape Immeuble** : « Données de l'immeuble » + « Personnaliser les informations » — Adresse, Points d'intérêt (« Nom des transports », « Nom des commerces »), Charges (« Taxe foncière » 2 268 €/an, « Autres charges », « Charges totales »), Travaux (« sur le bâti » 15 000 €, « sur les lots » 6 000 €, « totaux » 21 000 €), État locatif récapitulé par groupes de lots (Lots / Occupée / Surface / Loyer / **« Potentiel »**).
- **Étape Secteur** : sources affichées : **« Seloger », « Notaires », « Notaires Paris », « LocalCommercial »** — « Loyer global » (23,1 €/m²/mois), « Loyer de référence », « Prix global » (4 575 €/m²), « Prix de référence », « Rendement global » (6,1 %), « Rendement de référence ».
- **Étape Prix** : « Estimation selon le secteur » : **« Rendement »** (6,1 % → 576 000 €), **« Rendement max »** (→ 853 000 €), **« Prix au m² »** (→ 642 000 €), **« Prix au m² max »** (→ 663 000 €), **« Prix automatique »** (moyenne : 684 000 €). « Prix estimé » : Net Vendeur 651 429 € + Honoraires 32 571 € (5,0 %) = Prix HAI 684 000 €. + comparateur Actuel/Potentiel.
- **Étape Analyse** : **« Fondamentaux »** (« Bâti » : en état d'usage ; « Emplacement » : idéalement situé ; « Lots » : en bon état) ; **« Cibles »** (« Locatif », « Marchand », « Patrimonial », « Promotion ») ; « Loyers pratiqués par rapport au secteur » (+41 % / +33 %) ; **« Analyse »** texte libre (**« 809/900 caractères »**) avec référence comparable (« le 7 avenue de Paris vendu 880 000 € en 2019 soit 3 478 €/m² »).
- **Étape PDF** : « Titre de l'estimation », « Agent à afficher », « Fichier PDF » ; avertissement **« Vous ne pourrez plus modifier les informations après avoir généré l'estimation. »** ; bouton « + Générer l'estimation PDF ».
- **Étape Envoi** : email pré-rempli (De/destinataire/PJ/Objet « Estimation de votre immeuble à Villejuif »/Message complet signé) ; mention **« Envoyé automatiquement »** ; « Supprimer l'estimation ».

#### 05.02.05 → 05.02.48 — Mandat (création + fiche + numérotation)
- Modale « Nouveau mandat » : **« Type de mandat »** (« Mandat de vente »), **« Type de mandant »** (« Personne physique »), **« Objet du mandat »** + « + Ajouter un immeuble », **« Mandants »** + « + Ajouter un mandant », « Informations et remarques » ; « Créer le mandat ».
- Fiche mandat, en-tête : « Vente Semi-exclusive (14 j) · **# Pas de numéro** · 30 476 € · Attente infos · 10/08/26–10/08/27 · Mandant · Objet ». Onglets : **Mandants, Objet, Prix, Conditions, Envoi**.
  - **Mandants** : Prénom, Nom, Date naissance, Lieu naissance, Adresse, « Ajouter la carte d'identité », « + Ajouter un mandant ». Actions : **« Attribuer un numéro », « Infos mandat reçues », « Annuler le mandat »**.
  - **Objet** : **« Occupation »** (« Vendu occupé »), **« Ref. cadastrale »**, **« Surface terrain »**, **« Surface bâti »**, **« Adresse »**, **« Descriptif »**, « Ajouter l'acte de propriété ».
  - **Prix** : **« Net vendeur »** + **« Honoraires »** (5,0 %) = **« Prix HAI »** ; **« Charge Honos »** : Acheteur/Vendeur.
  - **Conditions** : **« Début »**, **« Durée totale »** (12 mois), **« Exclusivité »** (« Semi-exclusif »), **« Durée exclu »** (14 jours), **« Irrévocabilité »** (14 jours).
- Modale **« Réserver un numéro »** : « Une fois le numéro réservé, il ne sera plus possible de supprimer le mandat ni de modifier le numéro. Le numéro qui va être attribué est le **2104** » → numérotation séquentielle centralisée avec verrouillage (équivalent registre Hoguet).

#### 05.02.19 / 05.03.23 → 05.03.52 — Alertes de complétude, Documents, Acheteurs, Notes
- Pile d'alertes : **« L'EMPLACEMENT semble incomplet », « Le TERRAIN … », « L'ÉTAT LOCATIF … », « L'ÉTAT TECHNIQUE … », « Le DESCRIPTIF … », « Le PRIX … »**, chacune avec bouton **« Vérifier les informations »**.
- Section Documents : « 1 document », « + Ajouter un document » (ex. « Estimation 18/02/26 — Estimation Villejuif.pdf — 1 MB »).
- Section Acheteurs, sous-onglets : **Acheteurs, Commercialisations, Propositions, Visites, Offres** — boutons « + Rechercher de nouveaux acquéreurs », « Commercialiser », « + Créer une nouvelle proposition », « + Programmer une visite », « + Ajouter une offre ».
- Section Notes : mémos libres horodatés + référence comparable structurée (« Vente 880 000 € · 24/06/2019 · 253 m² · soit 3 478 €/m² · 7 Avenue DE PARIS 94800 VILLEJUIF »).

#### 05.04.20 → 05.04.53 — Mandat signé + Dossiers versionnés (Brueil-en-Vexin)
- Fiche mandat signé : « Vente Semi-exclusive (14 j) · **#2070** · 50 000 € · **Expiré** · Mandat 2070.pdf · 13/06/25–13/06/26 » ; bloc **« Mandat signé »** : « Ce mandat est signé, il n'est plus possible de le modifier », « Signé par le vendeur le 23/06/25 », « Revoir l'e-mail envoyé à … », « Voir le PDF signé », action **« Relancer »**.
- Section Dossiers : versions V1/V2/dernière (« Dossier généré le 26/06/25 — Dossier Complet - Brueil en Vexin.pdf », badge **« Privé »**, mini-récap « 78 · 452 m² · 80 % · 20 000 € · 8,5 % · 1 050 000 € HAI »).
- Modale « Nouveau dossier », stepper **Immeuble → Prix → PDF** ; avertissement « Pensez à relire le dossier pour éviter toute erreur » ; deux modes : « Générer le dossier PDF » ou upload manuel.
- Page de garde PDF « DOSSIER COMPLET » : Surface carrez, « Investissement locatif », nb logements, Occupation, « Prix honoraires inclus », « Prix au m² », « Rendement brut 7,3 % – 8,7 % », « + 20 k€ de travaux », photo.

### Synthèse structure (partie B)

**Chaîne de valeur modélisée** : données brutes (locatif, technique, secteur) → estimation chiffrée (wizard 6 étapes, PDF figé, email tracé) → mandat numéroté (verrouillage) → dossier de commercialisation versionné → pipeline acheteurs. Moteur de complétude par section (« X semble incomplet ») qui conditionne descriptif auto et générations PDF.

---

## PARTIE C — Dossier PDF généré + Matching acquéreurs + Commercialisation + Propositions + Offres (17h05–17h08)

### Le dossier PDF généré (pages, immeuble Brueil-en-Vexin, « v4 - 10/08/26 17h04 » en pied de chaque page)

- **« Photos »** : mosaïque filigranée « FRANCE IMMEUBLE ».
- **« Emplacement »** : 3 cartes + adresse ; accessibilité (**Trains** « Ligne J - Meulan - Hardricourt » 12 min en voiture ; **Bus** « Bus 17 - Arrêt Rue Nationale » 4 min à pied ; **Axes routiers** « A13 » ; **Ecoles** « Toutes » ; **Commerces** « La Poste ») ; stats commune **avec source par indicateur** : Habitants 683 (INSEE), Revenus médian 31 k€ (INSEE), Tension locative n.c. (LOCservice), Prix des logements 2 568 €/m² (Notaires).
- **« Etat technique »** : « Construit en 1930 » ; tableau **« Etat des matériaux »** (`Type | Matériau | Derniers travaux | Etat` : Chauffage/Central fuel/2017/Bon état ; Façade/Pierres ; Fenêtres/Double et Simple vitrage ; Toiture/Tuiles/2024) ; tableau **« Travaux à prévoir »** (`Objet | Description | Urgence | Devis | Montant`, total 20 000 €) ; **« Terrain »** (Parcelle H25, 709 m², façade 14 m, plan cadastral) ; **« PLU »** (Zone UAD (Centre ancien), Emprise max 60 %, Hauteur max 10,5 m).
- **« Etat locatif »** : tableau lot par lot — colonnes `n° | Type de lot | Carrez | Au sol | DPE | Etat | Bail | Entrée | HC/mois | Potentiel` (13 lots ; DPE D/E/F/G ; états Rénové/Travaux/n.c. ; baux Nu/Vide/LL) ; totaux **452 m² | 6 355 €/mois | 93 132 €/an** ; note « * Potentiel calculé à partir des loyers du secteur, de l'encadrement des loyers et des indices de révision. »
- **« Etat financier »** : « Coût d'acquisition » (Net vendeur 1 000 000 € → + Honoraires TTC 5 % 50 000 € → **Prix honoraires inclus 1 050 000 €** → + Frais de notaire 7 % → **Prix acte en main 1 123 500 €** → + Travaux → **Coût total après travaux 1 143 500 €**) ; « Revenus hors charges » (76 260 €/an actuels, 80 %, 93 132 €/an potentiels) ; « Charges » (récupérable / non récupérable) ; « Rendement » avec **formules affichées en clair** (brut 7,3 %, brut potentiel 8,3–8,7 %, net 6,9 %, acte en main 6,4 %, acte en main potentiel 7,8 %).
- **« Vendeur »** : Profil (« Particuliers »), Motif de la vente (« Retraite »), Conditions (« financement : Acceptées ; permis de construire : Refusées »). + **« Notre avis »** (texte rédigé) + bandeau indicateurs + mention légale honoraires (« à la charge de l'acheteur soit 5,0 % TTC du prix net vendeur »).
- Mentions légales Hoguet complètes (SIRET, RCS, garantie Galian 120 k€, RCP MMA, carte CPI 7501 2018 000 026 004, TVA).
- ⚠ Incohérence visible : « Notre avis » (74 784 € / 7,1 % / 90 816 €) non resynchronisé avec l'état locatif (76 260 € / 93 132 €).

### Matching acquéreurs (onglet « Acheteurs »)

- Compteurs onglets : Acheteurs **214** ; Commercialisations « SMS à envoyer 2 » ; Propositions « 4 / +215 » ; Offres « 1 à traiter ».
- Historique des matchings : « **Matching du 26/06/25 à 11h32** » — critères 452 m² / 80 % / 945 000 € / 9,6 % ; tags **« Déjà vu exclus », « Agents exclus », « Mandat facultatif »** → résultat **« 214 emails / 182 téléphones »** ; variante « Mandat obligatoire » → « 1 emails / 1 téléphones ».
- Modale de lancement : 3 sources — **« A partir d'une estimation » / « A partir d'un prix » / « A partir d'un dossier »** ; filtres : classes acquéreurs **A B C D**, toggles Déjà vu exclus / Agents exclus / Mandat facultatif ; bouton **« Trouver des acquéreurs »**. (Les estimations ont un statut préfixé numéroté, ex. « 3-Envoyée ».)
- Résultats : « 429 résultats », vues **« Recherches matchées / ajoutées / retirées / ciblées »**, filtres « Avec contact / Avec tel / Avec détails » (Oui/Non/Tous) ; cartes acquéreur avec **grade lettre** (C, G…), secteur, type, critères bornés, badge **« Matchée automatiquement »**, boutons « Voir les détails » / « Retirer ».
- Fiche recherche acquéreur : critères structurés + **« Notes et remarques »** verbatim client (« Immeubles avec plusieurs unités / Occupé a 90% idéalement / … / Ok si pied commercial ») ; traçabilité « **Créée le 02/04/26 par le client (source : Index - Créer une alerte)** ».

### Commercialisation (campagnes email/SMS)

- Historique : « Commercialisation du 26/06/25 » : liens « Dossier V3 PDF », **« WeTransfer »**, « Mandat n°2070 PDF » ; répartition destinataires **par grade** (B 69, C 167…) ; compteurs « **214 mails envoyés** », « **182 SMS à envoyer** ».
- Assistant « Nouvelle commercialisation » : sections **« Dossier », « Mandat », « Acheteurs »** ; alerte **« ⚠ Informations différentes entre l'immeuble, le dossier et le match »** (comparatif 3 lignes : 1 050 000 € vs 1 050 000 € vs 945 000 €).
- Étape WeTransfer : « ⚠ Créez un WeTransfer avec le dossier, les photos, les plans... » + « Accéder au site WeTransfer » → **upload manuel hors outil**.
- Étape emails : champ « Lien WeTransfer », « Générer le message par défaut » / « Copier le message », objet « Immeuble à vendre à … », corps fusionné signé, « Envoyer N emails ».
- Étape SMS : message type + **numéros en paquets de 50** avec « Copier les numéros », bouton final **« Marquer les SMS comme envoyés »** → **envoi SMS 100 % manuel** (copier-coller vers téléphone) ; numéros mal formatés visibles (`0097338384412`, concaténations).

### Propositions & Offres (onglets fiche)

- Propositions : alerte « **⚠ 198 propositions à relancer** », compteurs « 198 à traiter / 17 traitées » ; carte : « Proposition du 26/06/25 », « Relancé le 11/09/25 », statut « A relancer », note de suivi libre, contact + grade, liens dossier, boutons « **Relancer** » / « **Refuser** » ; recherche qui matche aussi sur numéro de téléphone.
- Propositions « Terminées » : **motif de refus qualitatif conservé** (« problème chauffage collectif », « N'achète plus avant 2026 », « Notre recherche s'oriente… panachage LIBRE-OCCUPE favorable à la découpe », « Ne regarde pas les dossiers en dessous de 25 000 000 € ») + bouton « Réactiver ». Modale de refus : champ texte libre « Motif du refus ».
- Offres : « Offre du 01/08/25 » — « 952 381 € + 47 619 € d'honoraires = 1 000 000 € HAI » — « Expire dans **-359 jours** ».

### Synthèse structure (partie C)

**Fiche Bien = 16 entrées latérales** : Suivi | Propriétaire | Emplacement | Etat locatif | Etat technique | Description et prix | Photos | Documents | Acheteurs | Commercialisations | Propositions | Visites | Offres | Notes | Contact | Immeuble.

**Workflow complet** : `Immeuble` → `Estimation` (statuts numérotés « 3-Envoyée ») → `Dossier PDF` versionné → `Mandat n°XXXX` → `Matching` (source estimation/prix/dossier ; filtres grade A–D ; sortie N emails + N téléphones) → `Commercialisation` (WeTransfer manuel → emails générés → SMS copiés-collés) → `Propositions` (relances, refus motivés, réactivation) → `Visites` → `Offres` (net vendeur + honos = HAI, expiration).

---

## À améliorer (synthèse fiche Bien, parties B + C)

1. **Ruptures manuelles dans la chaîne d'envoi** : WeTransfer hors outil ; SMS par copier-coller de paquets de 50 numéros, « Marquer comme envoyés » déclaratif — aucun tracking réel.
2. **Copies désynchronisées** : alerte « Informations différentes entre l'immeuble, le dossier et le match » ; « Notre avis » et email type avec anciens chiffres. Dossier PDF/matching/fiche vivent en silos.
3. **Dette de relance massive** : 198 propositions à relancer sur un immeuble ; offres « Expire dans -359/-1051 jours » — pas d'escalade automatique ni de purge.
4. **RGPD / données en clair** : 199 numéros copiés en bloc, lien WeTransfer non maîtrisé (vs garde-fou §8.3).
5. **Qualité base contacts** : numéros non normalisés (E.164), doublons.
6. **Motif de refus texte libre** : info précieuse (« panachage LIBRE-OCCUPE favorable à la découpe ») non requêtable.
7. **Versionnage artisanal des dossiers** (V3, v4-horodaté) sans régénération automatique quand la donnée change.
8. **Documentaire hors outil** (Google Drive + explorateur) sans lien structuré → coffre `listing_documents`.
9. **Double saisie prix** estimation ↔ modale prix ↔ mandat (charge honoraires re-choisie à chaque étage) → risque d'incohérence, et défaut « charge acheteur » contraire à la doctrine préemption sur lots préemptables (§8.2).
10. **PDF estimation figé non versionné** (« vous ne pourrez plus modifier ») : correction = suppression/recréation.
11. **Données secteur saisies à la main** (Seloger, Notaires…) alors que DVF/loyers sont en base Plein Bail.
12. **Alertes de complétude en pile de toasts** répétitives plutôt qu'un score par section actionnable.
13. **Pas de granularité lot dans le prix** : prix global immeuble uniquement ; pour la découpe il faut du par-lot libre/occupé (absent du Bubble actuel).
14. **n.c. omniprésents** (dates d'entrée bail, DPE, tension locative) — pas de complétion assistée.

## Idées IA / automatisation (fiche Bien)

1. **Source de vérité unique** : prix/loyers/occupation portés par `listings`/`listing_lots` + `price_grids` ; dossier PDF et emails générés à la volée depuis la donnée live (fin des V3/V4 désynchronisés) ; diff automatique « immeuble vs dossier vs matching » avant tout envoi.
2. **Rédaction IA** du descriptif, « Notre avis », corps d'email/SMS — régénérés depuis les données à jour, déclinés par cible (investisseur/marchand/patrimonial/promoteur), validation humaine avant envoi (§7.1).
3. **Pré-remplissage secteur depuis `dvf_benchmarks`/`loyers_benchmarks`/`villes_stats`** : l'étape « Secteur » du wizard devient une validation, pas une saisie ; comparables DVF suggérés à la place des notes libres.
4. **Cohérence prix garantie par le modèle** : une seule source net vendeur/honoraires/charge propagée estimation → grille → mandat → dossier, garde-fou « charge vendeur » automatique sur lots préemptables (§8.2).
5. **Score de complétude par section** + extraction automatique depuis documents uploadés (acte, baux, taxe foncière) : OCR/LLM qui remplit surfaces, réf. cadastrale, loyers, dates de bail, DPE et fait tomber les alertes.
6. **Relances orchestrées** : files J+7/J+30, priorisation IA des propositions dormantes, expiration automatique des offres, brouillons pré-rédigés ; mandat non signé J+7, mandat expirant M−1 → calendrier unifié.
7. **Dataroom Supabase Storage signée** à la place de WeTransfer : expiration, révocation, accès loggé (§8.3), tracking d'ouverture par acquéreur.
8. **Envoi SMS via API** : normalisation E.164, dédoublonnage, opt-out, statut de délivrance réel.
9. **Matching enrichi par IA** : parsing des notes libres acquéreur en critères structurés ; scoring de pertinence ; apprentissage sur les motifs de refus historisés ; classification automatique des refus (prix, taille, localisation, timing…) → analytics « pourquoi ce bien ne part pas ».
10. **Classification automatique des photos** (extérieur/PC/lot) + compression serveur.
11. **Estimation de travaux assistée** par l'historique `provider_quotes` inter-opérations.
12. **Registre des mandats** : numérotation séquentielle immuable côté base (§8.1), lien systématique commercialisation → mandat (le mode « mandat de recherche obligatoire » existe déjà fonctionnellement).
13. **Alertes DPE F/G** (interdictions de location) intégrées à l'état locatif.
