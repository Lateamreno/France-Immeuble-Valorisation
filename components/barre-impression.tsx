"use client";

// Barre de l'aperçu du dossier : elle ne s'imprime pas et disparaît du PDF.
import Link from "next/link";

export function BarreImpression({
  retour, children,
}: {
  retour: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="dos-bar">
      <Link href={retour}>← Retour à la fiche</Link>
      <span className="sp" />
      <span>{children}</span>
      <button type="button" onClick={() => window.print()}>Imprimer / Enregistrer en PDF</button>
    </div>
  );
}
