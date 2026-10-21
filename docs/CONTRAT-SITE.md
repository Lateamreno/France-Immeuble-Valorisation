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
| Délai jusqu'à l'offre | premier envoi du dossier (propositions A/B/C/D ou annonce) jusqu'à la date de l'offre « Vendu » | en jours ; vide si l'offre précède l'envoi |
| Écart avec l'estimation | (prix de l'acte − estimation) ÷ estimation, honoraires inclus des deux côtés ; estimation = la dernière **envoyée** au propriétaire avant le mandat (ou avant l'offre si elle est arrivée plus tôt), datée par sa date d'envoi | en % ; **masqué sur le site** tant que MAV ne l'a pas validé, jamais dans le récit |
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
mandat ni écart de négociation, ni écart avec l'estimation tant que MAV ne l'a
pas validé. Moins de six faits
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

| Formulaire | Ce que crée le BO | Source |
|---|---|---|
| Vendre / Estimer (`type: "estimation"`, `etat: "principal"` puis `"complement"`, `formulaire: "vendre"` ou `"estimer"`) | un immeuble au statut « 1 - FORMULAIRE », avec son propriétaire, **sous la même vignette** que les anciens formulaires au tableau de bord ; le complément complète la même fiche | « Site - Formulaire Vendre » ou « Site - Formulaire estimer » |
| Recherche (`type: "recherche_acquereur"`) | le contact, retrouvé par e-mail ou créé avec la **note D**, et une recherche par élément du tableau `recherches` | « Site - Formulaire recherche » |
| Contact depuis une fiche à vendre (`type: "contact"`, `bien`, `bienTitre`) | le contact (note D s'il est nouveau) et une **demande de dossier** dans Questions, rattachée au bien et à son agent | « Site - Fiche à vendre » |

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

## 9. Le compte client (lot 4, pas encore conçu)

Revirement du 21/10 sur la décision du 03/09 (§10 bis du CLAUDE.md) : le client
créera lui-même son compte, **sur le site**. Principe : le compte vit sur le
site ; le BO reste la source des données ; le site envoie au BO la création du
compte et les recherches ; le BO renvoie au site, pour ce seul client, ce qu'il
a le droit de voir ; le lien se fait par une clé neutre, jamais par un
identifiant du BO. Rien n'est construit avant la conception validée par MAV.
