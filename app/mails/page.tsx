import { getAgents, listMails } from "@/lib/bubble/server";
import { brouillons, dossierDe, etatsMails, messagesTypes, salves } from "@/lib/mails/serveur";
import { EcranMails } from "@/components/mails/ecran";

export const dynamic = "force-dynamic";

export default async function MailsPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const { agent = "marc-antoine" } = await searchParams;
  const [mails, etats, mt, br, sv, agents] = await Promise.all([
    listMails(600).catch(() => []),
    etatsMails().catch(() => new Map()),
    messagesTypes().catch(() => []),
    brouillons().catch(() => []),
    salves().catch(() => []),
    getAgents().catch(() => []),
  ]);

  /* Le dossier est calculé ici, une fois : la vue n'a pas à croiser deux
     listes à chaque rendu. */
  const ranges = mails.map((m) => ({
    ...m,
    dossier: dossierDe(m.id, m.entrant, etats),
    lu: etats.get(m.id)?.lu ?? !m.entrant,
  }));

  const actifs = agents.filter((a) => a.actif);
  const courant = actifs.find((a) => a.slug === agent) ?? actifs[0];

  return (
    <EcranMails
      mails={ranges}
      brouillons={br}
      messagesTypes={mt}
      salves={sv}
      agent={{ id: courant?.id ?? "", nom: courant?.name ?? "France Immeuble" }}
    />
  );
}
