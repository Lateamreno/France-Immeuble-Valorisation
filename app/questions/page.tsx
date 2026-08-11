import { listQuestions } from "@/lib/bubble/server";
import { ListeShell } from "@/components/liste";

export const dynamic = "force-dynamic";

export default async function QuestionsPage() {
  const rows = await listQuestions().catch(() => []);
  return (
    <div className="lst-page">
      <h1 className="lst-title">Questions</h1>
      <ListeShell
        rows={rows}
        searchPlaceholder="Recherchez une question..."
        tabs={[
          { key: "en_cours", label: "En cours" },
          { key: "cloturees", label: "Clôturées" },
        ]}
      />
    </div>
  );
}
