# Cartographie back-office Bubble — Modules « Contact » et « Recherches »

> Source : 18 captures PNG lues via OCR Google Drive. Contexte général visible sur toutes les captures : back-office France Immeuble (Bubble), utilisateur connecté « MAV » (Marc-Antoine VOCI). Les libellés sont retranscrits tels quels ; quand l'OCR est douteux, c'est signalé `[?]`.

## Élément transverse : navigation latérale (visible sur presque toutes les captures)

Menu vertical gauche avec compteurs :
- **Dashboard**
- **Estimations** (36)
- **Immeubles** (53)
- **Mandats** (5)
- **Recherches**
- **Contacts**
- **Propositions** (1)
- **Questions**
- **Visites** (1)
- **Offres** (31)
- **Suivi/Rappels**
- **Objectifs**
- **Datas**
- **? Notion** (lien doc externe)
- Toggle **ON / OFF** (probable interrupteur notifications/mode)
- **Mailing**
- **Dim_max** (outil technique)
- **Debug** (outil technique)
- **Note** `[?]`

Barre inférieure de création rapide, permanente sur tous les écrans : **+ Contact · + Immeuble · + Mandat · + Recherche · + Proposition · + Visite · + Offre**.

---

# MODULE CONTACT

## 1. Capture par capture

### 05.11.24 — Liste des contacts
- Titre : **Contacts**. Onglet/filtre **« Toutes »** + filtre **« Contacts suivis par Marc-Antoine »**.
- Barre de recherche : **« Recherchez un contact... »** + bouton **« Réinitialiser »**.
- Compteur affiché : **« 42793 résultats »**, pagination **« Page 1/280 »**, **« 10 éléments par page »**.
  **Compteur faux — vérifié le 11/08/26 :** la base ne contient que **3 789 contacts**
  (API Bubble : 3 789 · miroir `bo_contact` : 3 789 · compteur du BO confirmé par MAV : 3 789).
  Ni 42 793 ni 280 pages ne correspondent à quoi que ce soit. À ne pas reprendre comme volumétrie.
- Liste sous forme de cartes/lignes, chacune avec :
  - Nom complet (ex. **M. Tahar IKHETEAH**, Thibaud VATAIRE, William SANAA, PIERRE SURAULT, Thierry LESVENTES, David LAMBERT, Thierry CHERBONNIER ×2 — **doublon visible**, Mathieu VEAU, + un contact au nom illisible/corrompu type spam)
  - Type : **« Particulier »** (seul type visible sur cette page)
  - Téléphone, e-mail
  - Badge **« MAV »** (agent suiveur) + badge numérique (10, 30, 01…) — probablement un score/compteur d'activité ou département `[?]`
- Casse incohérente des noms (PIERRE SURAULT tout en majuscules vs autres en casse mixte).

### 05.11.33 — Fiche contact, onglet « Informations »
- En-tête fiche : **M. Tahar IKHETEAH**, badge **« ACHETEUR »** + **« Investisseur »**, e-mail + portable.
- Sous-navigation de la fiche avec compteurs : **Informations · Immeubles 0 · Recherches 1 · Mandats 0 · Propositions 1 · Questions 0 · Visites 0 · Offres 0 · Suivis 0**.
- Actions latérales : **« Appeler »**, **« Envoyer un e-mail »**, **« Supprimer ce contact »**.
- Bloc **Agent France Immeuble** : **« Suivi par »** : Marc-Antoine VOCI
- Bloc **Typologie** :
  - **« Profil »** : Investisseur
  - **« Projet »** : boutons **« Acheter » / « Vendre » / « Interragence »** (sic)
  - Statut relationnel : **« C (Contacté/recherche connue) »** — code de qualification
