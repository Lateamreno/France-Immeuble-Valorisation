# Cartographie back-office Bubble — Vues listes, Objectifs, Data

> Source : lecture OCR des PNG Drive (Immeubles, Estimation, Mandats, Visites, Offres, Suivi et rappels, Objectifs ×5, Data ×5). Les libellés sont retranscrits tels qu'extraits ; les passages où l'OCR est visiblement bruité sont signalés par `(?)`.

---

## 0. Éléments transverses (présents sur toutes les captures)

**Navigation latérale (sidebar), avec compteurs :**
- `Dashboard`
- `Estimations` — badge **36**
- `Immeubles` — badge **53**
- `Mandats` — badge **5**
- `Recherches`
- `Contacts`
- `Propositions` — badge **1**
- `Questions` (puce ronde)
- `Visites` — badge **1**
- `Offres` — badge **31**
- `Suivi/Rappels`
- `Objectifs`
- `Datas`
- `? Notion` (lien vers doc Notion)
- Interrupteurs `ON / OFF` : `Mailing`, `Dim_max`, `Debug` (outils dev/admin visibles dans la prod Bubble)

**Barre de création rapide (bas d'écran, sur tous les modules) :**
`+ Contact` · `+ Immeuble` · `+ Mandat` · `+ Recherche` · `+ Proposition` · `+ Visite` · `+ Offre`

**Patterns communs des vues liste :**
- Champ de recherche en haut (`Recherchez un/une …`)
- Compteur de résultats (`497 résultats`, `36 résultats`, `45 résultats`, `410 résultats`, `31 résultats`, `496 résultats`)
- Onglets de statut (`En cours` / `Terminé(e)s` / etc.)
- Filtre « suivi par » : `… suivis par Marc-Antoine` (filtre par agent responsable)
- Pagination : `10 éléments par page`, `Page 1/N >`
- Avatar/initiales du responsable sur chaque carte (`MAV`, `RV`, `SJ`, `FD`, `GA`)

---

## 1. Capture par capture

### 1.1 « Immeubles » — liste des immeubles

497 résultats, page 1/10 — la vue liste principale du sourcing/pipeline d'immeubles.

**Filtres (barre supérieure) :** `Recherchez un immeuble...` · `Idéal pour` → `Tous` · `Destination principale` → `Toutes` · `Rentabilité` · `Occupation` · `Surface` · `Statut` → `Tous` · `Tri` → `Date de relance (plus récents en premiers)` · `Réinitialiser`

**Onglets :** `En cours 53` · `En attente` · `Archivés` · filtre `Immeubles suivis par Marc-Antoi[ne]`

**Structure d'une carte immeuble :**
- Responsable (`MAV`)
- `Ville (CP) - Adresse` (ex. `Suresnes (92150) - 67 Route des Fusillés de la Résistance`)
- Contact propriétaire lié (ex. `Pascal BEN-SADOUN`, `Jean Pierre TREBEL`, `Lynel KITAMBALA`, `François CERUTTI`, `Jérémy DUCHOSAL`, `David BORE`, `Julien POSTEL`)
- Statut du dossier (ex. `Commercialisé (public)`, `A transformer`, `Compromis signé`)
- Statut de relance + échéance : `Attente infos jusqu'au 22/04/24`, `Attente documents jusqu'au 11/06/24`, `Autre jusqu'au 01/04/24`
- Données clés : surface (`238 m²`, `745 m²`, `412 m²`, `819 m²`, `241 m²`, `60 m²`), taux d'occupation (`100 %`, `0 %`, `78 %`, `95 %`), rendement (`10,3%`), prix (`1 440 000 €`, `800 000 €`, `520 000 €`, `2 000 000 €`, `1 010 000 €`, `4 200 000 €`, `350 000 €`)
- Liens/pièces : `Dossier V2 PDF`, `PDF`, `Mandat n°1977`
- Bouton d'action par carte : `Réactiver` (relance du suivi)

**Workflow apparent :** sourcing → `A transformer` (lead brut) → relances datées (`Attente infos` / `Attente documents`) → `Commercialisé (public)` → `Compromis signé` → archivage. Le tri par défaut sur la **date de relance** montre que c'est un outil de rappels avant tout.

### 1.2 « Estimation » — liste des estimations

36 résultats, page 1/4. **Onglets :** `En cours` · `Terminées` · `Estimations réalisées par Marc-A[ntoine]`

**Structure d'une carte estimation :** responsable (`MAV`) · date + `Ville - Adresse` (ex. `21/07/26 Gennevilliers - 25 Avenue des Grésillons`) · statut du livrable : `PDF manquant` ou `A envoyer` · valeur estimée (ex. `3 748 000 €`, `490 000 €`, `2 800 000 €`…) · rendement (`5,9%`…`9,3%`) · prix au m² (`4 420 €/m²`…`8 271 €/m²`) · chevron `>` d'accès au détail.

**Workflow apparent :** estimation créée → `PDF manquant` → `A envoyer` → envoyée/terminée. Trois indicateurs systématiques : valeur, rendement, €/m².

### 1.3 « Mandats » — registre des mandats

45 résultats. **Filtres/onglets :** `Recherchez un mandat` · `En cours` · `Terminés` · `Mandats suivis par Marc-Antoine`

**Structure d'une carte mandat :**
- Type + exclusivité + durée : `Vente Exclusive 09/06/26-09/06/27`, `Vente Semi-exclusive (30 j) 13/03/26-13/03/27`, `Vente Semi-exclusive (14) 26/02/26-26/02/27`, `Vente Simple 03/10/24-03/10/25`
- Statut documentaire : `A rédiger`, `Attente infos`, `A signer`
- Numéro : `#2098`, `#2094`, `#2058`, ou alerte **`Pas de numéro`**
- `Ville - Adresse`, contact vendeur, prix `… € HAI`

**Workflow apparent :** `Attente infos` → `A rédiger` → `A signer` → signé (numéro attribué). **Point critique : des mandats existent « Pas de numéro »** — la numérotation n'est pas systématique/atomique (non conforme à l'esprit registre Hoguet).

