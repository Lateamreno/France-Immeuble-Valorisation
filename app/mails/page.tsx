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

export default async function MailsPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const { agent = "marc-antoine" } = await searchParams;
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
        email: s2(fiche?.email),
        telephone: s2(fiche?.["portable (TXT)"]) ?? s2(fiche?.portable),
      }}
      boite={b ? { adresse: b.adresse, nomAffiche: b.nomAffiche } : undefined}
    />
  );
}
