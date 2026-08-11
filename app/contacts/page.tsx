import { listContacts } from "@/lib/bubble/server";
import { ListeShell } from "@/components/liste";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const rows = await listContacts().catch(() => []);
  return (
    <div className="lst-page">
      <h1 className="lst-title">Contacts</h1>
      <div style={{ fontSize: 12, color: "var(--gray-txt)", marginBottom: 8 }}>
        Les 300 contacts modifiés le plus récemment (la base en compte ~42 800 — recherche globale à venir).
      </div>
      <ListeShell rows={rows} searchPlaceholder="Recherchez un contact..." tabs={[{ key: "tous", label: "Toutes" }]} />
    </div>
  );
}