- Bloc **Coordonnées** : **« Portable »** (0770161330), **« Fixe »**, **« E-mail »**
- Bloc **Informations** : **« Civilité »** (Monsieur), **« Prénom »**, **« Nom »**, **« Date de naissance »**, **« Lieu de naissance »**, **« Adresse »**, **« Carte d'identité »** avec zone d'upload **« Déposez la pièce d'identité ou cliquez »**
- Bloc **Société** : toggle **ON/OFF**, champ **« Raison sociale »**
- **« Notes et remarques »** : zone libre **« Ecrivez ici... »**
- **« Notifications SMS » : Non** / **« Notifications e-mail » : Non**
- **« Source : Appel à l'agence »**
- Traçabilité : **« Création : 10/08/25 (il y a -5 jours) par Marc-Antoine VOCI »** — bug d'affichage : délai négatif (« il y a -5 jours »).

### 05.12.13 — Onglet « Immeubles » du contact
- Bouton **« + Ajouter un immeuble »**. État vide : **« Aucun immeuble possédé »** (croix rouge).

### 05.12.17 — Onglet « Recherches » du contact
- Bouton **« + Ajouter une recherche »**.
- Carte de recherche rattachée : secteur **« 78, 93, 94, 95, 92 »**, contact **« Tahar IKHETEAH »** + badge **C** + badge **MAV**, lien **« Voir les détails »**, type **« Investissement locatif »**, critères en icônes : **Surface** (vide), **Occupation** (vide), **« 1 200 000 à 2 500 000 € »**, rentabilité **« ≥ 7,0 % »**.

### 05.12.21 — Onglet « Mandats » du contact
- Bouton **« + Ajouter un mandat »**. État vide : **« Aucun mandat »**.

### 05.12.26 — Onglet « Propositions » du contact
- Bouton **« + Ajouter une proposition »**.
- Carte proposition : **« Proposition du 10/08/26 »**, contexte **« Recherche d'investissements locatifs »** — Tahar IKHETEAH, statut de relance **« Jamais relancé »**, champ note **« Ecrivez une note de suivi... »**, bien proposé **« Sarcelles - 56 Boulevard du Général de Gaulle »**, document **« Dossier V2 PDF »**, bouton **« X Refuser »**.

### 05.12.30 — Onglet « Questions » du contact
- État vide : **« Aucune question posée »**. Pas de bouton d'ajout visible (les questions viennent du site public).

### 05.12.34 — Onglet « Visites » du contact
- Bouton **« + Ajouter une visite »**. État vide : **« Aucune visite prévue ou réalisée »**.

### 05.12.38 — Onglet « Offres » du contact
- Bouton **« + Ajouter une offre »**. État vide : **« Aucune offre réalisée »**.

### 05.12.43 — Onglet « Suivis » du contact
- Bouton **« + Ajouter un suivi »**. État vide : **« Aucun suivi enregistré »**.

### 05.12.47 — Modale « SUPPRIMER UN CONTACT »
- Titre : **« SUPPRIMER UN CONTACT »** — Tahar IKHETEAH.
- **« Les informations suivantes seront supprimées : »** Contact · Recherches de ce contact · Appels émis depuis le site par ce contact · Questions posées par ce contact · Dossiers téléchargés par ce contact · Propositions de dossier faites à ce contact · Visites faites avec ce contact
- **« Les informations suivantes seront conservées : »** Offres liées à ce contact · Mandats liés à ce contact
- **« Bannir taharblk@gmail.com du site France Immeuble ? »** → boutons **Oui / Non**
- **« Motif de la suppression »** → liste déroulante **« Choisir un motif »**
- Boutons : **« Annuler »** / **« Supprimer le contact »**
- → Logique RGPD/anti-spam déjà pensée : purge des données personnelles mais conservation des pièces à valeur juridique (offres, mandats), avec bannissement e-mail optionnel.

## 2. Synthèse structure / workflow — Contact

