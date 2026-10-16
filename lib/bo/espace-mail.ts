/**
 * L'envoi des liens de réinitialisation.
 *
 * Le client demande, la base pose un jeton et ne le rend à personne — sinon la
 * clé publique suffirait à prendre la main sur n'importe quel compte. C'est
 * ici, avec la clé de service, que les demandes en attente sont relevées et
 * expédiées.
 *
 * Ce module ne prend AUCUN paramètre venu d'un navigateur : il relève ce qui
 * est en attente, point. Il n'y a donc rien à lui faire dire.
 */

import "server-only";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type Attente = { jeton: string; email: string };

/**
 * Envoie les liens de réinitialisation posés depuis moins de deux minutes.
 *
 * La fenêtre courte évite de renvoyer d'anciens jetons si l'envoi a échoué
 * plusieurs fois, et suffit largement : la fonction est appelée juste après la
 * demande.
 */
export async function envoyerReinitialisationsEnAttente(): Promise<number> {
  if (!SB_KEY) return 0;
  const p = new URLSearchParams({
    select: "jeton,fi_compte_client(email)",
    usage: "eq.reinitialisation",
    utilise_le: "is.null",
    cree_le: `gte.${new Date(Date.now() - 120_000).toISOString()}`,
    limit: "20",
  });
  const res = await fetch(`${SB_URL}/rest/v1/fi_jeton_compte?${p}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return 0;

  const lignes = (await res.json()) as { jeton: string; fi_compte_client: { email: string } | null }[];
  const attentes: Attente[] = lignes
    .filter((l) => l.fi_compte_client?.email)
    .map((l) => ({ jeton: l.jeton, email: l.fi_compte_client!.email }));
  if (attentes.length === 0) return 0;

  const { envoyerMail, envoiPossible } = await import("@/lib/bo/mail");
  if (!(await envoiPossible())) return 0;

  const base = process.env.SITE_URL ?? "https://bo.france-immeuble.fr";
  let envoyes = 0;
  for (const a of attentes) {
    await envoyerMail({
      to: a.email,
      subject: "Votre espace France Immeuble — nouveau mot de passe",
      text: [
        "Bonjour,",
        "",
        "Vous avez demandé à changer le mot de passe de votre espace France Immeuble.",
        `Ce lien est valable deux heures : ${base}/espace/activer/${a.jeton}`,
        "",
        "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.",
        "",
        "France Immeuble",
      ].join("\n"),
    }).then(() => { envoyes++; }).catch(() => undefined);
  }
  return envoyes;
}
