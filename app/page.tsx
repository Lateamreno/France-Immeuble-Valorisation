const MODULES = [
  { code: "M1", label: "Fondations — couche opérations, rôles, RLS", statut: "en cours" },
  { code: "M2", label: "Immeubles, lots, baux, coffre documentaire", statut: "à venir" },
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
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <header className="mb-10">
        <p className="text-sm font-medium uppercase tracking-widest text-slate-500">
          Groupe Grey Stone Capital · France Immeuble
        </p>
        <h1 className="mt-1 text-4xl font-bold tracking-tight">
          Cockpit Découpe
        </h1>
        <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-400">
          Cockpit d&apos;opération de vente à la découpe : un immeuble, un cycle de
          vie complet, du mandat à l&apos;encaissement du dernier lot.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">Milestones</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {MODULES.map((m) => (
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
        <h2 className="mb-4 text-lg font-semibold">
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

      <footer className="mt-12 border-t border-slate-200 pt-6 text-xs text-slate-400 dark:border-slate-800">
        Backend : Supabase « Plein Bail » (mutualisé). Le cockpit ajoute la couche
        opérations au-dessus de listings / listing_lots.
      </footer>
    </main>
  );
}
