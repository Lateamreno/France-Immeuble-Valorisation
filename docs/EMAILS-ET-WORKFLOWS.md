# E-mails et workflows du BO — ce qui est déjà extrait, ce qui reste à récupérer

> Mis à jour le 11/08/2026. Source : miroir Supabase des types Bubble
> (`bo_mail`, `bo_proposition`, `bo_mandat_envoye`, `bo_agentfi`) + endpoint
> `/api/1.1/meta` de l'app Bubble « moteurfi ».

---

## 1. Ce que j'ai déjà récupéré tout seul (rien à faire de ton côté)

### 1.1 Les expéditeurs réels, action par action

Bubble archive chaque e-mail envoyé dans le type `mail` (657 lignes) et garde
l'expéditeur des propositions dans `proposition.mail_EXPEDITEUR`
(12 937 propositions envoyées).

**Règle constatée : l'e-mail part TOUJOURS au nom de l'agent qui suit le
dossier**, avec son adresse nominative en `reply_to` :

| Agent | Adresse (reply-to) | Nom d'expéditeur | Estimations | Propositions |
|---|---|---|---|---|
| Marc-Antoine VOCI | `ma.voci@france-immeuble.fr` | `M.VOCI - France Immeuble` | 462 | 7 335 |
| François DUGAST | `f.dugast@france-immeuble.fr` | `F. DUGAST - France Immeuble` | 48 | 2 316 |
| Sophie JAQUET | `s.jaquet@france-immeuble.fr` | `S.JAQUET - France Immeuble` | 102 | 1 715 |
| Romain VOCI | `r.voci@france-immeuble.fr` | `R. VOCI - France Immeuble` | 10 | 1 423 |
| Guillaume ASTESANA | `g.astesana@france-immeuble.fr` | `G.ASTESANA - France Immeuble` | 28 | 148 |
| Younes OUSSERHIR | `y.ousserhir@france-immeuble.fr` | `Y.OUSSERHIR - France Immeuble` | 4 | — |
| François-Xavier FIESCHI-PAUWELS | `fx.fieschi@france-immeuble.fr` | `F.FIESCHI-PAUWELS - France Immeuble` | 1 | — |
| Quentin BONNEMAISON | `q.bonnemaison@france-immeuble.fr` | `Q. Bonnemaison - France Immeuble` | 1 | — |

Le champ `manual` distingue les envois automatiques (`false`) des envois
rédigés à la main (`true`).

> ⚠️ Ce que la base ne dit PAS : **l'adresse technique d'expédition** (le
> « from » SMTP réel, ex. un domaine SendGrid/Postmark). Elle est dans les
> réglages Bubble → c'est le point 2.3 ci-dessous.

### 1.2 Les modèles d'e-mails (récupérés au mot près)

**Estimation** (envoi automatique après génération du PDF) :

```
Objet : Estimation de votre immeuble à {ville}
        (variantes : « Deuxième estimation de votre immeuble à {ville} »)

Bonjour {civilité} {NOM},

Comme convenu, vous trouverez ci-joint l'estimation de votre immeuble sis
{adresse} à {ville}.

Nous avons estimé l'immeuble à {prix_hai} € HAI ({prix_nv} € net vendeur)
soit {prix_m2} €/m² et {renta} % de rendement brut.

Ce prix correspond-il à vos attentes ? Seriez-vous disponible dans la journée
pour en discuter ?

Vous en souhaitant bonne réception, je reste à votre disposition pour tout
complément.

Cordialement,

[b]{agent.prénom} {agent.NOM}[/b]
[i]{agent.poste}[/i]
{agent.portable}
[url=https://www.france-immeuble.fr]www.france-immeuble.fr[/url]
```

**Proposition / diffusion aux acquéreurs** :

