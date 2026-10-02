# Cartographie back-office Bubble — Fiche « Bien » (fiche immeuble détaillée)

> Source : ~100 captures du dossier Drive « Bien », lues en 3 lots chronologiques.
> Immeubles d'exemple : Villejuif (94800) — 9 Av. de Paris (statut « À transformer », 640 000 €)
> et Brueil-en-Vexin (78440) — 37 Rue du Vexin (mandat n°2070, « Commercialisé (public) », 1 050 000 €).

---

## PARTIE A — Suivi, Propriétaire, Emplacement, État locatif (Lots/Baux/Locataires/Charges), État technique (16h52–17h00)

> 34 captures lues (1 corrompue ignorée ; 5 micro-popups illisibles à l'OCR, signalées).
> Immeuble d'exemple : Villejuif (94800), 9 Avenue de Paris — « A transformer » — 640 000 € — « Attente infos » — MAV.

### Détail capture par capture

#### Suivi.png — onglet « Suivi »
- **Navigation droite de la fiche (présente partout)** : Suivi · Propriétaire · Emplacement · Etat locatif · Etat technique · Description et prix · Photos · Documents · Estimations · Mandats · Dossiers · Tous les documents · Acheteurs · Notes.
- Champs : « Création » = 12/02/26 à 15h38 · « Dernière modification » = Marc-Antoine VOCI, 19/02/26 · **« Source de l'immeuble »** → « Source » = *Site - Formulaire Vendre* · **« Apporteur »** = Non.
- **« Historique des échanges (3) »** + `+ Ajouter un suivi` :
  - 19/02/26 — « Attente infos » — *« Il en veut 900 k€ ce qui est impossible à recontacter dans 6 mois »* (rappel 07/09/26) ;
  - 18/02/26 — Estimation (640 000 €) ;
  - 12/02/26 — Formulaire — texte brut du formulaire vendeur (« Petit immeuble mixte, 1 commerce en rez de chaussée, 2 F2 au dessus et une maison avec jardin à l'arrière… »).
- Journal chronologique typé (Formulaire / Estimation / statut) avec rappel daté.

#### Propriétaire.png — onglet « Propriétaire »
- **« Profil »** : William ABERGEL · 06.99.84.03.22 · w.abergel@gmail.com. Champ **« Motif de la vente »** (vide).
- **« Immeubles appartenant au même propriétaire »** : carte de l'autre bien — *Gif-sur-Yvette (91190)* · « Estimation (proc) » · « Pas de dossier » · « Pas de mandat » · *« Archivé le 03/03/26 car Ne souhaite pas vendre »* · 130 m² · 100 %.
- Vision multi-biens par propriétaire (cross-selling), motif d'archivage tracé.

#### aDRESE.png — Emplacement > Adresse
- **Sous-onglets Emplacement** : « Adresse » · « Parcelles et PLU » · « Prix du secteur ».
- Deux cartes Google + zone d'upload *« Déposez la capture d'écran des maps ici »*.
- **« A proximité »** : liens de recherche pré-construits *Google-Gares, Google-Bus, Google-Routes, Google-Ecoles, Google-Commerces* ; POI : « Villejuif Léo Lagrange — 3 min à pied », « E.Leclerc » ; champs « Moyen de locomotion » (à pied / en voiture), « Ville », « Saisissez un autre point d'intérêt... ».
- **Data externe** : liens *INSEE - Population*, *INSEE - Revenus*, *Service Public - Zones tendues*, *LOCservice - Tensiomètre* ; valeurs saisies : « Habitants INSEE » = 56 349 · « Revenus médian INSEE » = 21 020 €/an · « Zone tendue » = Oui · « Tension locative LOCservice » = Modérée.
- **Workflow : l'agent clique les liens, va chercher l'info à la main et la recopie** (y compris capture d'écran de Maps).

#### Parcelles PLU.png — Emplacement > Parcelles et PLU
- **« Parcelles »** : `+ Ajouter une parcelle` ; photo *« Déposez la photo de la parcelle ou cliquez ici »* ; liens *Cadastre*, *Géoportail*, *Google*.
- **« Plan Local d'Urbanisme (PLU) »** : « Zone », « Type de zone », « Hauteur max » (m), « Emprise max ». + **« Documents »**.
- Consultation manuelle du cadastre/PLU puis recopie + upload de captures.

#### Prix du secteur.png — Emplacement > Prix du secteur
- « Mis à jour le 17/02/26 ». Tableau **« Immeuble entier »** : colonnes **Secteur / Actuel / Potentiel**, lignes loyer €/m²/mois, loyer annuel k€/an, prix €/m², rendement %, valeur € + écarts % :
  - Secteur : 23,1 €/m²/mois · 40 k€/an · 4 575 €/m² · 6,1 % · 663 390 € (fourchette 580 198 – 859 198 €) ;
  - Actuel : 20,2 €/m²/mois (−13 %) · 35 k€/an · 4 414 €/m² (−4 %) · 5,5 % · 640 000 € ;
  - Potentiel : 30,7 €/m²/mois (+33 %) · 53 k€/an · 4 559 €/m² · 8,1 % · 661 000 €.
- **« Détail par destination »** : Logements (119 m² carrez · 23 €/m²/mois · 4 810 €/m² · 5,7 %) ; Commerces (26 m² · 23,5 €/m²/mois · 3 500 €/m² · 8,1 %).
- **Valorisation bloc actuel/potentiel vs marché, ventilée habitation/commerce — l'ancêtre direct du futur module grilles/DVF.**

#### Clic sur logement.png / Clic sur commerces.png — popups « Modifier les valeurs du secteur »
- Logements : « Loyer du secteur » = 23 €/m²/mois · « Prix du secteur » = 4 810 €/m² · « Rendement du secteur » = 5,7 % · « Commentaire ». Liens sources : *Seloger, Notaires, Notaires Paris, Maps, Adresse*.
- Commerces : « Loyer du secteur » = **282 €/m²/an** (unité différente côté commerce !) · 3 500 €/m² · 8,1 %. Liens : *LocalCommercial.net, UnEmplacement, Maps, Adresse*.
- **Les benchmarks de secteur sont saisis à la main depuis des sites externes.**

#### Lots.png — Etat locatif > Lots (vue standard)
- **Sous-onglets Etat locatif** : « Lots » · « Baux » · « Locataires » · « Charges ».
- **Bandeau synthèse** : 3 Logements · 1 Commerce · 0 Bureau/Entrepôt/Cave/Parking/Annexe — « 4 lots » · 145 m² · 35 160 €/an actuel · 62 % · 53 340 €/an potentiel · 6 000 € travaux · loyers moyens 23 → 23,5 €/m²/mois.
- **Bascules d'affichage** : « Batiment », « Surf. utile », « Baux », « Loyers/m² », « Commentaire ».
- **Colonnes** : Référence (Bat. · Etg · N° · Dest · Type) | Général (Carrez · Au sol · Type bail) | Loyer (HC actuel · €/m² · loyer potentiel · €/m²) | Etat (Etat · Travaux) | Autres (DPE · Rénov. · Commentaire · Photos).
- Exemples : T2 32 m² Nu 930 € (+27 %) ; Maison 55 m² Vide → 1 515 € (+20 %) · Travaux 6 000 € ; « Autre » 26 m² carrez / 66 m² au sol · **3/6/9** · 1 200 € (+97 %) · « Auto ecole sur deux niveaux ».

#### Ajouter un lot.png — popup « Nouveau lot »
- Groupes : **Référence** (Batiment · Etage · Numéro, incrément auto) ; **Type de lot** (Destination · Type) ; **Surface** (Carrez · Utile) ; **Occupation** (Type de bail · Loyer actuel) ; **Etat** (Loyer potentiel · Etat · Année rénov. · Description rénovation · DPE) ; **Travaux** / **Locataire** / **Bail** (sélections multiples) ; **Commentaire**. Bouton `> Créer 1 lot`.
- **Le lot est le pivot, relié en n-n aux travaux, locataires et baux.**

#### Dupliquer un lot.png / Supprimer des lots.png
- « Copier des lots » : sélection multiple + « Nombre de copies » (1–20) — duplication en masse pour lots répétitifs.
- « Supprimer des lots » : liste à cocher libellée par occupation (« 1 T2 occupé », « 3 Maison libre »…), « Tout sélectionner / Tout retirer ».

#### Lots grand ecran.png / Lots petit ecran survol bouton.png
- Grand écran : colonnes supplémentaires « Entrée » et « Locataire » ; barre complète `+ Ajouter · Dupliquer · Modifier · Supprimer · Importer · Plein écran · Télécharger · Enregistrer`.
- Petit écran : colonnes condensées (disparition €/m², au sol, entrée, locataire), actions cachées au survol — **peu utilisable en mobilité**.

#### Importer.png / Import excel.png / Exporter.png — import/export CSV des lots
- Import : « 200 lignes maximum », « décimaux avec un POINT », « valeurs au format TEXTE », « numéros de lot en CHIFFRES », « max 20 MB », « csv séparateur ; ».
- Template CSV, colonnes : `batiment · etage · numero · Destination · Type_lot · surface_carrez · surface_sol · Type_bail · loyer · loyer_vol_m · loyer_max · loyer_vol_m(bis) · Etat · Type_dpe · renov_year · renov_descr · commentaire`.
- **Référentiels visibles** : Destination (Logement, Commerce, Bureau, Logistique…) ; Type_lot (liste géante mêlant T1…T7/Duplex et activités : Boucherie, Banque, Agence immobiliere, Auto-école…) ; Type_bail (Nu, Meuble, Loi 48, Loi 89, Précaire, Tourisme, Civil, COP, Ferme, n.c., Vide) ; Etat (Neuf, Renove, Bon etat, Etat d'usage, Travaux).
- Export : « 4 lots vont être téléchargés au format csv ».

#### 04.57.49 / 04.57.54 — dropdowns inline du tableau Lots
- « Type » (logement) : Studio, Studio + ext, T1…T7 (+ ext), Duplex Studio, Duplex T1…
- « Type bail » : **Nu, Meuble, Airbnb, Loi 48, Loi 89, Civil, COP, n.c., Vide** (+ « 3/6/9 » sur la ligne commerce).

#### 04.57.59 — popup « Nouveau bail »
- « Locataires » (multi) ; « Conditions du bail » : toggle **« Bailleur personne morale »** · « Type de bail » · « Loyer initial » · « Début » · « Fin » ;
- **« Indice IRL »** : « Valeur initiale » · « Valeur actuelle » · **« Loyer révisé théorique »** (calculé) · **« Prochaine échéance »** ;
- **« Statut »** : Bail en cours · Impayés · Préavis déposé · Expulsion en cours ;
- « Documents » (multi) ; « Commentaire ». Bouton `> Créer le bail`.

#### 04.58.03 — popup « Nouveau locataire »
- « Coordonnées » : Civilité · Prénom · NOM · E-mail · Téléphone · toggle **« Personne morale »** ; « Lots » ; « Baux » ; « Commentaire ».

#### 04.58.10 / 04.58.13 — illisibles (OCR vide)
- Vraisemblablement vues de détail/confirmation locataire-bail. À re-capturer si besoin.

#### 04.58.24 / 04.58.31 — Etat locatif > Baux / Locataires
- Baux : compteurs **« 0 actifs · 0 impayés · 0 expulsions · 0 préavis »** — les baux de l'exemple n'existent qu'en colonnes de lots, pas en objets « bail ». `+ Ajouter un bail`.
- Locataires : « 0 personne physique · 0 personne morale ». `+ Ajouter un locataire`.

#### 04.58.39 / 04.58.45 — Etat locatif > Charges
- « Taxes et impôts » : « Taxe Foncière » = 3 718 €/an (− 1 450 €/an en regard) ; « Charges » : 2 268 €/an + `+ Ajouter une charge`.
- Dropdown « Type de charge » : Taxe Foncière, Taxe Bureau, Poubelles, Ménage, Internet, Gaz, Fuel, Entretien, Electricité, Eau, Assurance, Ascenseur, Autre, Cotisation Foncière des Entreprises, CRL.

#### 04.58.50 / 04.58.55 / 04.59.02 — illisibles (OCR vide)
- Vraisemblablement fin du formulaire d'ajout de charge et en-tête de l'onglet Etat technique.

#### 04.59.10 → 04.59.55 — Etat technique (Composants / Travaux)
- **Sous-onglets** : « Composants » · « Travaux ». Champs : « Année de construction » · « Etat général ».
- **Composants** : cartes « Chauffage / Façade / Fenêtres / Toiture — Matériau à préciser — Etat à préciser — Travaux 15 000 € (façade) ».
- Popup « Nouveau composant » — « Type » : Parties communes, Ascenseur, Assainissement, Charpente, Chauffage, Combles, Electricité, Façade, Fenêtres, Plomberie, Toiture, Ventilation, Volets, Autre. « Matériau » (dépendant du type ; façade : Crépi, Briques, Béton, Peinture, Pierres, Bois, Double peau, Enduit, Colombages, Autre). « Etat » : Neuf, Rénové, Bon, Moyen, Travaux, n.c., Constructible, PC purgé. + Année rénov., description, travaux liés.
- **Travaux** : bandeau « 6 000 € sur les lots · 15 000 € sur le bâti » ; listes par urgence (« très urgents » : Lot 3 — 6 000 € ; « peu urgents » : Façade — 15 000 €). `+ Ajouter des travaux`.

### Synthèse structure (partie A)

```
Fiche Bien (header : ville + CP, tag "A transformer", prix, statut, agent)
├── Suivi                → source, apporteur, historique des échanges typé + rappels
├── Propriétaire         → profil contact, motif de vente, autres immeubles du même proprio
├── Emplacement
│   ├── Adresse          → maps, POI/temps de trajet, INSEE, zone tendue, tension locative
│   ├── Parcelles et PLU → parcelles (photo), zone PLU, hauteur/emprise max, documents
│   └── Prix du secteur  → benchmark Secteur/Actuel/Potentiel + détail Logements/Commerces
├── Etat locatif
│   ├── Lots             → tableau tableur + CRUD, duplication, import/export CSV, plein écran
│   ├── Baux             → objets bail (IRL, statut impayés/préavis/expulsion), compteurs
│   ├── Locataires       → personnes physiques/morales liées aux lots et baux
│   └── Charges          → taxes et impôts + autres charges (référentiel de types)
└── Etat technique
    ├── Composants       → année constr., état général, composants (type/matériau/état/travaux)
    └── Travaux          → lignes par urgence, rattachées à un lot OU un composant
```

Modèle implicite : **Bien 1-n Lots** ; Lot n-n {Locataires, Baux, Travaux} ; Bail n-n Locataires/Documents ; Travaux → Lot **ou** Composant ; benchmarks par destination au niveau du bien. Correspondance directe `listings` / `listing_lots`.

### Frictions spécifiques (partie A)

1. **Saisie manuelle massive de données publiques** : INSEE, zones tendues, tension locative, cadastre, PLU, prix/loyers de secteur — tout recopié à la main depuis des liens externes, y compris des captures d'écran de Maps déposées en images. Aucune API.
2. **Benchmarks déclaratifs** sans source ni horodatage par valeur ; incohérence d'unités (logements €/m²/mois vs commerces €/m²/an).
3. **Import CSV fragile** : contraintes reportées sur l'utilisateur (point décimal, TEXTE, `;`, 200 lignes).
4. **Double représentation des baux** : colonne du lot ET objet « Bail » séparé — 4 lots loués mais « 0 baux actifs ». Désynchronisation permanente.
5. **Responsive dégradé** : colonnes clés disparaissent en petit écran, actions au survol — inutilisable en visite.
6. **Référentiel Type_lot fourre-tout** (typologies logement + activités commerciales mélangées) ; le commerce d'exemple est saisi en Dest « Autre ».
7. **« À préciser » omniprésents** dans l'état technique : pas de complétude guidée.
8. **Suivi en texte libre** : prix attendu et date de relance enfouis dans la prose, rappel ressaisi à part.
9. **UI en cascade de micro-popups** (plusieurs illisibles même à l'OCR) → à remplacer par panneaux/formulaires pleine hauteur.
10. **Pas de lien automatique travaux ↔ valorisation** : montants saisis à 3 endroits, loyer potentiel/gap déclaratif.

### Idées IA / automatisation (partie A)

1. **Enrichissement adresse automatique** : INSEE population/revenus, zone tendue via `geo_communes` + `villes_stats` (déjà en base Plein Bail), carte statique générée.
2. **Prix du secteur depuis `dvf_benchmarks`/`loyers_benchmarks`** (~187 k lignes déjà chargées) : médiane m², rendement, fourchette calculés, horodatés, sourcés ; le « Potentiel vs Actuel » devient le moteur bloc/découpe du cockpit.
3. **Cadastre/PLU par API** (API Carto IGN / Géoportail de l'urbanisme) : parcelles, zone, emprise, hauteur automatiques ; plan de parcelle généré.
4. **Import état locatif par IA** : n'importe quel fichier (Excel sale, PDF, photo) → extraction LLM vers `listing_lots` avec écran de validation, au lieu du CSV contraint.
5. **Lecture de baux (OCR + LLM)** : upload du bail → type, loyer, dates, IRL, locataire ; loyer révisé théorique et prochaine échéance calculés + **fenêtre de congé** et compte à rebours préemption (§8.2).
6. **Parsing du suivi en texte libre** : « il en veut 900 k€… dans 6 mois » → prix vendeur structuré + rappel créé automatiquement.
7. **Loyer potentiel par lot suggéré** depuis `loyers_benchmarks` (typologie/surface) avec justification.
8. **Chiffrage travaux assisté** par photos + composants + historique `provider_quotes` inter-opérations.
9. **Détection d'incohérences** : bail « Vide » avec loyer, unités commerce, surface au sol < carrez, lot occupé sans locataire, baux objets ≠ colonnes — badge qualité par fiche.
10. **Génération auto de description et dossier** depuis lots + secteur + travaux (description commerciale, teaser off-market, tableau de valorisation).

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
