/**
 * La ligne « libellé + champ » — objet n° 3 du catalogue (validé le 25/09).
 *
 * Le couple formé par un petit titre (« Civilité », « Budget de… ») et la
 * case où l'on tape : la brique de base de tous les formulaires. Quatre
 * dessins cohabitaient (titre en capitales grises, titre en gras, titre à
 * gauche, titre dans le coin). Un seul objet, avec ses options :
 *
 *   <Champ libelle="Prénom">…</Champ>                  titre au-dessus
 *   <Champ libelle="Prénom" gauche>…</Champ>           titre à gauche
 *   <Champ libelle="Budget" aide="en euros HAI">…      une aide sous la case
 *   <Champ libelle="Nom" obligatoire>…                 l'astérisque
 *
 * Chaque écran choisit la disposition ; le jour où l'on veut, par exemple,
 * l'aide en orange ou les titres en capitales partout, ça se change ici.
 */
import type { ReactNode } from "react";

export function Champ({
  libelle, children, aide, gauche = false, obligatoire = false, htmlFor, className, capitales = false, large = false, erreur,
}: {
  libelle: ReactNode;
  children: ReactNode;
  /** Une ligne grise sous la case. */
  aide?: ReactNode;
  /** Titre à gauche de la case (fiche contact, fenêtre Suivi). */
  gauche?: boolean;
  obligatoire?: boolean;
  /** L'identifiant du champ, pour que le clic sur le titre le prenne. */
  htmlFor?: string;
  className?: string;
  /** Titre en petites capitales (réglages). */
  capitales?: boolean;
  /** Prend toute la largeur d'une grille. */
  large?: boolean;
  /** Un message d'erreur sous la case : la case passe en rouge. */
  erreur?: ReactNode;
}) {
  const cls = [
    "chp",
    gauche ? "gauche" : "",
    capitales ? "caps" : "",
    large ? "large" : "",
    erreur ? "ko" : "",
    className ?? "",
  ].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <label className="chp-l" htmlFor={htmlFor}>
        {libelle}{obligatoire && <b className="chp-ob" title="Obligatoire">*</b>}
      </label>
      <div className="chp-c">{children}</div>
      {erreur ? <i className="chp-e">{erreur}</i> : aide ? <i className="chp-a">{aide}</i> : null}
    </div>
  );
}
