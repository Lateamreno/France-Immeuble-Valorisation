# Envoi des e-mails — configuration et délivrabilité

L'app sait envoyer l'estimation au propriétaire avec le dossier PDF en pièce
jointe. Tant que la boîte n'est pas configurée, l'écran d'envoi reste en
préparation manuelle (bouton « Préparer l'e-mail ») : rien ne casse, l'agent
envoie depuis sa boîte comme avant.

## 1. Brancher la boîte (5 variables)

À saisir dans **Vercel → Settings → Environment Variables** (Production ET
Preview). Ne jamais mettre un mot de passe dans le dépôt ni dans une
conversation.

| Variable | SendGrid (pour démarrer) | Postmark | Boîte OVH |
|---|---|---|---|
| `SMTP_HOST` | `smtp.sendgrid.net` | `smtp.postmarkapp.com` | `ssl0.ovh.net` |
| `SMTP_PORT` | `587` | `587` | `465` |
| `SMTP_USER` | `apikey` (littéralement) | le *Server API Token* | l'adresse complète |
| `SMTP_PASS` | la clé d'API SendGrid | **le même** *Server API Token* | le mot de passe |
| `MAIL_FROM` | `France Immeuble <contact@france-immeuble.fr>` | idem | idem |

Le code ne dépend d'aucun fournisseur : changer de route se fait en changeant
ces variables, sans toucher au code (`lib/bo/mail.ts`).

**Pour démarrer : SendGrid, sans toucher au DNS.** Son DKIM est déjà posé et
aligné sur `france-immeuble.fr` (enregistrements `s1`/`s2._domainkey`) : les
mails partent signés au nom du domaine dès aujourd'hui. La clé d'API doit
porter la permission *Mail Send*, et `MAIL_FROM` doit être une adresse du
domaine authentifié.

**Postmark s'essaie en parallèle, sans rien casser.** Les deux services
cohabitent : Postmark signe avec un sélecteur DKIM différent de celui de
SendGrid, et sa route de retour (`pm-bounces`) est un nom nouveau. Aucun
enregistrement existant n'est modifié, le site continue d'envoyer par
SendGrid pendant l'essai. Et pour un premier test, une simple *Sender
Signature* (une adresse confirmée d'un clic) suffit : **zéro DNS**.

Sur le fond, Postmark est le meilleur outil des deux pour ce que fait cette
app : il ne fait que du transactionnel — il refuse le marketing, donc ses
serveurs ne sont jamais salis par les campagnes de masse d'autres clients —
et il garde 45 jours chaque message avec son contenu et ses événements, ce
qui répond en dix secondes à « le propriétaire dit qu'il n'a rien reçu ».
Mais pour quelques dizaines d'envois par jour, les deux font le travail : la
délivrabilité se joue d'abord sur le DNS ci-dessous, pas sur le fournisseur.

**Les SMS ne viennent d'aucun des deux.** SendGrid appartient à Twilio, mais
n'envoie que des e-mails ; les SMS passent par l'API Twilio, avec son propre
compte et ses propres identifiants (`Account SID`, `Auth Token`, numéro
expéditeur). Postmark n'envoie pas de SMS du tout.

## 2. Les trois réglages DNS qui décident du spam

Relevé du **14/08/2026** sur `france-immeuble.fr` :

| | État | À faire |
|---|---|---|
| MX | OVH (`mx*.mail.ovh.net`) | — |
| SPF | `v=spf1 include:mx.ovh.com ~all` | **rien** — voir ci-dessous |
| DKIM | SendGrid signé (`s1`/`s2._domainkey`), aligné sur le domaine | rien ; activer DKIM OVH seulement si on envoie par OVH |
| Chemin de retour | `em3897.france-immeuble.fr` → SendGrid, SPF `ip4:168.245.79.154 -all` | rien |
| DMARC | **absent** | **à créer — le seul manque** |

**L'authentification SendGrid est complète.** Le domaine est authentifié
(« Domain Authentication : Verified »), donc SendGrid n'expédie pas sous
`france-immeuble.fr` mais sous `em3897.france-immeuble.fr`, un sous-domaine qui
lui appartient et qui porte son propre SPF. Le SPF est donc vérifié sur ce
sous-domaine — il passe — et comme il partage le domaine racine de l'adresse
d'expéditeur, il s'aligne au sens de DMARC. Le DKIM, lui, signe déjà
`d=france-immeuble.fr`. **Les deux mécanismes passent et s'alignent : il n'y a
aucune ligne SPF à ajouter.**

Conséquence pratique : toute adresse `@france-immeuble.fr` peut expédier sans
être déclarée une par une. Romain enverra depuis la sienne sans aucune
manipulation.

### a. DMARC (le plus important, il manque complètement)

Sans DMARC, chaque messagerie décide seule du sort d'un message venu d'un
tiers au nom du domaine — même quand SPF et DKIM passent, comme ici. C'est ce
qui explique qu'une partie des mails du formulaire arrive en spam et l'autre
non : le filtre d'OVH voit un serveur extérieur écrire au nom de
`france-immeuble.fr` et doit deviner. DMARC lui répond.

- Nom : `_dmarc` · Type : `TXT`
- Valeur : `v=DMARC1; p=none; rua=mailto:ma.voci@france-immeuble.fr; fo=1`
  (une adresse qui existe vraiment : les rapports doivent arriver quelque part)

On démarre en `p=none` : aucune conséquence sur la remise, on ne fait
qu'observer. Après quelques semaines de rapports, passer à
`p=quarantine; pct=100`.

### b. SPF — rien à faire

Il n'y a **pas** de ligne SendGrid à ajouter : son chemin de retour
`em3897.france-immeuble.fr` porte déjà son propre SPF, vérifié et aligné.
Ajouter `include:sendgrid.net` au SPF racine ne servirait à rien et
consommerait une des dix résolutions DNS autorisées.

Le SPF racine ne concerne que les mails partant des boîtes OVH elles-mêmes,
et il est correct.

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

## 5. Filet de recette : `MAIL_REDIRECT`

La preview travaille sur les vraies données : un essai d'envoi partirait chez
un vrai propriétaire. Poser la variable **`MAIL_REDIRECT`** (sur l'environnement
Preview uniquement) détourne **tous** les envois vers cette adresse :

```
MAIL_REDIRECT = ma.voci@france-immeuble.fr
```

L'objet devient `[ESSAI → adresse.du.vrai.destinataire] …` et le message
rappelle en tête à qui il serait parti. Le reste — expéditeur, pièce jointe,
signature — est strictement identique à un envoi réel, donc le test reste
valable pour juger de la délivrabilité.

Ne pas poser cette variable en Production.
