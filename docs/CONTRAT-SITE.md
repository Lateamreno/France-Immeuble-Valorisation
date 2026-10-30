# Contrat entre le BO et le site France Immeuble

> Validé par MAV le 21/10/26. Ce document fait foi entre la session du BO
> (dépôt `France-Immeuble-Valorisation`) et celle du site (dépôt
> `france-immeuble-refonte-site-`). Il remplace `PROMPT-BO-DIFFUSION-ET-LEADS.md`
> et `PROMPT-BO-RECIT-VENTE.md` du dépôt du site là où ils divergent.
> Une modification se décide avec MAV et s'écrit ici d'abord.

---

## 1. Le principe

- **Le BO dépose, le site affiche.** Le BO écrit dans la base Supabase du site
  (projet « France Immeuble site », `omtkttpvfjsbnqsajcsp`) avec la clé secrète
  de ce projet. Le site ne détient **aucune** clé du BO, ni en lecture ni en
  écriture. Si quelqu'un aspire toute la base du site, il n'y trouve que ce qui
  est déjà affiché sur le site.
- **Le BO ne crée ni ne modifie aucune table du site.** Les migrations de la
  base du site vivent dans le dépôt du site, et seulement là.
- **Le sens inverse passe par une seule porte** : le site poste ses formulaires
  sur une adresse du BO qui ne sait qu'enregistrer. Elle ne rend jamais de
  données.
- **Le BO ne parle jamais directement au client.** Les échanges avec le client
  passent par le site.

## 2. Les variables

