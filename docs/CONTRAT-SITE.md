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
  qui a validé ; nom de fichier d'origine d'une photo.
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
sont pas repris en lot 4 ; ils viendront dans un lot suivant si MAV le
demande.