### 1.4 « Visites » — liste des visites

410 résultats. Onglets `Prévues` · `Terminées` · `Visites suivies par Marc-Antoine`.

**Structure d'une carte visite :** responsable · `Visite du JJ/MM/AA - HHhMM` · statut `Confirmée` ou `A confirmer` · `Ville - Adresse` · contact acquéreur. Créneaux enchaînés visibles (même bien 12h30 puis 13h00). Présence du **55 rue Volant Nanterre** (opération de référence du cockpit).

**Workflow apparent :** planifiée (`A confirmer`) → `Confirmée` → `Terminée`.

### 1.5 « Offres » — liste des offres

31 résultats, page 1/4. Onglets : `En cours` · `Acceptées` · `Terminés` (sic) · `Offres suivies par Marc-Antoine`.

**Structure d'une carte offre :**
- `Offre du JJ/MM/AA` + responsable (parfois double avatar `SJ MAV`)
- Compte à rebours de validité : `Expire dans -1051 jours`, `-995`, `-969`… (toutes **négatives** = expirées mais toujours « En cours »)
- `Ville - Adresse` + contact offreur
- **Décomposition financière systématique** : `net vendeur + honoraires = total HAI` — ex. `1 200 000 € + 60 000 € d'honoraires = 1 260 000 € HAI`, `5 150 000 € + 206 000 € = 5 356 000 € HAI`

**Workflow apparent :** offre datée, validité avec compte à rebours, puis acceptation ou clôture. Modèle honoraires **charge acquéreur** apparent. Beaucoup d'offres expirées depuis 2-3 ans restent « En cours » → pas de purge automatique.

### 1.6 « Suivi et rappels » — journal de suivi

496 résultats, page 1/10. Onglets : `En cours` · `Terminés` · `Suivis par Marc-Antoine`.

