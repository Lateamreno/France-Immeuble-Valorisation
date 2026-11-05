// Écran Mails.
//
// Les messages ne viennent plus d'une copie en base : ils sont lus en direct
// sur la boîte de l'agent (voir components/mails/boite-vivante.tsx). Cette
// page ne fait donc que résoudre QUI regarde, et QUELLE boîte est la sienne —
// la lecture elle-même se fait à l'affichage, et se relit sur demande.
import { getAgentFiche, getAgents } from "@/lib/bubble/server";
import { brouillons, messagesTypes, salves } from "@/lib/mails/serveur";
import { boiteDe } from "@/lib/mails/boites";
import { EcranMails } from "@/components/mails/ecran";

export const dynamic = "force-dynamic";
/* Une salve part depuis cette page, un message par destinataire et une pause
   entre chacun : deux cents contacts, c'est plusieurs minutes. Sans cette
   ligne, la fonction est coupée à la durée par défaut — et elle est coupée EN
   PLEIN MILIEU, une partie des messages déjà partis. */
export const maxDuration = 300;

export default async function MailsPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; to?: string; objet?: string; corps?: string }>;
}) {
  const { agent = "marc-antoine", to, objet, corps } = await searchParams;
  const [mt, br, sv, agents] = await Promise.all([
    messagesTypes().catch(() => []),
    brouillons().catch(() => []),
    salves().catch(() => []),
    getAgents().catch(() => []),
  ]);

  const actifs = agents.filter((a) => a.actif);
  const courant = actifs.find((a) => a.slug === agent) ?? actifs[0];
  const fiche = courant ? await getAgentFiche(courant.id).catch(() => null) : null;
  const s2 = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

  /* La boîte branchée, s'il y en a une. On ne descend QUE l'adresse et le nom
     affiché : le mot de passe, même chiffré, n'a rien à faire dans une page. */
  const b = courant ? await boiteDe(courant.id, agents).catch(() => null) : null;

  return (
    <EcranMails
      brouillons={br}
      messagesTypes={mt}
      salves={sv}
      agent={{
        id: courant?.id ?? "",
        nom: courant?.name ?? "France Immeuble",
        slug: courant?.slug,
        email: s2(fiche?.email),
        telephone: s2(fiche?.["portable (TXT)"]) ?? s2(fiche?.portable),
      }}
      boite={b ? { adresse: b.adresse, nomAffiche: b.nomAffiche } : undefined}
      agents={actifs.map((a) => ({ slug: a.slug, name: a.name }))}
      /* Un autre écran peut demander d'ouvrir la rédaction avec un message
         déjà écrit — la mise en attente d'un dossier, par exemple (#141). */
      amorce={to ? { to, objet: objet ?? "", corps: corps ?? "" } : undefined}
    />
  );
}