| Projet Vercel | Variable | Rôle |
|---|---|---|
| BO | `SITE_FI_SUPABASE_URL` | adresse de la base du site |
| BO | `SITE_FI_SUPABASE_SECRET_KEY` | clé secrète de la base du site |
| BO | `BO_LEAD_TOKEN` | jeton attendu sur l'adresse des formulaires |
| BO | `ANTHROPIC_API_KEY` | réécriture des récits de vente |
| Site | `SITE_SUPABASE_SECRET_KEY` | la clé du site lui-même (file d'attente des leads) |
| Site | `BO_LEAD_ENDPOINT` | `https://france-immeuble-valorisation.vercel.app/api/site/lead` |
| Site | `BO_LEAD_TOKEN` | même valeur que côté BO |

Aucune clé du BO (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` du BO) ne doit
jamais être posée dans le projet du site.

## 3. Les biens à vendre (`biens_a_vendre`)

### La décision de publier

- La mise en ligne est **toujours un geste de MAV ou d'un agent** dans le BO.
  Jamais automatique.
- Deux cases à l'étape de publication et dans le panneau de diffusion :
  **Plein Bail** et **Site France Immeuble**, cochées par défaut, chacune
  décochable seule. La case dit où, le bouton « Publier » dit quand.
  Décocher retire le bien de cette destination au dépôt suivant.
- Les blocages de publication valent pour les deux destinations : mandat signé
  et numéroté, mandat qui autorise la publication en ligne (article 6.4), prix,
  descriptif, photo, état locatif, agent en charge avec un portable.
- Chaque coche, décoche, publication, retrait est journalisé dans le BO avec
  l'agent aux commandes du poste et l'heure. Ce nom ne part jamais au site.

### Le cycle de vie

| Situation dans le BO | Plein Bail | Site |
|---|---|---|
| Mandat absent, non signé, refusant la publication en ligne, expiré ou annulé | rien ou retrait | rien ou suppression |
| Statut 5 (envoyé au fichier clients) | jamais | jamais ; compté dans l'off-market |
| Statut 6 ou 7, pas encore publié à la main | rien | rien ; compté dans l'off-market |
| Statut 6, publié | en ligne | `statut = 'en_vente'` |
| Statut 7, publié | sous offre | `statut = 'sous_offre'` |
| Statuts 8 à 10 (compromis programmé, sous compromis, acte programmé), **déjà publié** | retrait | `statut = 'sous_offre'` |
| Statuts 7 à 10, **jamais publié** | rien | rien : le bien reste off-market et n'apparaît qu'une fois vendu |
| Statut 11, vendu | vendu | suppression de `biens_a_vendre` ; tâche « Vente à publier » dans le BO |
| Statut 0, archivé, ou case décochée | retrait | suppression |

### Ce qui part

Exactement ce que reçoit Plein Bail, **sans adresse** : commune et département
seulement, comme sur Plein Bail. Titre, descriptif, ville, département sur deux
caractères (`"06"`, `"2A"`), type, surface, lots, année de construction, loyers
HC annuels, prix HAI, prix au m², DPE, travaux à prévoir, photos.

- Rendement et occupation **en pourcentage** : `8.98` et `100`, jamais
  `0.0898` et `1`.
- `publie_le` n'est posé qu'à la première publication ; `maj_le` à chaque dépôt.
- Photos copiées dans le coffre `biens` du site sous un nom neutre,
  `<id>-<n>.jpg` ; supprimées au retrait.
- `slug` : généré et figé par la base du site (`immeuble-de-rapport-<commune>-<dept>`,
  puis `-2`, `-3`…). **Le BO n'envoie jamais de slug** ; il lit celui que la
  base a posé (précisé le 21/10 au soir).

## 4. Les ventes (`ventes`)

- Clé : `_id` de `bo_vente`. Les 44 ventes historiques correspondent chacune à
  un immeuble au statut « 11 - VENDU » ; le BO les y rattache. Une vente nouvelle
  crée sa ligne `bo_vente` au moment où MAV la valide.
- **La rue s'affiche, sans le numéro** (« rue des Bas-Fossés »), dans une
  colonne `rue` à part. Jamais dans le titre, le chapô, la composition ou le
  récit, que le contrôle d'anonymat de la base du site continue de vérifier.
- Rien ne part dans `ventes` sans la validation de MAV : quand un bien passe au
  statut 11, le BO crée une tâche « Vente à publier », visible au tableau de
  bord, en rouge au-delà de sept jours. Pas d'e-mail de relance.
- File « Ventes passées à enrichir » pour les 44 ventes existantes, triée du
  dossier le plus complet au plus pauvre.

### Les faits

Pré-remplis par le BO depuis le dossier, corrigeables et effaçables par MAV.
Un champ vide ne part pas.

| Fait | Source dans le BO | Règle |
|---|---|---|
| Commune, département, arrondissement | adresse de l'immeuble | arrondissement à Paris, Lyon, Marseille seulement |
| Type | destinations des lots | Immeuble de rapport, mixte ou de bureaux |
| Lots, composition | état locatif | |
| Surface | somme des lots, caves et parkings exclus | **exacte**, en m² (`surface`) ; la tranche `surface_min`/`surface_max` n'est plus remplie quand la surface l'est. Revirement de MAV du 21/10 au soir, côté site |
| Époque | année de construction | « Années 1930 » |
| DPE, occupation | fiche, état locatif | occupation en % |
| Rendement | loyers HC annuels sur le prix de l'acte | en %, entre 1 et 40 |
| Profil du vendeur | propriétaires du bien | un : Particulier ; plusieurs : Indivision ; société détentrice : Société |
| Profil de l'acquéreur | cible de la recherche de l'acquéreur | à choisir à la main si elle manque |
| Commercialisation | publication Plein Bail ou site | off-market, diffusion ou mixte |
| Acquéreurs sollicités, visites, offres | propositions, visites, offres du dossier | comptes |
| Délai | signature du mandat jusqu'au compromis | en semaines |
| Loyer potentiel | loyer annuel max de la fiche (`fin_loyers_an_max`) | en €/an, HC, tout loué |
| Délai jusqu'à l'offre | premier envoi du dossier (propositions A/B/C/D ou annonce) jusqu'à la date de l'offre « Vendu » | en jours ; **0** quand l'offre précède l'envoi ou que l'envoi n'est pas daté (MAV, 21/10) |
| Écart avec l'estimation | (**meilleure offre reçue**, retenue ou non, − estimation) ÷ estimation, honoraires inclus des deux côtés (MAV, 21/10) ; estimation = la dernière **envoyée** au propriétaire avant le mandat (ou avant l'offre si elle est arrivée plus tôt), datée par sa date d'envoi | en % ; **validé par MAV le 21/10** : affichable, et citable dans le récit |
| Prix, date, photo | la vente | photo sous un nom neutre |

### Le récit

1. Le BO propose un texte construit par un **gabarit** écrit une fois : des blocs
   (titre, chapô, ouverture, le bien, la commune, la commercialisation,
   l'acquéreur, ce que la vente enseigne), chacun en plusieurs variantes, choisies
   selon les faits et l'identifiant de la vente. Un bloc sans faits disparaît.
2. Le bouton « Proposer une réécriture » envoie **les seuls faits de l'écran**
   (jamais la fiche, l'adresse ou un nom) à l'API Anthropic, qui réécrit le texte.
3. MAV corrige et valide. `recit_valide_le` est posé à la validation ; la base du
   site refuse un récit sans cette date.

**Le ton** : naturel et descriptif, celui d'un agent qui raconte une vente.
Phrases courtes, pas de superlatif creux, pas de formule publicitaire, **pas de
tiret long à la place d'une virgule, pas de tournure du type « pour ceci, jamais
cela »**, rien qui sonne écrit par une IA.

**Le fond** : aucun fait inventé, aucun nom de personne ou de société, aucune
rue ni code postal dans le texte, aucun motif personnel de vente, aucun prix de
mandat ni écart de négociation. L'écart entre la meilleure offre et
l'estimation peut être cité (validé le 21/10). Moins de six faits
renseignés : pas de récit, seulement « Publier sans récit » ou « Ne pas publier ».

**Le contrôle d'anonymat**, avant « Valider et publier » : bloque un nom de voie,
un code postal suivi d'une commune, le nom d'une personne ou d'une société du
dossier, une mention « [à vérifier] ». Un refus de la base du site s'affiche à
l'écran, jamais en silence.

## 5. L'off-market (`offmarket`)

- Table créée par le site : `commune text`, `dept text`, `arrondissement text`
  (null hors Paris, Lyon, Marseille), `nombre integer`, `maj_le timestamptz`.
  Lecture publique, écriture par la clé secrète seulement.
- Le BO la **remplace en entier deux fois par jour, à 9 h et à 19 h** (heure de
  Paris), d'un seul geste par `POST /rest/v1/rpc/remplacer_offmarket`
  `{"lignes":[…]}` : la page ne s'affiche jamais vide pendant le dépôt, et une
  ligne invalide n'efface rien. Tant que la fonction manque (404), l'ancien
  chemin (effacer puis insérer). Au 21/10 au soir, elle est écrite dans la
  migration 0004 du site mais **pas posée** dans sa base.
- Compte comme off-market : un bien au statut 5, 6 ou 7, avec un mandat signé et
  en cours qui ne refuse pas la publication en ligne, et qui n'est en ligne ni sur
  Plein Bail ni sur le site.
- Ne part que la commune et le nombre : ni type, ni lots, ni prix.
- Le site affiche « N immeubles actuellement off-market » et une carte par
  commune, à la place des cartes d'exemple.

## 6. Les formulaires du site vers le BO

`POST BO_LEAD_ENDPOINT`, en-tête `Authorization: Bearer BO_LEAD_TOKEN`, corps
JSON. Réponse `200` : enregistré. Tout autre code : à réessayer (file
`leads_outbox` côté site). Idempotent sur `ref` : un réessai ne crée jamais de
doublon. Débit limité. Aucun e-mail ne part automatiquement vers le visiteur.

Livré le 21/10 au soir (lot 3) : `BO_LEAD_ENDPOINT` =
`https://france-immeuble-valorisation.vercel.app/api/site/lead`.
- `200 {"ok":true,"deja":false|true,"id":…}` : enregistré, ou déjà enregistré
  (réessai). Le site efface le lead de sa file.
- `422` : formulaire illisible (pas de `ref` UUID, type inconnu, ni ville ni
  code postal pour une estimation, ni e-mail ni téléphone ailleurs). Le
  renvoyer tel quel ne servira à rien ; le site peut le garder pour un humain.
- `401` jeton refusé, `429` trop d'envois, `500`/`503` : passager, à réessayer.
- Un formulaire dont la fiche a été supprimée dans le BO répond `200` « déjà »
  et ne la recrée pas.

| Formulaire | Ce que crée le BO | Source |
|---|---|---|
| Vendre / Estimer (`type: "estimation"`, `etat: "principal"` puis `"complement"`, `formulaire: "vendre"` ou `"estimer"`) | un immeuble au statut « 1 - FORMULAIRE », avec son propriétaire, **sous la même vignette** que les anciens formulaires au tableau de bord ; le complément complète la même fiche | « Site - Formulaire Vendre » ou « Site - Formulaire estimer » |
| Recherche (`type: "recherche_acquereur"`) | le contact, retrouvé par e-mail ou créé avec la **note D**, et une recherche par élément du tableau `recherches` | « Site - Formulaire recherche » |
| Contact depuis une fiche à vendre (`type: "contact"`, `bien`, `bienTitre`) | le contact (note D s'il est nouveau), sa **recherche** déduite du bien (département, 70 à 130 % du prix, destinations des lots ; gardée si le contact cherche déjà dans ce département) et une **demande de dossier** dans Questions, rattachée au bien et à son agent. L'envoi du dossier crée la proposition, rattachée à cette recherche (MAV, 21/10) | « Site - Fiche à vendre » |

### Les champs

- **Vendre / Estimer** : `numero`, `rue`, `codePostal`, `ville` ; `prenom`,
  `nom`, `email`, `telephone` ; `surface`, `loyerAnnuel` ; `lotsHabitation`,
  `lotsCommerces`, `lotsBureaux`, `lotsActivite` ; `occupation` parmi
  « Entièrement loué », « Partiellement loué », « Libre » ; `travaux`,
  `echeance`, `valeurEstimee`, `message`.
- **Recherche** : `prenom`, `nom`, `email`, `telephone`, et `recherches`, un
  tableau. Chaque recherche : `cible` parmi Investisseur, Marchand de biens,
  Patrimonial, Promoteur ; `departements` (codes) ; `villes` (facultatif) ;
  `prixMin`, `prixMax` en euros ; `rendementMin` en % ; `destinations` parmi
  Logement, Commerce, Bureau, Logistique, Hôtel, Parking ; `commentaire`.
- **Contact depuis une fiche** : `prenom`, `nom`, `email`, `telephone`,
  `message`, `bien` (l'`id` de `biens_a_vendre`), `bienTitre`.

### La demande de dossier

Le visiteur d'une fiche à vendre n'a pas le dossier. Sa demande arrive dans
l'écran Questions du BO, signalée au tableau de bord de l'agent du bien par un
compteur « Demandes de dossier ». La carte met en avant le numéro à appeler,
puis trois gestes : « J'ai appelé » (note dans l'historique du contact),
« Envoyer le dossier » (l'envoi de dossier existant, validé par l'agent),
« Refuser » (avec un motif). Côté site, le message de confirmation dit :
« Merci. L'agent en charge de ce bien vous appelle pour en parler avant de vous
envoyer le dossier. »

## 7. Ce qui ne traverse jamais

- Vers le site : numéro de rue, code postal complet, coordonnées GPS ; l'adresse
  des biens à vendre (même la rue) ; nom, coordonnées, société ou motif du
  vendeur ; nom de l'acquéreur, des locataires, du notaire ; numéro de mandat,
  honoraires internes, notes ; identifiant d'un contact du BO ; nom de l'agent
  qui a validé ; nom de fichier d'origine d'une photo. Seule exception : une
  offre transmise par l'agent à SON propriétaire (§12.1).
- Vers le BO : rien d'autre que les formulaires.

## 8. Robustesse

- Upsert sur `id` partout : un dépôt rejoué ne duplique rien.
- Rapprochement chaque nuit : toute ligne de `biens_a_vendre` dont le bien n'est
  plus publiable est supprimée, et ses photos avec.
- Un dépôt refusé par la base du site est journalisé et visible dans le panneau
  de diffusion (« à republier », dernière erreur).
- Le site relit sa base toutes les 10 minutes.

## 9. Le compte client (lot 4, validé par MAV le 22/10)

Le compte vit sur le site, pour **tous** les clients : acquéreurs et
propriétaires ont le même compte, et une même personne peut être les deux.
Le BO reste la source des données et ne parle jamais directement au client.
**Il n'y a plus d'espace client dans le BO** (décision MAV du 22/10, pour
limiter les risques de fuite) : ni espace acquéreur, ni lien propriétaire. Les
agents voient depuis le BO exactement ce que voit chaque client (§9.6).

### 9.1 Le parcours

- **Création** proposée après le formulaire de recherche, après une demande de
  dossier, après une estimation, et par « Mon compte » dans l'en-tête.
  Facultative. Le site gère tout : e-mail, mot de passe, vérification de
  l'adresse, mot de passe oublié. Le BO ne voit jamais un mot de passe.
- **Rattachement** seulement après la vérification de l'adresse par le site :
  le site envoie `compte`, le BO retrouve le contact par l'e-mail (ou le crée,
  note D) et note la clé du compte sur la fiche. Sans vérification, taper
  l'e-mail d'un autre suffirait à voir ses propositions.
- **Fermeture** : le site envoie `compte_supprime` ; le BO efface tout ce qu'il
  avait déposé pour ce compte et retire la clé de la fiche. Le contact reste
  dans le BO ; une demande d'effacement complet arrive comme une question et
  MAV la traite à la main.
- **Aucun e-mail automatique** vers le client, ni du BO ni du site, à cause du
  compte. L'agent écrit quand il envoie un dossier ; le compte montre, il
  n'annonce rien.

### 9.2 Ce que voit l'acquéreur

- Ses recherches, modifiables. Une modification met à jour la recherche du BO
  directement, avec une ligne dans l'historique du contact.
- Les biens qu'on lui a proposés, **y compris off-market**, en carte réduite :
  commune, département, type, lots, prix, rendement, date. Ni adresse, ni
  photo d'un bien off-market, ni dossier PDF (il reste dans l'e-mail de
  l'agent). Le lien vers la fiche quand le bien est en ligne.
  Trois boutons : « Intéressé », « Demander une visite », « Pas pour moi ».
- Ses demandes de dossier et leur état (en attente, dossier envoyé, close).
- Les biens **en ligne** qui correspondent à ses recherches (calcul du site,
  sur `biens_a_vendre`).

### 9.3 Ce que voit le propriétaire

MAV : inciter les propriétaires à faire eux-mêmes leurs estimations, ce qui
amène des mandats.

- **« Estimer mon immeuble »** dans le compte : le formulaire d'estimation
  détaillé (adresse, lots par type, surfaces, loyers, occupation, travaux).
  Il part au BO comme une estimation (§6) portant la clé du compte, et
  apparaît dans le compte aussitôt, « en cours d'estimation ».
- **L'estimation** apparaît dans le compte quand l'agent l'a faite et l'a
  envoyée au propriétaire depuis le BO (statut « Envoyée ») : la valeur estimée,
  le prix au m², le rendement, la date. Jamais de chiffre calculé sans un humain (§7.1 du BO,
  « validation humaine avant tout envoi »).
- **Ses immeubles** confiés : l'étape (estimation, mandat signé, en
  commercialisation, sous offre, vendu), le prix affiché, et les compteurs de
  la commercialisation (acquéreurs sollicités, visites, offres). Jamais le nom
  d'un acquéreur ni le montant d'une offre.
- **Proposer son prix** : un montant et un mot, qui arrivent dans Questions,
  à l'agent du bien.

### 9.4 Du site vers le BO

Par l'adresse des formulaires (§6), même jeton, même file, même règle sans
doublon sur `ref`. Types ajoutés :

| Type | Champs |
|---|---|
| `compte` | `compte` (UUID du site), `email` (vérifié), `prenom`, `nom`, `telephone` |
| `recherche_compte` | `compte`, `cle` (UUID du site), `action` : `enregistrer` ou `supprimer`, puis les champs d'une recherche (§6) |
| `reponse` | `compte`, `proposition` (sa `cle`), `reponse` : `interesse`, `visite` ou `pas_pour_moi`, `message` |
| `prix_proprietaire` | `compte`, `bien` (sa `cle` dans `compte_biens`), `prix`, `message` |
| `compte_supprime` | `compte` |

Les types existants `estimation`, `recherche_acquereur` et `contact` acceptent
un champ `compte` facultatif : le BO rattache alors ce qu'il crée au compte.

### 9.5 Du BO vers le site

Tables créées par la session du site, lisibles par le seul titulaire du compte
(règle d'accès de la base, pas du code), écrites par la clé secrète du BO.
Clés neutres partout : `cle` est un UUID que le BO tire et garde sur sa fiche,
jamais un identifiant du BO.

| Table | Colonnes |
|---|---|
| `compte_recherches` | `compte`, `cle`, `cible`, `departements text[]`, `villes text[]`, `prix_min`, `prix_max`, `rendement_min`, `destinations text[]`, `commentaire`, `maj_le` |
| `compte_propositions` | `compte`, `cle`, `bien` (id de `biens_a_vendre` si en ligne, sinon null), `commune`, `dept`, `type`, `lots`, `prix`, `rendement`, `propose_le`, `reponse`, `repondu_le`, `etat` (`disponible`, `sous_offre`, `vendu`, `retire`), `maj_le` |
| `compte_demandes` | `compte`, `cle`, `bien`, `titre`, `etat` (`en_attente`, `dossier_envoye`, `close`), `demande_le`, `maj_le` |
| `compte_biens` | `compte`, `cle`, `commune`, `dept`, `type`, `lots`, `etape`, `prix`, `sollicites`, `visites`, `offres`, `bien` (id de `biens_a_vendre` si en ligne), `maj_le` |
| `compte_estimations` | `compte`, `cle`, `bien_cle`, `valeur`, `prix_m2`, `rendement`, `estimee_le` |

Clé primaire `(compte, cle)` partout. Dépôt au rattachement du compte, après
chaque proposition envoyée, chaque réponse, chaque estimation validée, chaque
changement d'étape d'un bien, et une reprise complète chaque nuit. Un
`compte_supprime` efface toutes les lignes du compte.

### 9.6 Ce que voient les agents

Sur la fiche contact du BO, un panneau « Son compte sur le site » montre ce
que le client voit, lu dans les tables ci-dessus : mêmes lignes, mêmes
champs. Les réponses, demandes de visite et prix proposés arrivent dans
Questions, à l'agent du bien, avec le compteur du tableau de bord.

### 9.7 Ce qui disparaît du BO

L'espace client et le lien propriétaire du BO sont fermés : pages retirées,
fonctions `ec_*` retirées à la clé publique. Au 22/10, un seul compte y était
ouvert, aucun lien propriétaire. Les dépôts de pièces par le propriétaire ne
sont pas repris en lot 4 : c'est le lot 5 (§10).

## 10. Les pièces du propriétaire (lot 5, lancé par MAV le 22/10)

Le propriétaire dépose depuis son compte les pièces qu'on lui demande, sur
chacun de ses immeubles. Elles arrivent au **coffre de l'immeuble** dans le BO,
comme un document déposé par un agent. **Le site n'en garde aucune copie** :
une fuite de sa base ou de son stockage n'expose ni un titre de propriété, ni
un bail, ni un avis de taxe foncière.

### 10.1 Le parcours

1. Dans le compte, sur un immeuble de `compte_biens`, le propriétaire choisit
   une catégorie (§10.2) et un fichier.
2. Le site pose le fichier dans son seau **privé** `depots-proprietaires`, au
   chemin `<compte>/<uuid>-<nom du fichier>` — toujours sous la clé du compte.
3. Le site envoie le type `document` sur l'adresse des formulaires (§6), avec
   le même jeton et la même file d'attente.
4. Le BO vérifie que l'immeuble appartient bien au contact de ce compte, lit
   le fichier dans le seau, le range au coffre, ajoute une ligne au suivi de
   l'immeuble pour l'agent, **puis efface le fichier du seau du site**.
5. Le BO redépose le compte : la pièce apparaît dans `compte_documents`,
   « déposée le … ».

Tant que le BO n'a pas répondu 200, le fichier reste dans le seau et le site
réessaie. Un fichier refusé (422) est à effacer par le site, avec un message
au propriétaire.

### 10.2 Les catégories

| Clé | Ce qu'on demande |
|---|---|
| `titre` | Titre de propriété — l'acte notarié d'acquisition |
| `baux` | Baux en cours — un fichier par bail, ou un seul pour tous |
| `diagnostics` | Diagnostics — DPE, amiante, plomb, électricité, gaz, même anciens |
| `taxe` | Taxe foncière — le dernier avis |
| `charges` | Charges et travaux — appels de charges, devis, factures récentes |
| `autre` | Autre pièce |

Formats acceptés : PDF, JPEG, PNG, WebP, HEIC, Word, Excel, OpenDocument.
25 Mo au plus par fichier.

### 10.3 Du site vers le BO

| Type | Champs |
|---|---|
| `document` | `compte`, `bien` (sa `cle` dans `compte_biens`), `categorie` (§10.2), `chemin` (dans `depots-proprietaires`, commençant par `<compte>/`), `nom` (nom d'origine du fichier) |

Réponses : 200 rangé (ou déjà rangé : le BO retente alors l'effacement) ;
422 bien d'un autre compte, catégorie inconnue, chemin hors du dossier du
compte, format refusé, fichier vide ou trop lourd ; 500 fichier introuvable
ou site injoignable, à réessayer.

### 10.4 Du BO vers le site

| Table | Colonnes |
|---|---|
| `compte_documents` | `compte`, `cle`, `bien_cle`, `categorie`, `nom`, `recu_le` |

Clé primaire `(compte, cle)`, mêmes règles d'accès que les tables du §9.5.
Seules les pièces déposées **par ce compte** y figurent : ni les documents de
l'agence, ni ce qu'aurait déposé un co-indivisaire depuis son propre compte.

### 10.5 Côté site, à créer

- le seau privé `depots-proprietaires` : aucune lecture publique, écriture
  par la route du site seulement, sous `<compte>/` ;
- la table `compte_documents` ;
- dans le compte, sur chaque immeuble : la liste du §10.2, un bouton
  « Déposer » par catégorie, et les pièces déjà reçues avec leur date.


## 11. Tout ce que le client saisit entre au BO (règle du 30/10)

Demandée par la session du site et validée par MAV le 30/10, après qu'un état
locatif saisi par un vendeur est arrivé par e-mail mais pas dans le BO.

### 11.1 Ce que veulent dire les réponses

- **200** : l'envoi est **enregistré** dans le BO (ou l'était déjà). Jamais
  avant : le BO relit en base ce qu'il vient d'écrire.
- **503** : pas encore rangeable — un envoi que le BO ne sait pas encore lire
  (type ou `etat` inconnus), ou arrivé avant celui dont il dépend (le dossier
  avant le formulaire, une action de compte avant le rattachement `compte`).
  Le site le garde dans sa file et le réessaie.
- **422** : illisible tel quel (champ obligatoire absent, valeur refusée) :
  inutile de le renvoyer sans le corriger.
- **500** : erreur passagère, à réessayer.

Le BO limite le débit : 30 envois par minute et par adresse, 120 par minute en
tout, 3 000 par jour (**429** au-delà).

### 11.2 `estimation`, état `dossier` : l'état locatif du vendeur

Même `ref` que l'estimation. Répète `prenom`, `nom`, `email`, `telephone`,
`numero`, `rue`, `codePostal`, `ville`, `formulaire`. Champs propres :
`taxeFonciere` (€/an), `teom` (€, part récupérée sur les locataires),
`commentaire`, `compte` (si connecté, adresse vérifiée), `lots[]` :
`{ numero, type, etat, surfaceCarrez, statut, bail, loyerMensuelHC, dpe }`.

Ce qu'en fait le BO :
- les lots deviennent les lots de l'immeuble né de la même `ref`, **sauf** si
  un agent en a déjà saisi : ils ne sont alors pas créés, et le détail part en
  clair dans les notes de l'immeuble pour que l'agent compare ;
- la taxe foncière devient la charge « Taxe Foncière » de l'immeuble, la TEOM
  en part récupérable — jamais par-dessus une taxe déjà saisie ;
- le commentaire et un résumé du dossier entrent dans les notes, en bloc daté
  signé CLIENT ;
- un renvoi du même dossier ne crée rien de plus (200, `deja: true`).

Correspondance des valeurs du site avec les listes du BO (`bo_lot`) :

| Site `type` | `Destination` | `Type_lot` |
|---|---|---|
| `habitation_t1` … `habitation_t4` | Logement | T1 … T4 |
| `habitation_t5plus` | Logement | T5 |
| `habitation_maison` | Logement | Maison |
| `habitation` | Logement | (vide) |
| `bureau` | Bureau | Bureaux |
| `commerce` | Commerce | Local commercial |
| `local_activite` | Logistique | Local d'activites |
| `parking` / `cave` | Parking / Cave | Parking / Cave (surface au sol) |
| `autre` | Annexe | Autre |

| Site `etat` | `Etat` du BO |
|---|---|
| `bon` | Bon etat |
| `moyen` | Etat d'usage |
| `rafraichissement` | Etat d'usage (+ « à rafraîchir » en commentaire) |
| `travaux` | Travaux |

| Site `statut` / `bail` | `Type_bail` du BO |
|---|---|
| `libre` | Vide |
| `nu_89` | Nu |
| `meuble`, `mobilite` | Meuble |
| `nu_48` | Loi 48 |
| `commercial_369` | 3/6/9 |
| `professionnel` | Professionnel |
| `derogatoire`, `precaire` | Précaire |
| `civil` | Civil |
| occupé sans bail, ou `autre` | Nu (logement) ou 3/6/9 (commerce, bureau, activité), « Type de bail non précisé » en commentaire |

`conge_en_cours` et `procedure` restent des lots occupés, avec la mention en
commentaire. `dpe` : A à G dans `Type_dpe`. `loyerMensuelHC` dans `loyer`
(€/mois HC). Listes complètes du BO : `lib/referentiels.ts` (`TYPES_LOT`,
`TYPES_BAIL`, `ETATS_LOT`, `TYPES_DPE`).

### 11.3 Plans et photos du dossier vendeur

Le type `document` du §10.3 accepte une seconde porte : `estimation` (l'UUID
de l'estimation) **à la place** de `bien`. `compte` est alors facultatif ; le
`chemin` doit commencer par `<compte>/` si le vendeur est connecté, sinon par
`<estimation>/`. Deux catégories de plus : `plans` et `photos`. Le circuit ne
change pas : la pièce est rangée au coffre de l'immeuble, puis effacée du seau
du site. 503 si l'estimation n'est pas encore arrivée ; 422 si son immeuble a
été supprimé dans le BO.

Décision de MAV le 30/10 : les **photos** (catégorie `photos`, format image)
vont directement dans l'onglet Photos de l'immeuble — redressées, réduites,
converties en JPEG, « à classer » et hors du dossier de vente tant que l'agent
ne les a pas regardées. Un PDF étiqueté `photos` reste une pièce du coffre.

## 12. Compte client V2 : offres et messages (MAV, 30/10)

Deux nouvelles tables à créer **côté site**, même forme que les tables
`compte_*` du §9 (clé `(compte, cle)`, lecture réservée au titulaire du
compte, écriture réservée à la clé secrète du BO), et un seau privé. Tant
qu'elles n'existent pas, le BO les saute sans erreur : rien à coordonner.

### 12.1 `compte_offres` — les offres reçues par un vendeur

Revirement assumé du §7 : **pour le propriétaire seulement**, et seulement
pour une offre que l'agent lui a **transmise** (bouton « Transmettre au
vendeur » de la fiche bien — validation humaine, rien ne part seul), le site
montre ce que l'agence lui enverrait de toute façon avec le document d'offre.
Un acquéreur ne voit toujours ni nom ni montant d'offre.

| Colonne | Type | Contenu |
|---|---|---|
| `compte`, `cle` | uuid | comme partout |
| `bien_cle` | uuid | l'immeuble, clé de `compte_biens` |
| `acquereur` | text | le nom porté sur l'offre (la société d'abord) |
| `recue_le` | date | date de l'offre |
| `valable_jours` | int, nullable | validité en jours, quand l'offre la dit ainsi |
| `valable_jusqu_au` | date, nullable | date limite (donnée, ou date + jours) |
| `prix_hai` | numeric | prix honoraires inclus |
| `net_vendeur` | numeric | net vendeur |
| `honoraires` | numeric | honoraires TTC |
| `statut` | text | `en_cours`, `contre_offre`, `acceptee`, `refusee`, `compromis`, `vendu` |
| `document` | text, nullable | chemin du PDF dans le seau `documents-clients` |
| `transmise_le` | date | le jour où l'agent l'a transmise |
| `maj_le` | timestamptz | dépôt |

**Seau `documents-clients`** (privé) : le BO y dépose le PDF de l'offre sous
`<compte>/offres/<cle>.pdf`, une fois. Le site le sert au titulaire du compte
par un lien signé de courte durée, jamais par une adresse publique. Si l'agent
retire l'offre, la ligne disparaît au dépôt suivant ; le site peut effacer le
fichier orphelin.

### 12.2 `compte_messages` — la messagerie agent ↔ client

| Colonne | Type | Contenu |
|---|---|---|
| `compte`, `cle` | uuid | comme partout |
| `conversation` | uuid | la conversation, telle que le site l'a créée (ou le BO, si l'agent en ouvre une) |
| `titre` | text, nullable | le titre de la conversation, répété sur chaque ligne |
| `bien_cle` | uuid, nullable | l'immeuble du propriétaire concerné, s'il y en a un |
| `pieces` | text[] | noms des pièces jointes du message (rangées au BO, pas renvoyées) |
| `de` | text | `client` ou `agent` |
| `auteur` | text, nullable | prénom et nom de l'agent (null pour le client) |
| `texte` | text | 5 000 caractères au plus |
| `envoye_le` | timestamptz | |
| `maj_le` | timestamptz | dépôt |

Le fil complet est déposé, messages du client compris : c'est la source
qui fait foi. Le site peut afficher un message du client « en cours d'envoi »
tant qu'il n'est pas revenu dans la table. **Prévenir le client** d'une
réponse (e-mail « Vous avez un nouveau message ») est l'affaire du site, qui
voit arriver la ligne `de = 'agent'` ; le BO n'écrit pas au client.

### 12.3 Type `message` (site → BO)

```json
{ "type": "message", "ref": "<uuid>", "compte": "<uuid>",
  "conversation": "<uuid>", "titre": "Relevé de charges",
  "texte": "…", "bien": "<cle de compte_biens, facultatif>",
  "proposition": "<cle de compte_propositions, facultatif>",
  "pieces": [{ "chemin": "<compte>/<fichier>", "nom": "releve.pdf" }] }
```

Plusieurs conversations par client : `conversation` est l'UUID que le site
tire à la création (sans lui, le message ouvre une conversation dont la clé
est sa `ref`). `titre` n'est utile que sur le premier message. Pièces jointes :
cinq au plus, 25 Mo chacune, mêmes formats et même seau que le §10 (chemin
sous `<compte>/`) ; le BO les range (au coffre de l'immeuble s'il y en a un)
puis les efface du seau. L'e-mail « avec l'historique » envoyé au client et à
l'agence part du site, comme vous l'avez prévu.

`bien` ou `proposition` dit de quel bien parle le client ; le BO vérifie qu'il
est bien à lui (422 sinon). 503 tant que le compte n'est pas rattaché. Côté BO
le message entre au suivi du contact, dans les notes de l'immeuble (pour un
propriétaire) et dans les Questions de l'agent jusqu'à sa réponse.


