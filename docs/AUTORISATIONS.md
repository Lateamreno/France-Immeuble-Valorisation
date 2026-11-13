# Autorisations du BO — direction et agents

> Validé par MAV le 27/10/26. Fait foi pour le code (`lib/auth/`, `lib/bo/admin.ts`).
> Toute règle est vérifiée **côté serveur** ; masquer un bouton n'est qu'un confort.

## Connexion

- Chacun se connecte avec son e-mail professionnel et **son** mot de passe.
  Il vit dans Supabase Auth, jamais dans le BO.
- Premier mot de passe : la direction le **définit** et le transmet (revirement
  de MAV le 27/10 : les liens par e-mail se perdaient), ou elle fait choisir le
  sien à l'agent par un lien — envoyé par e-mail, ou copié et passé par SMS.
  Chacun le change ensuite quand il veut (« Mon mot de passe », bas du menu).
- Un lien ne sert qu'une fois, vaut une heure, et chaque nouveau lien annule
  les précédents.
- Session de 30 jours (cookie signé). Couper un accès agit **tout de suite**,
  même sur un poste resté connecté.
- La connexion n'est **imposée** qu'avec `BO_AUTH=on` dans Vercel ; sans elle (ou avec `off`), le BO reste ouvert comme avant. C'est ce qui permet à chacun de choisir son mot de passe avant que la porte se ferme, et de la rouvrir en secours.
- Restent ouvertes sans connexion les adresses des machines, chacune avec sa
  clé : `/api/site/*`, `/api/claude/*`, `/api/mailingvox/*`, les crons, et
  `/api/photo` (à refermer par des liens signés, CLAUDE.md §10 bis).

## Deux rôles

| | Direction | Agent |
|---|---|---|
| Créer un agent, ouvrir / couper un accès, changer un rôle (Réglages › Équipe) | ✅ | ❌ |
| Réglages de l'agence, Datas | ✅ | ❌ |
| Tableau de bord d'un collègue, vue « tous » | ✅ | ✅ |
| Ouvrir et **modifier** les dossiers des collègues (immeubles, contacts) | ✅ | ✅ |
| Transférer **ses** immeubles et contacts à un collègue | ✅ | ✅ |
| Se transférer — ou réattribuer — le dossier d'un autre | ✅ | ❌ |
| Registre des mandats complet | ✅ | ✅ |
| Annuler **son** mandat | ✅ | ✅ |
| Annuler le mandat d'un collègue | ✅ | ❌ |
| Publier ses biens sur le site France Immeuble et Plein Bail | ✅ | ✅ |
| Écrire, corriger un récit de vente | ✅ | ✅ |
| Publier un récit de vente sur le site | ✅ | ❌ — **demande** : la direction reçoit un e-mail et relit avant la mise en ligne |
| Retirer une vente du site, publier tout le parc | ✅ | ❌ |
| Exports CSV de listes (prospection…) | ✅ | ❌ — il doit être difficile d'emporter la base |
| Salves e-mail et SMS vers ses acquéreurs | ✅ | ✅ |
| Mailing : voir les campagnes et leurs réponses | ✅ | ✅ |
| Mailing : lancer, mettre en pause, arrêter une campagne | ✅ | ❌ — une campagne parle au nom de l'agence à tout le fichier |
| Prospection (consulter) | ✅ | ✅ (pour l'instant) |
| Actions Claude (Drive…) | ✅ | ✅ |

« Son » dossier = l'immeuble dont il est l'agent (`AGENT`), le contact qu'il
suit (`SUIVI`), le mandat qui porte son nom (`AGENT`).

## Où c'est appliqué

- La porte : `middleware.ts` (signature du cookie) et `app/layout.tsx` (compte
  relu en base, accès coupé = renvoyé à la connexion).
- Les transferts : `gardeTransfert` dans `lib/bo/actions.ts`, au point de
  passage de toutes les écritures — tout chemin qui toucherait `AGENT` d'un
  immeuble ou `SUIVI` d'un contact y passe.
- L'annulation de mandat : `cancelMandat` (`lib/bo/actions.ts`).
- La diffusion et les récits : `lib/bo/admin.ts` (`peutDiffuser`, `estAdmin`),
  `lib/bo/ventes-site.ts` (`demanderPublication`).
- Les pages de direction : `exigerDirection()` (`lib/auth/comptes.ts`).
- Les exports : `exporterCibles` (`lib/bo/prospection-actions.ts`).