```
Objet : Immeuble à vendre à {ville} ({cp})
        (variantes : « … - {renta} % de rentabilité », « Baisse de prix - … »)

Bonjour,

Vous trouverez ci-joint le dossier d'un immeuble de {destination} à {ville}
({cp}) d'une surface de {surface} m² proposé à {prix_hai} € honoraires
d'agence inclus.

L'immeuble est loué à {occupation} % pour un rendement brut de {renta} %.
Intégralement loué, l'immeuble pourra générer {loyers_max} € HC/an soit un
rendement brut de {renta_max} % après travaux.

Vous pouvez télécharger le dossier, les photos et les plans via ce lien :
{lien_dossier}

Si ce dernier vous intéresse et que vous avez la moindre question, n'hésitez
pas à me contacter je me ferai un plaisir d'y répondre.

Dans le cas contraire, pouvez-vous me le signaler et si possible m'en
indiquer la raison ? Cela me permettra de mettre à jour ma base et d'affiner
vos critères de recherche.
```

Le corps utilise des balises BBCode (`[b]`, `[i]`, `[url=…]`) → converties en
HTML à l'envoi.

### 1.3 Les objets Bubble liés aux envois

| Type | Ce qu'il stocke | Volume |
|---|---|---|
| `mail` | e-mails d'estimation : FROM (agent), TO, reply_to, sender_name, subject, body, PJ, `manual`, liens ESTIMATION/IMMEUBLE/SUIVI | 657 |
| `proposition` | `mail_EXPEDITEUR`, `mail_adresse`, `mail_subject`, `mail_text`, `date_envoi`, `date_last_relance`, `stop_relances_yn` | 27 500 |
| `mandat_envoye` | `mail_adresse`, `mail_objet`, `mail_copie`, `mail_text`, `mail_date`, `pdf`, `rex_date`, `rex_retour`, `rex_pdf_signed` | 233 |
| `commercialisation` | la campagne de diffusion elle-même | 28 |
| `match` | rapprochement immeuble ↔ recherche acquéreur | 215 |
| `annonce` | l'annonce publiée (snapshot chiffré) | 92 |
| `vente` | la vente signée | 44 |

Le champ `mail_copie` sur `mandat_envoye` n'est renseigné que **2 fois sur
233** (et à chaque fois `ma.voci@france-immeuble.fr`) : c'est donc un champ
de copie **saisi à la main au cas par cas**, pas une règle automatique.

Indice supplémentaire : `agentfi.daily_wf_running` (booléen) ⇒ il existe un
**workflow récurrent quotidien par agent** (probablement les relances).

---

## 2. Ce qu'il me manque, et comment le récupérer dans Bubble

Bubble **n'a pas d'export de workflows** : ils ne sont ni dans l'API Data, ni
dans l'API Workflow (qui n'expose que les 4 endpoints publics du site :
`form_vendre_wp1`, `form_vendre_wp2`, `form_contact_wp`, `form_estimer`).
La seule méthode fiable est la capture d'écran — mais il y a un raccourci
pour ne capturer que l'utile.

### 2.1 Le raccourci : la recherche globale de l'éditeur

1. Ouvrir l'éditeur Bubble de l'app **moteurfi**.
2. Cliquer sur l'icône **loupe** dans la barre d'outils de gauche
   (ou `Ctrl/Cmd + F` dans l'éditeur) → c'est le **Search / "Application
   search"**.
3. Chercher **`email`** puis **`Send email`**.
4. Bubble liste **tous les endroits de l'app** contenant une action d'envoi
   d'e-mail (page + nom du workflow + n° d'étape).
5. **Capture d'écran de cette liste** → elle me donne la cartographie
   complète des envois. C'est LA capture la plus utile.
6. Ensuite, clic sur chaque résultat : Bubble ouvre le workflow au bon
   endroit → capture de l'action ouverte (le panneau de droite montre From,
   To, Reply-to, Subject, Body).

Refaire la même recherche avec : `Schedule API workflow`, `Make changes to`,
`Create a new`, pour les workflows qui ne sont pas des e-mails.

### 2.2 Les workflows de pages (si tu veux tout)

1. En haut à gauche de l'éditeur : le **sélecteur de page** (menu déroulant
   avec le nom de la page courante).
2. Choisir la page (ex. `immeuble`, `dashboard`, `estimation`, `mandat`).
3. Dans la barre d'outils de gauche, onglet **Workflow** (icône éclair).
4. Le canvas affiche les workflows de la page les uns sous les autres. En
   haut, un menu **« Folder »** permet de filtrer par dossier — s'il y a des
   dossiers, capture dossier par dossier.