### 12.4 `compte_agent` — l'agent attitré et « appelé » (point 4 du 30/10)

Une ligne par compte. `appele` est vrai dès qu'un agent a appelé le client
(sa fiche n'est plus notée D et un agent la suit) : c'est lui qui ouvre les
biens off-market. **La lettre ne part jamais.** Tant que `appele` est faux,
les champs de l'agent sont nuls.

| Colonne | Type | Contenu |
|---|---|---|
| `compte`, `cle` | uuid | comme partout |
| `appele` | bool | |
| `agent_nom`, `agent_poste` | text, nullable | |
| `agent_tel` | text, nullable | sa ligne directe (portable) |
| `agent_email` | text, nullable | |
| `agent_photo` | text, nullable | adresse https de sa photo, quand la fiche agent en a une |
| `maj_le` | timestamptz | dépôt |

## 13. Les envois du compte v2 : rendez-vous, offre, profil (lus depuis le 30/10)

Un type que le BO ne lit pas encore reçoit **503** (règle du §11.1), jamais
422 : le site le garde en file. Ces trois-là sont lus ; `bienTitre`, ajouté
par le site pour la lisibilité, est ignoré.

```json
{ "type": "rendez_vous", "ref": "<uuid>", "compte": "<uuid>",
  "date": "2026-11-04", "creneau": "matin | apres_midi | soir | 14:30",
  "objet": "visite | estimation | signature | autre", "texte": "…",
  "bien": "<cle de compte_biens, facultatif>",
  "proposition": "<cle de compte_propositions, facultatif>" }
```
Une demande : elle entre dans les Questions (« Demande de rendez-vous ») avec
deux boutons, Confirmer et Annuler ; la réponse revient par le dépôt
(`compte_rendez_vous`, §13.1). 422 si la date n'est pas `AAAA-MM-JJ` ou le
créneau illisible.

```json
{ "type": "offre_acquereur", "ref": "<uuid>", "compte": "<uuid>",
  "proposition": "<cle de compte_propositions>",
  "montant": 480000, "conditions": "Sous condition suspensive de prêt…",
  "financement": "comptant | pret | mixte", "apport": 120000,
  "validite_jours": 10,
  "pieces": [{ "chemin": "<compte>/offre.pdf", "nom": "offre.pdf" }] }
```
Le bien est désigné par la proposition (un acquéreur ne connaît pas
l'immeuble autrement). Le BO crée l'offre « En cours » sur la fiche, rattachée
à l'acquéreur (qui passe en B), avec la première pièce PDF comme document
d'offre ; `montant` est le prix offert honoraires inclus, net vendeur et
honoraires sont répartis au prorata du prix affiché et l'agent les vérifie.
L'agent est prévenu dans les Questions. Le vendeur ne la voit que si l'agent
la lui transmet (§12.1).

```json
{ "type": "profil_investisseur", "ref": "<uuid>", "compte": "<uuid>",
  "achat_en": "nom_propre | societe", "societe": "SCI Exemple", "siren": "123456789",
  "immeubles_detenus": 3, "budget": 1500000, "apport": 300000,
  "financement": "comptant | pret | mixte", "presentation": "…",
  "pieces": [{ "chemin": "<compte>/presentation.pdf", "nom": "presentation.pdf" }] }
```
Rangé sur la fiche contact (l'agent le lit dans « Son compte sur le site ») ;
un nouvel envoi remplace le précédent, l'historique garde la trace de chaque
envoi.

**Demande d'appel.** Un `message` dont le titre est « Demande d'appel » devient
une question de nature « appel », **en tête des Questions** tant qu'elle est
ouverte. Le geste « J'ai appelé » sort le contact du D (en C), lui donne
l'agent qui a appelé s'il n'en avait pas, et redépose son compte :
`compte_agent.appele` passe à vrai avec les champs de l'agent.

### 13.1 Les projections v2 bis (feu vert du BO, 30/10)

Même forme que les autres `compte_*` : clé `(compte, cle)`, lecture par le
seul titulaire, écriture par le BO. Les PDF vont dans `documents-clients`,
sous `<compte>/…` ; le site les sert après avoir vérifié la ligne et le
préfixe, comme vous l'avez prévu.

| Table | Colonnes déposées |
|---|---|
| `compte_biens` (ajout) | `mandat_le`, `offre_acceptee_le`, `compromis_le`, `acte_le` (date, nullables) — §13.2 ter |
| `compte_rendez_vous` | `date` (date), `creneau` (text), `objet` (text), `etat` (`demande` / `confirme` / `annule`), `bien_cle` (uuid, nullable : seulement pour un immeuble du propriétaire), `maj_le` |
| `compte_mandats` | `bien_cle`, `etat` (`envoye` / `signe`), `signe_le` (date, nullable), `document` (text, nullable : `<compte>/mandats/<cle>.pdf`), `maj_le` |
| `compte_visites` | `bien_cle`, `visite_le` (date), `etat` (`confirmee` / `effectuee`), `retour` (text, nullable), `interet` (`faible` / `moyen` / `fort`, nullable), `maj_le` |
| `compte_dossiers_bien` | `proposition` (uuid : la `cle` de `compte_propositions`), `nom`, `categorie` (`dossier`), `document` (`<compte>/dossiers/<cle>.pdf`), `bien_etat` (`disponible` / `sous_offre`), `maj_le` |

- **Mandat** : « envoyé » = à la signature ; « signé » = date de signature ou
  PDF signé, mandat en cours, vendu ou expiré. Un mandat annulé ou en
  préparation n'est pas déposé.
- **Visites** : seules les visites confirmées ou faites. `retour` est le texte
  que l'agent écrit POUR le vendeur (bouton « Retour au vendeur » de la
  visite) — jamais le compte rendu interne. Le BO retire en plus le nom et la
  société du visiteur, et ne dépose pas un retour où resterait une adresse
  e-mail ou un numéro de téléphone.
- **Dossiers** : le dossier de présentation tel qu'il est parti par e-mail,
  pour un bien encore en vente seulement.

### 13.2 Prévenir le site après un dépôt (validé par MAV le 30/10)

Après chaque dépôt d'un compte, le BO compare les clés des lignes `de =
'agent'` de `compte_messages`, de `compte_propositions` et de `compte_offres`
à celles du dépôt précédent ; s'il y en a une nouvelle, il appelle
`POST https://www.france-immeuble.fr/api/compte/avis/` avec
`Authorization: Bearer <AVIS_SECRET>` (secret à part, posé par MAV dans les
deux projets). Au tout premier dépôt d'un compte, le BO pose l'empreinte sans
appeler. Une panne de la route ne bloque jamais le dépôt.

### 13.2 bis `coordonnees` (site → BO, 31/10)

```json
{ "type": "coordonnees", "ref": "<uuid>", "compte": "<uuid>",
  "prenom": "…", "nom": "…", "telephone": "…", "email": "…",
  "ancien_email": "<seulement si l'adresse a changé>" }
```
La fiche contact prend les nouvelles valeurs (téléphone dans « portable ») ;
une ancienne adresse reste notée sur la fiche, pour qu'une réponse à un vieux
message retrouve la personne. L'historique du contact dit ce qui a changé.
503 tant que le compte n'est pas rattaché ; 422 si l'e-mail est illisible.

### 13.2 ter Dates de la frise, sur `compte_biens`

`mandat_le` (signature du mandat le plus récent), `offre_acceptee_le`,
`compromis_le`, `acte_le` (date, nullables), tirés de l'offre la plus avancée
du bien. Le BO note le jour d'acceptation d'une offre depuis le 31/10 ; pour
une offre acceptée avant, la date est celle de sa dernière modification.

### 13.3 Estimation détaillée et repères du secteur

Pas pour ce lot. Une estimation du BO porte une valeur, pas de fourchette :
`valeur_basse`, `valeur_haute`, `loyer_marche`, `delai_jours` et
`compte_comparables` restent à construire avec MAV (d'où tirer la fourchette,
quelles ventes servent de comparables). Le BO a les repères de 13 209
communes (`bo_villes_stats`) ; avant de les déposer dans `web.stats_villes`,
il faut la liste exacte des colonnes que vous lisez.

**Photo de l'agent** : `agent_photo` reste l'adresse https publique de la
photo ; une nouvelle photo a une nouvelle adresse.