- **Modèle** : Contact = hub central. Entités rattachées visibles via onglets à compteurs : Immeubles (possédés — côté vendeur), Recherches (côté acquéreur), Mandats, Propositions (envoi de dossiers), Questions (issues du site public), Visites, Offres, Suivis (journal de relances).
- **Double rôle** acheteur/vendeur porté par le champ **Projet** (Acheter / Vendre / Interragence) + badge de rôle (« ACHETEUR ») + **Profil** (Investisseur…) + **code de qualification** (« C — Contacté/recherche connue » : échelle de lettres de qualification).
- **Workflow apparent** : contact créé (source tracée : « Appel à l'agence », site, etc.) → qualification (profil/projet/code) → création d'une **Recherche** → l'outil rapproche des immeubles → **Proposition** de dossier (PDF) avec suivi de relance (« Jamais relancé ») → **Visite** → **Offre** → **Mandat**. Les « Suivis » horodatent les relances. Le pipeline complet est visible dans la barre « + » du bas, dans l'ordre du tunnel.
- **Alimentation par le site public** : appels émis depuis le site, questions posées, dossiers téléchargés = événements captés automatiquement et rattachés au contact.
- KYC embryonnaire : upload carte d'identité, personne morale (toggle Société + raison sociale).

## 3. À améliorer

- **Dédoublonnage** : doublon flagrant (Thierry CHERBONNIER ×2) ; aucune détection/fusion visible.
- **Qualité des données** : casse non normalisée des noms, contacts spam manifestes en base, numéros sans format uniforme, aucune validation e-mail/téléphone visible.
- **Bug d'horodatage** : « il y a -5 jours ».
- **Volumétrie sans segmentation** : 3 789 contacts, un seul filtre (« suivis par ») + recherche texte. Pas de filtres par profil, code de qualification, source, date de dernière activité, tags.
- **Code de qualification cryptique** (« C ») ; à transformer en statut lisible avec historique.
- **Onglets en silo** : pas de timeline unifiée du contact ; il faut cliquer 8 onglets pour reconstituer l'historique.
- **« Interragence »** : faute + concept à clarifier (inter-agence ?).
- **Suppression** : bonne base RGPD, mais pas d'anonymisation (alternative à la suppression) ni de log d'audit visible ; le bannissement par e-mail seul est contournable.
- Champ **Fixe** quasi inutile, champs identité rarement remplis → formulaire progressif.
- Aucune notion de consentement (opt-in mailing) visible alors qu'un module « Mailing » existe.

## 4. Idées IA / automatisation

- **Scoring & dédoublonnage automatique** : détection fuzzy (nom/e-mail/téléphone) à la saisie + job de fusion assistée ; score anti-spam sur les inscriptions site.
- **Enrichissement auto** : normalisation casse/format téléphone, extraction société depuis le domaine e-mail, géocodage adresse.
- **Timeline unifiée générée** : agrégation de tous les événements + **résumé IA du contact** en tête de fiche (« Investisseur IDF, budget 2,2 M€, 1 proposition en attente de relance depuis X jours »).
- **Relances intelligentes** : tâche automatique J+3/J+7 après proposition, brouillon d'e-mail de relance pré-rédigé (validation humaine avant envoi, §7.1).
- **Qualification assistée** : suggestion automatique du code (A/B/C…) et du profil à partir des comportements.
- **KYC** : OCR de la carte d'identité déposée → pré-remplissage + contrôle de cohérence.
- **RGPD** : anonymisation automatique des contacts inactifs > N mois, registre des suppressions avec motif obligatoire.

---

# MODULE RECHERCHES

## 1. Capture par capture

### 05.09.41 — Liste des recherches (écran principal)
- Titre : **Recherches** + champ **« Recherchez »**.
- **Panneau de filtres** (colonne gauche) : **« Type d'opération »** (Tous) · **« Destination »** (Toutes) · **« Prix »** (€) · **« Rentabilité »** · **« Occupation »** · **« Surface »** · **« Note »** · toggle **« Non suivies uniquement »** · toggle **« Avec contact uniquement »** · **« Tri »** : « Date de modification (plus récents en premiers) » · bouton **« Réinitialiser »**.
- **Onglets de statut** : **« Toutes » · « En cours » · « En attente » · « Archivées »** + filtre **« Recherches suivies par Marc-Antoine »**.
- Compteur : **« 1085 résultats »**. Pagination : **« Page 1/109 »**, **« 10 éléments par page »**.
- **Cartes de recherche** : secteur (ex. « 78, 93, 94, 95, 92 », « Auvergne-Rhône-Alpes », « France entière », « Provence-Alpes-Côte d'Azur, 06 », « Île-de-France, 91, 94, 93, 92, 78 »), nom du contact (Tahar IKHETEAH, Lucas INCONNU, Mathieu VEAU, Patricia DURAY, Gilles INCONNU, Elie KABUYA) + badge qualification (C, D, G…) + badge **MAV**, lien **« Voir les détails »**, type (**« Investissement locatif »** / **« Opération marchande »**), critères : **Surface**, **Occupation**, budget (« 1 200 000 à 2 500 000 € », « 300 000 € », « ≤ 2 000 000 € », « 0 à 4 000 000 € »), **Rendement**.
  - Contacts « INCONNU » = leads site non identifiés.
- **Volet de matching** (recherche sélectionnée) — cœur du workflow :
  - Immeuble apparié : **« Saint-Denis - 146 Rue du Landy »**, **699 m²**, occupation **75 %**, rendement **7,7 %**, prix **2 440 000 €**, mention **« Privé »** (off-market)
  - **« Dossier généré le 03/04/25 »**, coche **« Dernière version »**, fichier **« Dossier Complet Saint_Denis_146_rue_du_landy.pdf »**
  - Compteur **« 0/1 dossier sélectionné »**
  - Boutons d'action : **« Envoyer » · « Créer les propositions » · « Masquer »**
  - → Workflow : recherche → immeubles compatibles listés → sélection de dossiers PDF → envoi en masse → création automatique des « Propositions » rattachées aux contacts.

### 05.09.47 — Modale « Modifier la recherche » (vue complète)
- En-tête : **M. Tahar IKHETEAH** — **« Particulier »** — téléphone + e-mail — **« Recherche suivie par Marc-Antoine VOCI »**.
- **« Secteur »** : compteur « 5 », chips supprimables : **Yvelines, Seine-Saint-Denis, Val-de-Marne, Val d'Oise, Hauts-de-Seine**.
- Type d'opération : **« Investissement »**. Destination : **« Logement »**.
- **Budget** : « 1 200 000 € à 2 500 000 € ». **« Rentabilité »** : min **7** %. **« Occupation »** : min/max en %. **« Surface »** : min/max en m².
- **« Notes et remarques »** (texte libre) : « Jusqu'à 2.2 M€ IDF idéalement 93/92/94/95/78 - Pas de 77 ni de 95 - Rentabilité idéalement 7/8. PLEINBAIL - OK pour marketplace. Logement ou mixte » — noter la **contradiction interne** (« idéalement …95 » vs « pas de 95 ») et le flag marketplace géré en texte libre.
- Traçabilité : **« Créée le 10/08/26 par Marc-Antoine (source : Agent FI (Marc-Antoine VOCI)) »** / **« Dernière modification le 10/08/26 (il y a -5 jours) »** (même bug de délai négatif).
- Boutons bas de modale : **« SUPPRIMER » · « METTRE EN ATTENTE » · « ENREGISTRER LA RECHERCHE »**.

### 05.10.41 — Sélecteur « Type d'opération »
- 4 options : **« Investissement » · « Patrimoine » · « Marchand » · « Promotion »**.

### 05.10.45 — Sélecteur « Destination »
- Liste à cases : **« Logement »** (sélectionné) · **« Commerce »** · **« Bureau »** · **« Logistique »** · **« Cave »** · **« Parking »** · **« Annexe »**. Multi-sélection possible.

### 05.10.50 — Panneau « Secteur »
- Sélecteur géographique à 3 niveaux : **« Régions »** / **« Département »** / **« Villes »** (« Recherchez une ville... »), chips sélectionnées affichées en dessous. Le secteur mélange librement régions, départements et villes.

### 05.10.54 — Dropdown « Régions »
- 13 régions métropolitaines listées.

### 05.10.57 — Dropdown « Départements »
- Liste au format **« numéro - nom »** (01 - Ain, 02 - Aisne, …), scrollable complète.

## 2. Synthèse structure / workflow — Recherches

- **Entité Recherche** = cahier des charges acquéreur, rattachée (ou non) à un contact, suivie par un agent, cycle de vie **En cours → En attente → Archivée**.
- **Champs structurés** : secteur multi-niveaux (région/département/ville), type d'opération (Investissement / Patrimoine / Marchand / Promotion), destination multi-choix (Logement / Commerce / Bureau / Logistique / Cave / Parking / Annexe), budget min-max, rentabilité min, occupation min-max %, surface min-max m², notes libres.
- **Workflow central = matching → proposition** : liste → recherche sélectionnée → immeubles compatibles avec dossier PDF versionné → sélection → **« Envoyer »** ou **« Créer les propositions »** ou **« Masquer »**. Distinction biens **« Privé »** (off-market) visible dans le matching.
- Les leads anonymes du site (« Prénom INCONNU ») créent aussi des recherches → file de qualification.
- Ancêtre direct du pont **cockpit → marketplace Plein Bail** : la note « PLEINBAIL - OK pour marketplace » montre que l'éligibilité marketplace est gérée… en texte libre.

## 3. À améliorer

- **Critères clés enfouis dans les notes libres** : exclusions de départements, tolérances, mixité, flag marketplace — à structurer (champs inclus/exclus, plage souple/stricte, booléen marketplace). Le matching actuel ne peut pas les exploiter.
- **Contradictions non détectées** (« idéalement 95 » / « pas de 95 »).
- **Matching apparemment manuel/statique** : dossier apparié généré 14 mois avant — pas de re-matching automatique, pas de score de pertinence, pas de notification.
- **1085 recherches / 109 pages** sans vue « recherches actives sans proposition récente », sans tri par fraîcheur, sans détection des recherches mortes.
- **Pas de champ « exclusions » géographiques** ni de granularité infra-ville.
- **Doublon conceptuel budget** : budget structuré 2,5 M€ vs note « jusqu'à 2,2 M€ ».
- Bug récurrent « il y a -5 jours » ; libellé de tri fautif (« premiers »).
- Suivi de version des dossiers PDF fragile (nommage fichier) ; pas de trace de qui a reçu quelle version.

## 4. Idées IA / automatisation

- **Parsing IA des notes libres → critères structurés** : à la migration, extraire automatiquement exclusions, fourchettes réelles, mixité, flag marketplace depuis les 1085 notes existantes ; en usage courant, suggérer la structuration à la saisie et signaler les contradictions.
- **Matching continu et scoré** : chaque nouvel immeuble/lot confronté en temps réel aux recherches actives ; score pondéré (secteur, budget, rentabilité DVF/loyers déjà en base, occupation, destination) ; alerte avec brouillon de proposition — envoi validé humainement.
- **Rapprochement DVF automatique dans la carte de match** : gap prix/m² vs `dvf_benchmarks` pour prioriser les envois.
- **Cycle de vie automatisé** : recherche sans interaction depuis N jours → suggestion de mise en attente + e-mail de re-qualification pré-rédigé.
- **Dédoublonnage recherches** : fusion proposée des recherches quasi identiques d'un même contact.
- **Qualification des leads « INCONNU »** : séquence automatique d'identification avant intervention d'un agent.
- **Traçabilité des envois** : journaliser quelle version de dossier a été envoyée à qui et quand (base de la dataroom loggée, §8.3).
- **Pont marketplace natif** : remplacer le tag texte « PLEINBAIL-OK » par un booléen synchronisé avec `listings`/`saved_searches` de Plein Bail.

---

## Note de fiabilité OCR
Points incertains à vérifier sur les originaux : badge numérique des cartes contact (10/30/01), le « ≥ 7,0 % » de rentabilité, l'entrée de menu « Note », l'orthographe exacte « Interragence ».
