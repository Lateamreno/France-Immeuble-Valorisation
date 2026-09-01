"use client";

/**
 * Retour #212 — « fais en sorte que quelle que soit la page sur laquelle je
 * suis, je peux revenir à la page d'avant en cliquant sur précédent ».
 *
 * Le bouton du navigateur existe, mais l'outil s'utilise aussi installé sur
 * l'écran d'accueil (PWA), où il n'y a ni barre d'adresse ni flèche : il
 * fallait la nôtre. Elle vit dans la coquille, donc sur toutes les pages.
 *
 * Deux comportements, et c'est le second qui compte : `router.back()` quand on
 * est arrivé là en naviguant, sinon on remonte d'un cran dans le chemin. Sans
 * ce repli, le bouton ne ferait rien du tout sur une fiche ouverte depuis un
 * lien collé ou un signet — le cas où on en a justement besoin.
 */
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** Le parent d'une page, quand l'historique ne peut pas servir. */
function remonter(chemin: string): string {
  const p = chemin.replace(/\/+$/, "");
  // /bien/xxx/mandat/yyy → /bien/xxx ; /bien/xxx → /immeubles ; sinon l'accueil.
  const parts = p.split("/").filter(Boolean);
  if (parts.length > 2) return `/${parts.slice(0, parts.length - 2).join("/")}`;
  if (parts[0] === "bien") return "/immeubles";
  return "/";
}

export function Precedent({ classe = "prec" }: { classe?: string }) {
  const router = useRouter();
  const chemin = usePathname();
  /* Combien de pages on a traversées DANS cette session d'onglet. Le compteur
     de `window.history` ne sert à rien ici : il compte aussi les pages vues
     avant d'entrer dans l'outil, et `back()` sortirait alors du BO. */
  const vues = useRef(0);

  useEffect(() => { vues.current += 1; }, [chemin]);

  return (
    <button
      type="button" className={classe} title="Revenir à la page précédente"
      onClick={() => { if (vues.current > 1) router.back(); else router.push(remonter(chemin)); }}
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M15.4 4.6 8 12l7.4 7.4" />
      </svg>
      Précédent
    </button>
  );
}
