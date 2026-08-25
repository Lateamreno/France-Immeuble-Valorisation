import { getAgents, listMails } from "@/lib/bubble/server";
import {
  brouillons, dossierDe, etatReleve, etatsMails, mailsEntrants, messagesTypes, salves,
} from "@/lib/mails/serveur";
import { boiteRelevee, releveConfiguree } from "@/lib/mails/releve";
import { EcranMails } from "@/components/mails/ecran";

export const dynamic = "force-dynamic";

export default async function MailsPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const { agent = "marc-antoine" } = await searchParams;
  const [mails, entrants, etats, mt, br, sv, releve, agents] = await Promise.all([
    listMails(600).catch(() => []),
    mailsEntrants().catch(() => []),
    etatsMails().catch(() => new Map()),
    messagesTypes().catch(() => []),
    brouillons().catch(() => []),
    salves().catch(() => []),
    etatReleve().catch(() => null),
    getAgents().catch(() => []),
  ]);

  /* Le dossier est calculé ici, une fois : la vue n'a pas à croiser deux
     listes à chaque rendu. */
  const ranges = mails.map((m) => ({
    ...m,
    dossier: dossierDe(m.id, m.entrant, etats),
    lu: etats.get(m.id)?.lu ?? !m.entrant,
  }));

  /* Les messages relevés prennent la forme des autres : l'écran n'a pas à
     savoir d'où vient un message pour l'afficher. */
  const recus = entrants.map((m) => ({
    id: m.id,
    entrant: true,
    objet: m.objet || "(sans objet)",
    extrait: m.corps.slice(0, 150),
    corps: m.corps,
    qui: m.de_nom || m.de,
    adresse: m.de,
    date: m.recu_le,
    contactId: m.contact_id ?? undefined,
    immeubleId: m.immeuble_id ?? undefined,
    immeubleLabel: undefined,
    estimationId: m.estimation_id ?? undefined,
    suiviId: undefined,
    pj: m.pieces.length,
    pile: (m.immeuble_id || m.estimation_id ? "affaires" : "a_classer") as "affaires" | "a_classer",
    dossier: dossierDe(m.id, true, etats),
    lu: etats.get(m.id)?.lu ?? false,
    /* Pourquoi le message est rangé là : l'agent doit pouvoir le contester. */
    reconnaissance: m.raison ?? undefined,
  }));

  const actifs = agents.filter((a) => a.actif);
  const courant = actifs.find((a) => a.slug === agent) ?? actifs[0];

  return (
    <EcranMails
      mails={[...recus, ...ranges]}
      releve={{
        active: releveConfiguree(),
        boite: boiteRelevee(),
        derniereLe: releve?.derniere_le ?? undefined,
        dernierMessage: releve?.dernier_message ?? undefined,
      }}
      brouillons={br}
      messagesTypes={mt}
      salves={sv}
      agent={{ id: courant?.id ?? "", nom: courant?.name ?? "France Immeuble" }}
    />
  );
}