5. Zoom arrière (`Ctrl/Cmd + molette` ou le sélecteur de zoom en bas) pour
   faire tenir un workflow entier dans une capture.
6. Pour le détail d'une étape : clic sur l'étape → le panneau de propriétés
   s'ouvre à droite → capture.

**Les backend workflows (le plus important pour l'automatique)** :
même sélecteur de page → tout en bas de la liste → **« Backend workflows »**
(nom exact selon la version : *API Workflows*). On y trouve :
- les **API workflows** (appelés par les autres workflows, souvent en boucle
  pour les envois en masse) ;
- les **Recurring events** (le quotidien lié à `daily_wf_running`) ;
- les **Database trigger events** (déclenchés par un changement de champ,
  ex. passage d'un statut).

### 2.3 Les réglages d'envoi (2 captures, très rapides)

1. **Settings → Domain / email** : onglet *Email settings* → adresse et nom
   d'expéditeur par défaut, adresse de réponse, éventuel domaine
   personnalisé. → **capture**
2. **Plugins** : si SendGrid / Postmark / SMTP est installé, ouvrir le plugin
   → **capture** (masque la clé API, je n'en ai pas besoin).
3. Sur `mandat_envoye`, il y a un champ `mail_copie` : dans le workflow
   d'envoi de mandat, regarder à quoi il est rempli (adresse fixe ? le
   notaire ? une boîte interne ?) → **capture de l'action**.

### 2.4 Bonus : les logs pour savoir ce qui tourne vraiment

**Logs → Server logs**, filtrer sur *Workflow* : la liste des workflows
réellement exécutés ces derniers jours (avec leur nom). Ça permet de
distinguer les workflows vivants de ceux qui traînent depuis 2019.

---

## 3. Ma liste de courses (par priorité)

Si tu ne fais que les 6 premiers, j'ai de quoi avancer plusieurs jours.

| # | Workflow à capturer | Pourquoi j'en ai besoin | Priorité |
|---|---|---|---|
| 1 | **Commercialiser / envoi des propositions en masse** (+ l'API workflow qui boucle sur les acquéreurs) | C'est le gros morceau restant, et ta description orale doit être confirmée sur les critères de matching | 🔴 |
| 2 | **Relance des propositions** (récurrent quotidien ?) | `date_last_relance`, `stop_relances_yn` : je dois savoir le délai et les conditions d'arrêt | 🔴 |
| 3 | **Envoi de l'estimation** | J'ai le modèle, il me manque le déclencheur exact et l'adresse technique | 🔴 |
| 4 | **Envoi du mandat + retour de signature** (`mail_copie`, `rex_*`) | Qui reçoit la copie, comment le PDF signé revient | 🟠 |
| 5 | **Settings → Domain/email** + plugin d'envoi | L'adresse technique réelle de tous les envois | 🔴 |
| 6 | **Recurring event quotidien** (`daily_wf_running`) | Ce qui tourne tout seul chaque jour | 🟠 |
| 7 | Formulaires du site → création d'immeuble (attribution de l'agent, statut initial, e-mail de confirmation) | Aujourd'hui je crée en « 2 - Estimation » par défaut | 🟠 |
| 8 | Passage « En attente » / Réactivation | Vérifier ce que le BO écrit exactement | 🟢 |
| 9 | Attribution du numéro de mandat | Confirmer que ma séquence verrouillée correspond | 🟢 |
| 10 | Archivage d'un immeuble | Effets de bord (propositions, mandats, alertes) | 🟢 |
| 11 | Alertes acquéreurs (« Site - Formulaire Alerte ») | Envoi automatique aux acquéreurs sur nouveaux biens | 🟢 |
| 12 | Génération du dossier + lien de téléchargement (`transfer.it`) | Le lien du dossier dans l'e-mail de proposition | 🟠 |

**Format** : des captures d'écran suffisent — pas besoin de recopier. Tu peux
me les déposer où tu veux (Drive, ou directement dans le mode Revue de l'app
en collant l'image). Si un workflow est long, plusieurs captures qui se
chevauchent, c'est parfait.
