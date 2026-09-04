# Cartographie back-office Bubble — Dashboard + barre d'action

> Source : 19 captures (dossier Drive « Dashboard » + sous-dossier « Barre d'action en bas »), lues par OCR.
> Limite : 2 fichiers (`Créer mandat.png`, `Bouton contacter pour passer à la suite.png`) illisibles à l'OCR — décrits par inférence (signalé).

---

## 1. Vue d'ensemble du Dashboard

### Structure générale
Entonnoir **kanban sur 3 lignes horizontales**, chaque ligne = un macro-stade du cycle de vente, chaque ligne contenant 3 colonnes dans lesquelles circulent des **cartes immeuble** :

| Ligne | Colonnes (libellés exacts) |
|---|---|
| **PROSPECTS** | `FORMULAIRES A TRAITER` → `IMMEUBLES A ESTIMER` → `A TRANSFORMER` |
| **COMMERCIALISATIONS** | `PREPARATION MANDAT ET DOSSIER` → `COMMERCIALISES AUX CLIENTS A ET B` → `COMMERCIALISES A TOUS LES CLIENTS` |
| **VENTES** | `OFFRES ACCEPTEES` → `COMPROMIS SIGNES` → `VENDUS EN 2026` |

Chaque ligne porte des **filtres/onglets** : `En cours [n]` / `En attente [n]` / `Immeubles suivis par [agent]`, plus des compteurs par colonne (ex. Prospects : 336 / 16 ; Commercialisations : 36 / 2 / 20). La ligne VENTES affiche des **agrégats de CA honoraires** : `0 k€ HT`, `45 k€ HT 3` (montant HT cumulé + nombre de dossiers).

### Rail latéral (sidebar gauche) — libellés + compteurs
`Dashboard` · `Estimations` **36** · `Immeubles` **53** · `Mandats` **5** · `Recherches` · `Contacts` · `Propositions` (badge 1) · `Questions` · `Visites` **9** · `Offres` **31** · `Suivi/Rappels` · `Objectifs` · `Datas` · `? Notion` (doc externe) · `Mailing` (toggle ON/OFF) · `Dim_max` · `Debug` (outils internes)

### Barre de recherche
`Recherchez un immeuble...` (recherche globale orientée immeuble uniquement).

### Barre d'action en bas (création rapide, 7 boutons)
`+ Contact` · `+ Immeuble` · `+ Mandat` · `+ Recherche` · `+ Proposition` · `+ Visite` · `+ Offre` — chaque bouton ouvre une modale de création. Point d'entrée unique de toutes les entités du CRM.

### Anatomie d'une carte immeuble (récurrente sur tout le kanban)
- Ville + département (`Faches-Thumesnil (59)`), adresse (`81 Rue Jean Jaurès`)
- Contact propriétaire : initiale + NOM (`R. BOUGAILLOU`)
- Date + dernière note de suivi tronquée (`30/04/26 A toujours un voisin intéressé mais...`)
- Badge `RV` (rendez-vous), prix (`680 000 €`, `2 340 000 €`)
- Bouton d'avancement contextuel : `> Contacté`, `> Estimer`, `> OK pour vendre`, `> Programmer le compromis`, `Réactiver`
- Cartes en attente : motif (`Temps de réflexion`, `Vacances`, `Attente infos`, `Autre`, `Démarche locative`) + date de réactivation
- Cartes commercialisation : statut mandat (`Mandat à signer 24/11/20`, `Mandat expiré`, `Estimation`) + triple compteur type `4 | 0 | 0` (vraisemblablement propositions / visites / offres)
- Cartes ventes : honoraires (`18 k€`) + prix (`450 000 €`)

---

## 2. Détail capture par capture

### Dossier « Dashboard »

**Premire ligne.png** — Ligne **PROSPECTS** complète. `FORMULAIRES A TRAITER` / `IMMEUBLES A ESTIMER` (En cours 5) / `A TRANSFORMER` (15 ; onglet `En attente`, `Immeubles suivis par Romain`, compteurs 336 / 16). Cartes issues du formulaire web (`Formulaire` comme source), cartes à relancer (`Mess voc laissé le…`, `Mess voc + SMS le…`, `Point avec co-décisionnaires`), cartes en attente avec motif + montant + `Réactiver`. Boutons d'avancement : `> Contacté` (formulaires), `> Estimer`, `> OK pour vendre`.

**Deuxieme ligne.png** — Ligne **COMMERCIALISATIONS**. `PREPARATION MANDAT ET DOSSIER` (cartes `Attente infos`, `Autre` + montants + `Réactiver`) / `COMMERCIALISES AUX CLIENTS A ET B` (2) / `COMMERCIALISES A TOUS LES CLIENTS` (20). **Segmentation clients A/B vs tous** (diffusion progressive off-market → large). Statuts mandat : `Mandat à signer 24/11/20` (Saint-Maur-des-Fossés, 3 120 000 €), `Mandat expiré`, `Estimation`. Triple compteurs `4|0|0`, `4|10|10` sous les cartes.

**Troisieme ligne.png** — Ligne **VENTES**. `OFFRES ACCEPTEES` (3 cartes) / `COMPROMIS SIGNES` (`45 k€ HT 3`) / `VENDUS EN 2026` (`0 k€ HT`). Cartes avec honoraires attendus (`18 k€` / `450 000 €`, `17 k€` / `475 000 €`, `10 k€` / `256 000 €`). Bouton `> Programmer le compromis`. La ligne VENTES sert de mini-pipeline de CA.

**Selection Agent.png** — Sélecteur d'agent sur le filtre de ligne : `Immeubles suivis par Marc-Antoine` / `…Guillaume` / `…Sophie` / `…François` / `…Romain`. Le filtre recharge le kanban par portefeuille agent. ~5 agents avec affectation d'immeubles.

**Passage en En attente.png** — Onglet **`En attente`** (compteur 6). Chaque carte : ville, date d'entrée, contact, **motif d'attente**, note libre (« on veut 900 k€ ce qui est impossible à recontacter dans 6 mois »), **montant**, **date de réactivation** future (jusqu'à 01/09/27) et bouton `Réactiver`. Mécanisme de **nurturing différé**.

**Bouton Ajouter un suivi.png** — Modale **`Suivi`** : `Personne contactée`, `Objet de l'échange` (immeuble), `Contacté par` (`Téléphone` / `Message téléphonique` / `SMS` / `E-mail`), `Notes`, `Mettre en attente` (Oui/Non), `Annuler` / `Enregistrer le suivi`. Un suivi = log d'interaction rattaché au couple contact + immeuble.

**Ajouter un suivi 2.png** — Même modale, option attente dépliée : `Mettre en attente jusqu'au 10/08/2026 car [Sélectionnez un motif]` → l'enregistrement d'un suivi peut **simultanément** basculer la carte en attente avec date + motif obligatoire.

**Bouton Historique.png** — Historique de suivis in-card : liste chronologique datée (`14/04/25 Formulaire`, `30/10/25 « Je l'ai eu au téléphone la notaire... »`), statut `Attente infos`, badge compteur (nombre de suivis).

**Bouton ... .png** — Menu contextuel **`Autres actions`** : `Envoyer un e-mail` / `Archiver` / `Transférer à un collègue` / `Renvoyer à l'étape précédente`. (Avance = bouton d'étape ; retour = ce menu.)

**Bouton contacter pour passer à la suite.png** — *(OCR vide — inférence)* : zoom sur le bouton `> Contacté` ; un clic marque le prospect contacté et fait passer la carte à la colonne suivante. Progression manuelle, un clic par franchissement d'étape.

### Sous-dossier « Barre d'action en bas »

**Bouton contact.png** — Modale `+ Créer un nouveau contact` en ouverture (champ `E-mail` en premier). L'e-mail est le champ d'entrée/dédoublonnage du contact.

**Modale Contact.png** — Modale complète : `E-mail` ; bloc **`Objets qui seront reliés au contact`** : `0 recherche` / `0 question` / `0 proposition` (rapprochement automatique des objets existants portant cet e-mail) ; `Source` ; `Projet` ; `Profil(s)` ; `Civilité` ; `Prénom` ; `Nom` ; `Entreprise` ; `Portable` ; `Fixe` ; `Suivi par` ; `Note` ; `Créer le contact`.

**Créer nouvel Immeuble.png** — Modale : `Source` ; `Suivi par` ; `Propriétaire` (`Recherchez un contact...`) ; `Adresse` ; `Informations et remarques` ; `> Créer l'immeuble`. Création minimaliste : 4 informations, enrichissement ensuite.

**Créer mandat.png** — *(OCR vide — inférence)* : premier état de la modale mandat.

**Créer mandat suite.png** — Modale `Créer un nouveau mandat` : `Type de mandat` (« Mandat de vente ») ; `Objet du mandat` (`Recherchez un immeuble...`) ; `Mandants` (`Recherchez un contact...` + `Type de mandant` : « Personne physique », bouton `+` multi-mandants — indivisions) ; `Informations et remarques` ; `> Créer le mandat`. **Aucun champ de numéro de mandat, date de signature, échéance ni taux d'honoraires dans cette modale.**

**Créer nouvelle recherche.png** — Modale : `Acheteur` ; `Type de recherche` ; `Suivi par` ; `Secteur` (« France entière ») ; `Destinations` (multi : `Logement` / `Commerce` / `Bureau` / `Logistique`) ; `Prix` (€) ; `Occupation` (%) ; `Rentabilité` (%) ; `Surface` ; `Informations et remarques` ; `Créer la recherche`. Moteur de **matching immeuble ↔ acquéreur**.

**Créer nouvelle proposition.png** — Modale `Nouvelle proposition` : `Envoyé par` ; `Sélectionnez un immeuble` ; `Dossier` (sélecteur) ; `Sélectionnez un acheteur` ; `Recherche(s) correspondante(s)` (rappel du matching) ; `Remarques` ; `Envoyer par e-mail` (Oui/Non) ; `> Créer la proposition`. Relie immeuble + dossier + acheteur, notification e-mail optionnelle.

**Créer nouvelle visite.png** — Modale : `Immeuble à visiter` ; `Visiteurs` (pluriel) ; `Date` (+ heure) ; `Informations et remarques` ; `Statut` ; `Notifier les visiteurs par e-mail` (Oui/Non) ; `Programmer la visite`.

**Créer nouvelle offre.png** — Modale : `Immeuble objet de l'offre` ; `Acheteur ayant formulé l'offre` ; `Prix de l'offre` : `Prix FAI` € **dont** `Honoraires` €TTC (décomposition saisie à la main) ; `Date de l'offre` ; `Durée` (`pour [n] jours` — validité) ; `Informations et remarques` ; `Notifier le vendeur par e-mail` (Oui/Non) ; `Créer l'offre`.

---

## 3. À améliorer (points de friction visibles)

1. **Progression 100 % manuelle et un-clic sans garde-fou** : `> Contacté`, `> Estimer`, `> OK pour vendre`, `> Programmer le compromis` avancent la carte sans checklist ni condition (pas de contrôle « mandat signé avant commercialisation », « offre acceptée avant compromis »). Retour arrière caché (`Renvoyer à l'étape précédente`).
2. **Pas de notion de lot ni d'état locatif** sur les cartes : l'unité est l'immeuble en bloc. Rien sur baux, loyers, occupation, congés.
3. **Mandat sous-modélisé à la création** : ni numéro de registre, ni dates, ni taux d'honoraires dans la modale (saisis après coup). Risque Hoguet : pas de registre séquentiel apparent à la création.
4. **Suivi tronqué et pauvre** : notes écrasées en une ligne ; canal déclaratif retapé dans la note ET dans le champ canal — double saisie.
5. **Relances = mémoire humaine** : `En attente` + `Réactiver` avec date fixée à la main jusqu'à 12+ mois, sans file de relances du jour priorisée.
6. **Compteurs illisibles** : triples compteurs `4|0|0` sans libellé, compteurs incohérents entre captures, agrégats `k€ HT` peu explicites.
7. **Recherche globale mono-entité** (immeuble uniquement).
8. **Saisies redondantes** : prix FAI et honoraires à la main dans l'offre (aucun calcul), estimation sans données de marché, adresses texte libre sans géocodage.
9. **Dépendances externes bricolées** : `? Notion` pour la doc, `Mailing ON/OFF` global, `Dim_max`/`Debug` en prod.
10. **E-mail non threadé** : action ponctuelle, réponses non ingérées dans l'historique.
11. **Segmentation clients A et B implicite** : suppose un scoring acquéreurs invisible dans la fiche contact.

## 4. Idées IA / automatisation pour la refonte

1. **Qualification automatique des formulaires entrants** : parsing IA → création immeuble + contact pré-remplis, géocodage, pré-estimation bloc via `dvf_benchmarks`/`villes_stats` affichée dès la colonne « À estimer ».
2. **Suivis dictés/transcrits** : note vocale → transcription, extraction structurée (canal, interlocuteur, engagement, prochaine échéance) → suivi + tâche de relance automatiques.
3. **File de relances intelligente** : moteur `tasks`/`reminders` avec suggestion IA de date et motif depuis la note (« à recontacter dans 6 mois » → réactivation proposée), et un « aujourd'hui » priorisé multi-opérations.
4. **Passages d'étape avec garde-fous** : chaque transition génère sa checklist (template de phases §3.3) ; blocages durs pour les invariants (mandat au registre avant commercialisation, honoraires charge vendeur sur lots préemptables, pas d'honoraires avant l'acte).
5. **Matching acquéreurs automatique côté serveur** : liste scorée des recherches compatibles à la publication + propositions en un clic (validation humaine avant envoi, §7.1).
6. **Génération des documents** : offre → calcul auto net vendeur / honoraires / FAI ; mandat → numéro attribué par la base + clauses de la bibliothèque ; compromis pré-rempli depuis l'offre acceptée.
7. **E-mail threadé natif** (boîte `devis@`, Gmail API) : chaque envoi devient un thread rattaché à l'opération/contact, réponses ingérées et résumées par IA.
8. **Scoring A/B objectivé** des acquéreurs (historique d'offres, réactivité, financement prouvé) avec explication du score.
9. **Résumé de carte par IA** : synthèse des n suivis à l'ouverture au lieu des notes tronquées.
10. **Analytics inter-opérations** : compteurs muets → métriques nommées (propositions/visites/offres), taux de transformation par étape, délai moyen par colonne, CA prévisionnel vs `Objectifs`.

**Correspondance refonte** : PROSPECTS → `operations.status = prospection` ; PREPARATION MANDAT → `mandat`/`montage` ; COMMERCIALISES → `commercialisation` (+ `acquirers`, `proposals`, pont marketplace) ; VENTES → `deeds` (compromis/acte) + `invoices` (`nature = honos_transaction_FI`) ; modale Suivi → `tasks`/`reminders` + `email_threads` ; modale Recherche → `saved_searches` marketplace ; sélecteur d'agent → rôles `admin`/`agent` + RLS.
