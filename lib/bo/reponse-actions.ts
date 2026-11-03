"use server";

// Le clic sur « Intéressé » / « Pas intéressé » d'un e-mail (MAV, 02/11).
// L'action ne fait RIEN sans une signature valide : c'est elle qui prouve que
// le lien vient d'un e-mail du BO, pour cette proposition et cette réponse.
import { noterInteret, refuserProposition, signatureValide } from "./reponse-client";

export async function repondreProposition(p: string, r: string, s: string): Promise<{ ok: boolean; message: string }> {
  if (!signatureValide(p, r, s)) {
    return { ok: false, message: "Ce lien n'est pas reconnu. Répondez simplement à notre e-mail : c'est pris en compte." };
  }
  if (r === "non") {
    const ok = await refuserProposition(p, "lien e-mail");
    if (ok) {
      const { noterRetourClient } = await import("./reponse-client");
      await noterRetourClient(p, "Pas intéressé", "e-mail");
    }
    return ok
      ? { ok: true, message: "C'est noté : nous ne vous relancerons plus sur ce dossier. Merci de votre réponse." }
      : { ok: false, message: "Ce dossier n'existe plus de notre côté. Merci quand même de votre réponse." };
  }
  const ok = await noterInteret(p, "e-mail");
  return ok
    ? { ok: true, message: "Merci ! Votre intérêt est bien noté : nous vous rappelons rapidement." }
    : { ok: false, message: "Ce dossier n'existe plus de notre côté. Répondez à notre e-mail, nous revenons vers vous." };
}
