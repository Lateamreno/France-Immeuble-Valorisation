# Envoi des e-mails — configuration et délivrabilité

L'app sait envoyer l'estimation au propriétaire avec le dossier PDF en pièce
jointe. Tant que la boîte n'est pas configurée, l'écran d'envoi reste en
préparation manuelle (bouton « Préparer l'e-mail ») : rien ne casse, l'agent
envoie depuis sa boîte comme avant.

## 1. Brancher la boîte (5 variables)

À saisir dans **Vercel → Settings → Environment Variables** (Production ET
Preview). Ne jamais mettre un mot de passe dans le dépôt ni dans une
conversation.

| Variable | Boîte OVH (recommandé) | SendGrid |
|---|---|---|
| `SMTP_HOST` | `ssl0.ovh.net` | `smtp.sendgrid.net` |
| `SMTP_PORT` | `465` | `465` |
| `SMTP_USER` | l'adresse complète, ex. `estimation@france-immeuble.fr` | `apikey` (littéralement) |
| `SMTP_PASS` | le mot de passe de la boîte | la clé d'API SendGrid |
| `MAIL_FROM` | `France Immeuble <estimation@france-immeuble.fr>` | idem |

Le code ne dépend d'aucun fournisseur : changer de route se fait en changeant
ces variables, sans toucher au code (`lib/bo/mail.ts`).

**Recommandation : la boîte OVH.** Le domaine est déjà chez OVH, le SPF
l'autorise déjà, le message part d'une vraie boîte qui a une réputation et
une histoire — c'est ce qui passe le mieux les filtres pour quelques dizaines
d'envois par jour. SendGrid n'a d'intérêt qu'à partir de volumes bien plus
importants, et demande alors un vrai suivi de réputation.

## 2. Les trois réglages DNS qui décident du spam

Relevé du **14/08/2026** sur `france-immeuble.fr` :

| | État | À faire |
|---|---|---|
| MX | OVH (`mx*.mail.ovh.net`) | — |
| SPF | `v=spf1 include:mx.ovh.com ~all` | ajouter SendGrid **si** on passe par lui |
| DKIM | SendGrid signé (`s1`/`s2._domainkey`) ; rien côté OVH | activer DKIM OVH si on envoie par OVH |
| DMARC | **absent** | à créer |

### a. DMARC (le plus important, il manque complètement)

Sans DMARC, chaque messagerie décide seule du sort d'un message imparfait :
c'est ce qui explique qu'une partie des mails du formulaire arrive en spam et
l'autre non.

- Nom : `_dmarc` · Type : `TXT`
- Valeur : `v=DMARC1; p=none; rua=mailto:dmarc@france-immeuble.fr; fo=1`

On démarre en `p=none` : aucune conséquence sur la remise, on ne fait
qu'observer. Après quelques semaines de rapports, passer à
`p=quarantine; pct=100`.

### b. SPF — seulement si on envoie par SendGrid

`v=spf1 include:mx.ovh.com include:sendgrid.net ~all`

Aujourd'hui SendGrid **n'est pas** dans le SPF : tout mail qu'il envoie échoue
SPF. Il est rattrapé par sa signature DKIM, mais « SPF en échec + pas de
DMARC » suffit à faire basculer un message en spam chez Outlook et Orange.

### c. DKIM OVH — seulement si on envoie par OVH

Espace client OVH → *E-mails* → le domaine → onglet *DKIM* → activer.
OVH pose l'enregistrement tout seul.

## 3. La cause n°1 des spams du site

Un formulaire qui envoie **« De : l'adresse du visiteur »** est refusé ou
classé en spam par construction : le message prétend venir de `gmail.com` ou
`orange.fr` sans y être autorisé. La règle, dans le formulaire du site comme
dans cette app :

- **De** : toujours une adresse `@france-immeuble.fr` ;
- **Répondre à** : l'adresse de la personne (visiteur, agent) ;
- jamais l'inverse.

C'est ce que fait `envoyerEstimation` : le message part de `MAIL_FROM`, et
l'agent qui a réalisé l'estimation est mis en *Répondre à* — le propriétaire
lui répond directement.

## 4. Vérifier que tout est bon

Après avoir posé les enregistrements (compter jusqu'à 24 h de propagation),
envoyer une estimation de test à une adresse `@gmail.com`, puis dans Gmail :
*⋮ → Afficher l'original*. Il faut lire **SPF: PASS**, **DKIM: PASS**,
**DMARC: PASS**. Les trois au vert = la boîte de réception.
