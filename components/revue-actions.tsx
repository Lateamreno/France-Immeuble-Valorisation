"use client";

import { useTransition } from "react";
import { deleteFeedback, setFeedbackStatut } from "@/lib/bo/feedback";

export function FeedbackActions({ id, statut }: { id: number; statut: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="mrow" style={{ gap: 5, marginTop: 8 }}>
      {statut !== "corrige" && (
        <button className="fadd" type="button" disabled={pending}
          onClick={() => start(() => setFeedbackStatut(id, "corrige"))}>
          Marquer corrigé
        </button>
      )}
      {statut !== "ecarte" && (
        <button className="fadd" type="button" disabled={pending}
          onClick={() => {
            const r = prompt("Pourquoi écarter ce retour ? (optionnel)") ?? undefined;
            start(() => setFeedbackStatut(id, "ecarte", r));
          }}>
          Écarter
        </button>
      )}
      {statut !== "ouvert" && (
        <button className="fadd" type="button" disabled={pending}
          onClick={() => start(() => setFeedbackStatut(id, "ouvert"))}>
          Rouvrir
        </button>
      )}
      <button className="xdel" type="button" disabled={pending} title="Supprimer"
        onClick={() => {
          if (!confirm("Supprimer ce retour ?")) return;
          start(() => deleteFeedback(id));
        }}>✕</button>
    </div>
  );
}