**Structure d'une carte suivi :**
- Deux dates : date de la note + date de rappel/relance (ex. `18/04/23` → `28/04/23`)
- Catégorie/statut : `Attente infos`, `Attente documents`, `Temps de réflexion`, `SMS`, `Autre`
- Note libre (ex. : « La fille de nicolas était à l'hopital donc il n'a pas pu s'occuper du dossier à relancer dès mercredi » ; « Il en voulait entre 1.2 et 1.4 à la découpe. Je lui ai dit maximum 1.123 M€ Net vendeur pour faire du 7% et une décote suffisante au m². A voir dans un mois et demi le temps de réflexion »)
- Rattachements : immeuble et/ou contact

**Workflow apparent :** journal chronologique de toutes les interactions (téléphone, SMS, email) avec catégorie de motif + date de prochaine relance. C'est la mémoire commerciale du CRM — très riche mais 100 % texte libre, incluant des notes de **négociation à la découpe**.

### 1.7–1.11 « Objectifs » (5 captures)

**Filtres :** `Tous les types d'objectifs` · `Prioritaires` / `Secondaires` · `En cours` / `Historique` · `France Immeuble` / `Agents` · `Objectifs de tout le monde` · bouton `+` · sélecteur de période (`01/08/26` → `10/08/26`).

**Objectifs observés (Août 2026), déclinés société (France Immeuble) vs agent (MAV, RV) :**
- `Recherches créées` — `0/10`
- `Mandats signés` — `0/2` (FI) et `0/2` (MAV)
- `Retour des propositions A et B` — `n.a.` ; `Retour des propositions C et D` (RV, MAV)
- `Formulaires transformés` — `0% / 75%` (réalisé % / cible)
- `Immeubles créés` — `0/20` par agent, `0/60` consolidé société
- `Immeubles estimés` — `n.a.`
- `Mandats signés (%)` — `n.a.`
- `Offres` — `0/6` par agent (MAV, RV), `0/18` consolidé

**Drill-down d'un objectif** (`Formulaires transformés`) : sous-onglets `Réussis (0)` · `Manqués (3)` · `Tous (3)` avec liste nominative des leads (ex. `Sangatte - 51 D940` — Thibaud VATAIRE ; `Château-Renard - 164 Rue de Verdun` — William SANAA). L'objectif est **auditable**.

**Constats :** deux familles de métriques — volumes (`0/20`) et taux (`%`) ; consolidation automatique agents → société (20→60, 6→18 : 3 agents) ; beaucoup de `n.a.` (métriques non calculées) et des données de test visibles.

### 1.12–1.16 « Data » (5 captures) — reporting entonnoir 12 mois

**Options :** `Recherchez un objectif...`, `Legend non` / `Tools non`, période `12 derniers mois`, `Objectifs de tout le monde`.

**Blocs statistiques (chaîne complète) :**
- **Acquéreurs :** `187 contacts créés`, `55 contacts modifiés`, `79 recherches créées`, `107 recherches modifiées`
- **Formulaires :** `66 formulaires reçus`, `+ 28 formulaires validés`, `16 archivés`, `= 61 sourcés` — graphique répartition (`FI 43%`)
- **Immeubles :** `33 créés manuellement`
- **Estimations :** `0 estimations envoyées`, `25 archivés`, répartition par agent (`MAV`, `SO`(?), `FD`) ; graphe `Estimations acceptées (%)`
- **Mandats :** `41 mandats créés`, `21 mandats signés`, répartition par agent (MAV 21) ; graphe `Mandats (%)`
- **Commercialisations :** `28 diffusions`, `Propositions envoyées par commercialisation (moyenne)`, `Immeubles diffusés (20)` — liste nominative avec responsable
- **Propositions :** `56 propositions manuelles`, `20 immeubles proposés` ; `3 385 propositions envoyées`, `219 propositions refusées`, indicateurs `Taux de retour`, `Taux de visite`, `Taux d'offres`
- **Visites :** `11 visites`, `10 immeubles visités`, `Taux d'offres obtenues`
- **Offres `(145 k€)`** : `19 offres reçues`, `2 refusées` avec motif saisi (« C'est un mauvais acheteur »…), répartition agents (MAV 13) ; graphe `Offres acceptées (%)`
- **Compromis `(100 k€)` :** `1 compromis prévus / signés`, `Taux de signature des compromis`
- **Ventes `(101 k€)` :** `3 ventes prévues / signées` — ex. `MAV Drancy - 5 Rue Marcelin Berthelot 73 k€`
- **`Chiffre d'affaires (101 k€)`**

**Funnels par population :**
- « 66 immeubles en cours » : `27 Immeubles 100%` → `26 Estimé 96.3%` → `6 Proposé 22.2%` → `3 Offre reçue 11.1%` → `1 Offre acceptée 3.7%` → `1 Compromis signé 3.7%`
- « 3 immeubles en attente » : funnel + répartition agents (`MAV: 100%`, `SJ/FD/GA: 0%`)
- « 138 immeubles archivés » : `125 Immeubles` → `6 Estimé 4.8%` → `1 Proposé 0.8%` → 0 ensuite. **L'essentiel des immeubles archivés meurt avant estimation.**
- Tableau comparatif par agent (`MAV` / `SJ` / `FD` / `GA`) sur chaque étape.

**Constats :** distinction **diffusion** (masse) vs **propositions manuelles** (one-to-one) ; segmentation acquéreurs A/B/C/D ; activité portée quasi exclusivement par MAV ; ratio 3 385 propositions → 11 visites → 19 offres = taux de conversion clefs du métier.

---

## 2. Synthèse par module

### Immeubles
- **Objet central du CRM** : adresse + contact vendeur + caractéristiques + statut pipeline + mécanique de relance datée.
- Statuts pipeline : `A transformer` → `Estimé` → `Proposé` → `Offre reçue` → `Offre acceptée` → `Compromis signé` → `Vente signée` (+ états parallèles `Commercialisé (public)`, `En attente`, `Archivé`).
- Statuts de relance : `Attente infos`, `Attente documents`, `Temps de réflexion`, `Autre`, avec date butoir et action `Réactiver`.
- 497 immeubles, 53 « en cours », 138 archivés : la base est surtout un cimetière de leads à réactiver.
- Correspondance refonte : `listings` + couche `operations` (statuts) + `reminders`.

### Estimations
- Valorisation datée par immeuble : valeur, rendement, €/m², cycle documentaire `PDF manquant` → `A envoyer` → envoyée.
- Correspondance refonte : module `estimations` (mode lecture_vendeur) + génération PDF + rapprochement DVF automatique (absent aujourd'hui).

### Mandats
- Type (`Vente Exclusive` / `Semi-exclusive (14/30 j)` / `Simple`), validité 1 an, numéro `#NNNN`, statuts `Attente infos` / `A rédiger` / `A signer`, prix HAI, vendeur.
- **Faiblesse majeure : mandats sans numéro** → registre non séquentiel garanti.
- Correspondance refonte : `mandates` avec numéro séquentiel immuable attribué en base (garde-fou §8.1).

### Visites
- RDV horodatés liés immeuble + contact ; statuts `A confirmer` / `Confirmée` / `Terminée`. 410 historisées.
- Correspondance refonte : `calendar_events` + pipeline `acquirers`.

### Offres
- Date + immeuble + acquéreur + décomposition `net vendeur + honoraires = HAI` + validité à rebours ; statuts `En cours` / `Acceptées` / `Terminés`. Motifs de refus en texte libre.
- Faiblesse : offres expirées depuis 1000+ jours toujours « en cours ».
- Correspondance refonte : `acquirers.offer_amount` + `deeds` ; modèle actuel charge **acquéreur**, à inverser sur lots préemptables (garde-fou §8.2).

### Suivi et rappels
- Journal universel : note libre + catégorie + date de relance + rattachement immeuble/contact. 496 notes. La vraie colonne vertébrale opérationnelle.
- Correspondance refonte : `tasks` / `reminders` / `email_threads`.

### Objectifs
- Objectifs mensuels typés sur chaque étape du funnel, volume ou %, déclinés société/agent, priorité, période paramétrable, drill-down nominatif `Réussis`/`Manqués`.
- Beaucoup de `n.a.` → outil peu alimenté ou en panne de calcul.

### Data
- Reporting complet de l'entonnoir 12 mois : Acquéreurs → Formulaires → Immeubles → Estimations → Mandats → Commercialisations → Propositions → Visites → Offres → Compromis → Ventes → CA ; funnels en cours / en attente / archivés ; ventilation par agent (MAV, SJ, FD, GA, RV) ; segmentation propositions A/B/C/D.

---

## 3. À améliorer (constats pour la refonte)

1. **Numérotation des mandats non fiable** (`Pas de numéro`) : séquence immuable en base, sans trou — obligation Hoguet (§8.1).
2. **Offres zombies** : validité expirée (~3 ans) mais statut « En cours ». Expiration automatique + archivage.
3. **Statuts éclatés et redondants** : statut pipeline, statut de relance, statut documentaire coexistent sans machine à états claire.
4. **Texte libre omniprésent** (suivi/rappels, motifs de refus) : structurer canal / motif / montant tout en gardant la note.
5. **Pas de notion de lots** : CRM mono-objet « immeuble en bloc ». La découpe (lots, baux, préemptions) n'existe pas — objet du cockpit (`listing_lots`).
6. **Doublons évidents** (offres et visites dupliquées) : pas de dédoublonnage ni de versionning d'offre (contre-offre).
7. **Objectifs largement `n.a.`** : dériver tous les KPI des événements réels (pas de saisie parallèle).
8. **Données de test/outils debug visibles en prod** (toggles `Debug`/`Dim_max`/`Mailing`) : séparer environnements et rôles.
9. **Estimations sans référentiel marché** : aucun rapprochement DVF → automatiser avec `dvf_benchmarks`/`loyers_benchmarks`.
10. **Pas de vue calendrier unifiée** : visites, relances, expirations d'offres, fins de mandat dans 4 modules → dashboard cible agrège tout (§3.3).
11. **Fins de mandat non alertées** : aucun compte à rebours (contrairement aux offres).
12. **Recherche/tri limités** : tri unique « date de relance », filtres non persistés, pagination fixe 10.
13. **Cohérence des libellés** : fautes (`Terminés` pour des offres) — soigner le design system.
14. **Traçabilité multi-agents faible** : tout repose sur MAV ; prévoir affectation, délégation, historique par utilisateur (RLS par rôle).

---

## 4. Idées IA / automatisation

**Sourcing & qualification**
- Scoring automatique des formulaires entrants (complétude, cohérence prix/rendement vs DVF commune) avec proposition `valider / archiver` pré-remplie.
- Enrichissement à la saisie d'adresse : DVF médian €/m², loyers de marché, `villes_stats` — déjà en base, zéro API externe.
- Détection de doublons (adresse normalisée + contact) à la création d'immeuble, d'offre ou de visite.

**Relances & pipeline**
- Génération automatique de la prochaine relance depuis la note de suivi (LLM : « à relancer fin de semaine » → `reminders` daté + brouillon email/SMS).
- Résumé IA de l'historique d'un dossier avant un appel.
- Alertes proactives : mandat expirant J-60/J-30, offre expirant J-7, dossier sans interaction depuis N jours, lead archivé « réactivable » si le marché local a bougé (DVF).

**Estimation & pricing**
- Pré-calcul de l'estimation (valeur bloc, rendement cible, €/m²) depuis caractéristiques + benchmarks, l'agent ajuste ; génération auto du PDF (fin du `PDF manquant`).
- Cockpit découpe : bascule bloc → grille de lots `value_free`/`value_occupied` + `gap_vs_dvf` par lot.

**Commercialisation**
- Matching automatique immeuble ↔ recherches avec classement A/B/C/D et file de propositions à valider avant envoi (validation humaine).
- Analyse des refus de propositions (LLM sur motifs) pour affiner le matching.
- Compte rendu de visite dicté → structuré (intérêt, objections, intention d'offre).

**Offres & juridique**
- Calcul automatique net vendeur / honoraires / HAI selon la doctrine (charge vendeur imposée sur lots préemptables), génération du courrier d'offre, détection de contre-offres liées.
- Rédaction assistée des mandats depuis la fiche + bibliothèque de clauses, numéro attribué par la base à la signature.

**Pilotage**
- KPI et objectifs calculés en continu depuis les événements (fin des `n.a.`), avec explication IA des variations.
- Prévision de CA pondérée par les taux de conversion historiques du funnel.
- Copilote conversationnel sur la base (« quels immeubles > 7 % de rendement sans relance depuis 30 jours ? »).
