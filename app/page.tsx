import { PageHeader } from "@/components/page-header";

const MILESTONES = [
  { code: "M1", label: "Fondations — couche opérations, rôles, RLS", statut: "à venir" },
  { code: "M2", label: "Immeubles, lots, baux, coffre documentaire", statut: "en cours" },
  { code: "M3", label: "Estimation bloc vs découpe & grilles de prix", statut: "à venir" },
  { code: "M4", label: "Prestataires & devis email (boîte devis@)", statut: "à venir" },
  { code: "M5", label: "Documents contractuels & registre des mandats", statut: "à venir" },
  { code: "M6", label: "Dashboard & moteur de séquencement", statut: "à venir" },
];

const OPERATIONS_REF = [
  "55 rue Volant — Nanterre (11 lots + caves/parkings)",
  "Maison-Alfort (5 lots)",
  "Montreuil",
];

export default function Home() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Vue d'ensemble des opérations de découpe. Le calendrier unifié et les alertes d'échéances arriveront avec le moteur de séquencement (M6)."
        milestone="M6"
      />

      <section className="mb-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Milestones
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {MILESTONES.map((m) => (
            <li
              key={m.code}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900">
                {m.code}
              </span>
              <div>
                <p className="text-sm font-medium">{m.label}</p>
                <span
                  className={
                    "mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium " +
                    (m.statut === "en cours"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400")
                  }
                >
                  {m.statut}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Opérations de référence (tests)
        </h2>
        <ul className="space-y-2">
          {OPERATIONS_REF.map((op) => (
            <li
              key={op}
              className="rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400"
            >
              {op}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
