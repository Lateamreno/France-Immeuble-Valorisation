"use client";

// Description et prix — réplique de l'écran du BO (retours #93 et #94).
//
// Le prix affiché est le dernier en date : celui de l'estimation, du mandat,
// ou celui saisi à la main. La molette le fait bouger et tout le tableau suit
// — c'est l'outil de négociation, il faut voir en direct ce que coûte une
// baisse. Rien n'est enregistré tant qu'on n'a pas validé.
import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useDepartUrl } from "@/lib/etat-url";
import type { BienData } from "@/lib/bubble/server";
import { euros, group } from "@/lib/format";
import { ecart, rendements, type ContexteRendement } from "@/lib/bo/rendements";
import { enregistrerPrix, updateBien } from "@/lib/bo/actions";
import { marquerPrixRepris, ouvrirEspace, revoquerEspace } from "@/lib/bo/espace-actions";
import { ouvrirCompteClient } from "@/lib/bo/comptes-bo";
import type { Espace } from "@/lib/bo/espace-modele";
import { BarreEnregistrer } from "@/components/barre-enregistrer";

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const parse = (s: string) => {
  const n = parseFloat(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};
const fr1 = (x?: number) => (x === undefined ? "—" : (Math.round(x * 10) / 10).toLocaleString("fr-FR"));

/** Motifs du menu déroulant de la fenêtre « Nouveau prix » (#94). */
export const MOTIFS_PRIX = [
  "Prix de commercialisation",
  "Baisse de prix",
  "Baisse d'honoraires",
  "Prix souhaité par le vendeur",
  "Autre",
];

const dateFr = (v: unknown) => {
  const d = new Date(String(v ?? ""));
  return Number.isNaN(+d) ? "" : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

/* ---------- Bloc prix : net vendeur + honoraires + HAI + molette ---------- */

function BlocPrix({
  nv, honos, hai, onHai, onReinit, reference,
}: {
  nv: number; honos: number; hai: number;
  onHai: (v: number) => void;
  onReinit: () => void;
  reference: number;
}) {
  const taux = nv > 0 ? Math.round((honos / nv) * 1000) / 10 : 0;
  // La molette couvre 30 % de part et d'autre du prix de référence : au-delà,
  // ce n'est plus une négociation, c'est un autre bien.
  const bas = Math.round(reference * 0.7);
  const haut = Math.round(reference * 1.3);
  return (
    <>
      <div className="pxl">
        <span className="pxl-c fige">
          <span className="pxl-lab">Net vendeur</span>
          <b>{group(nv)} €</b>
        </span>
        <span className="pxl-op">+</span>
        <span className="pxl-c">
          <span className="pxl-lab">Honoraires TTC</span>
          <b>{group(honos)} €</b>
          <em>{fr1(taux)} %</em>
        </span>
        <span className="pxl-op">=</span>
        <span className="pxl-c">
          <span className="pxl-lab">Prix HAI</span>
          <input
            className="pxl-in" inputMode="numeric" value={group(hai)}
            onChange={(e) => onHai(parse(e.target.value) ?? 0)}
          />
          <button type="button" className="pxl-raz" title="Revenir au dernier prix enregistré" onClick={onReinit}>
            <svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v5h-5" /></svg>
          </button>
        </span>
      </div>
      <input
        className="pxl-range" type="range" min={bas} max={haut} step={1000} value={Math.min(haut, Math.max(bas, hai))}
        onChange={(e) => onHai(Number(e.target.value))}
        aria-label="Faire varier le prix"
      />
    </>
  );
}

/* ---------- Tableaux Actuel / Potentiel ---------- */

function TableauRendement({
  titre, col, refs,
}: {
  titre: string;
  col: ReturnType<typeof rendements>["actuel"];
  refs: { loyer?: number; prix?: number; renta?: number };
}) {
  /* Le vert et le rouge disent la même chose que dans le BO : au-dessus du
     secteur pour un loyer, c'est bon ; au-dessus pour un prix, c'est cher. */
  const Ligne = ({
    label, valeur, unite, pct, sens,
  }: {
    label: string; valeur?: number; unite: string; pct?: number;
    /** 1 : plus haut vaut mieux. −1 : plus haut est moins bon. 0 : neutre. */
    sens: 1 | -1 | 0;
  }) => {
    const ton = pct === undefined || sens === 0 ? "" : pct * sens >= 0 ? " ok" : " ko";
    return (
      <tr className={ton.trim()}>
        <th>{label}</th>
        <td className="pct">{pct !== undefined && <span>{pct > 0 ? "+" : ""}{pct} %</span>}</td>
        <td className="val">{valeur === undefined ? "n.c." : `${fr1(valeur)} ${unite}`}</td>
      </tr>
    );
  };
  return (
    <table className="pxt">
      <thead><tr><th colSpan={3}>{titre}</th></tr></thead>
      <tbody>
        <Ligne label="Loyer au m²" valeur={col.loyerM2} unite="€/m²/mois" pct={ecart(col.loyerM2, refs.loyer)} sens={1} />
        <Ligne label="Prix au m²" valeur={col.prixM2} unite="€/m²" pct={ecart(col.prixM2, refs.prix)} sens={-1} />
        <Ligne label="Brut" valeur={col.brut} unite="%" pct={ecart(col.brut, refs.renta)} sens={1} />
        <Ligne label="Net" valeur={col.net} unite="%" sens={0} />
        <Ligne label="Acte en main" valeur={col.acteEnMain} unite="%" sens={0} />
      </tbody>
    </table>
  );
}

/* ---------- Fenêtre « Nouveau prix » (#94) ---------- */

function ModalePrix({
  b, ctx, refs, depart, tauxHonos, propose, motifDepart, onFermer, onEnregistre,
}: {
  b: BienData; ctx: ContexteRendement;
  refs: { loyer?: number; prix?: number; renta?: number };
  depart: number; tauxHonos: number;
  /** Prix HAI proposé d'emblée — le prix arrêté par le propriétaire (#56). */
  propose?: number;
  motifDepart?: string;
  onFermer: () => void;
  /** Appelé après un enregistrement réussi, pour clore le prix du vendeur. */
  onEnregistre?: () => void;
}) {
  const [pending, start] = useTransition();
  const [hai, setHai] = useState(propose ?? depart);
  const [motif, setMotif] = useState(motifDepart ?? MOTIFS_PRIX[0]);
  const [remarque, setRemarque] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  const nv = Math.round(hai / (1 + tauxHonos / 100));
  const honos = hai - nv;
  const r = rendements(hai, ctx);

  return (
    <div className="modal-ov" onClick={onFermer}>
      <div className="modal sect-mod" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          Nouveau prix
          <button type="button" onClick={onFermer}>✕</button>
        </div>
        <div className="modal-b">
          <div className="pxm-bien">
            <b>{b.ville}</b> — {b.adresse}
          </div>
          <BlocPrix nv={nv} honos={honos} hai={hai} onHai={setHai} onReinit={() => setHai(depart)} reference={depart} />
          <div className="pxt-row">
            <TableauRendement titre="Actuel" col={r.actuel} refs={refs} />
            <TableauRendement titre="Potentiel" col={r.potentiel} refs={refs} />
          </div>
          <div className="fsub" style={{ marginTop: 16 }}>Motif</div>
          <select className="min" value={motif} onChange={(e) => setMotif(e.target.value)}>
            {MOTIFS_PRIX.map((m) => <option key={m}>{m}</option>)}
          </select>
          <span className="mlab">Remarques</span>
          <textarea className="min" rows={3} value={remarque} onChange={(e) => setRemarque(e.target.value)}
            placeholder="Ce qui justifie ce prix" />
          {erreur && <p className="carte-err" style={{ marginTop: 8 }}>{erreur}</p>}
        </div>
        <div className="modal-f">
          <span />
          <button className="savebar-go" type="button" disabled={pending || hai <= 0}
            onClick={() =>
              start(async () => {
                setErreur(null);
                try {
                  await enregistrerPrix(String(b.im._id), { hai, honosTtc: honos, motif, remarque: remarque || undefined });
                  onEnregistre?.();
                  onFermer();
                } catch (e) {
                  setErreur(e instanceof Error ? e.message : "enregistrement impossible");
                }
              })
            }>
            {pending ? "Enregistrement…" : "❯ Enregistrer le prix"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- L'espace vendeur, côté agent (tâche #56) ---------- */

/**
 * Le lien ouvert au propriétaire, et ce qu'il en a fait.
 *
 * Deux choses au même endroit, parce qu'elles se répondent : le lien qu'on lui
 * envoie, et le prix qu'il en rapporte. Le prix arrive EN ATTENTE — MAV l'a
 * tranché : rien n'entre tout seul dans la fiche, même doctrine que les envois
 * d'e-mails. « Reprendre ce prix » ouvre la fenêtre « Nouveau prix » déjà
 * remplie, avec le motif « Prix souhaité par le vendeur » : le prix passe par
 * le chemin habituel, avec son historique, pas par une porte dérobée.
 */
/**
 * Retour #310 — « je veux que l'espace vendeur soit dans l'onglet propriétaire. »
 *
 * C'est sa place : il ne parle pas du prix mais de la PERSONNE — son accès,
 * son compte, son adresse e-mail, les pièces qu'elle dépose. Il occupait le
 * haut de « Description et prix », où l'on vient pour fixer un prix, et
 * repoussait le prix sous la ligne de flottaison.
 *
 * Il reprend le prix arrêté par le propriétaire, ce qui se fait dans l'autre
 * onglet : quand `onReprendre` n'est pas fourni — c'est le cas depuis l'onglet
 * Propriétaire — le bouton devient un renvoi vers l'écran du prix, qui sait le
 * reprendre.
 */
export function EspaceVendeur({
  immeubleId, espace, tauxHonos, proprietaireId, proprietaireEmail, compteActif, onReprendre,
}: {
  immeubleId: string;
  espace?: Espace | null;
  tauxHonos: number;
  /** La fiche contact du propriétaire : c'est elle qui porte le compte. */
  proprietaireId?: string;
  proprietaireEmail?: string;
  compteActif?: boolean;
  /** Absent depuis l'onglet Propriétaire : la reprise se fait sur le prix. */
  onReprendre?: (nv: number) => void;
}) {
  const [pending, start] = useTransition();
  const [jeton, setJeton] = useState(espace && !espace.revoque ? espace.jeton : null);
  const [copie, setCopie] = useState(false);
  /* L'espace CLIENT (compte + mot de passe), ouvert depuis le bien : MAV le
     demande ici parce que c'est ici qu'on parle du propriétaire, pas dans sa
     fiche contact. Le compte reste rattaché à la fiche — une personne, un
     compte — mais on n'a plus à y aller pour l'ouvrir. */
  const [lienCompte, setLienCompte] = useState<string | null>(null);
  const [copieCompte, setCopieCompte] = useState(false);
  const [erreurCompte, setErreurCompte] = useState<string | null>(null);
  const urlCompte = lienCompte
    ? `${typeof window === "undefined" ? "" : window.location.origin}${lienCompte}` : "";

  const url = jeton ? `${typeof window === "undefined" ? "" : window.location.origin}/proprietaire/${jeton}` : "";
  const prix = espace?.prix_nv ?? undefined;
  const aRepondu = prix !== undefined && !espace?.prix_repris;

  const copier = () => {
    navigator.clipboard?.writeText(url).then(() => {
      setCopie(true);
      setTimeout(() => setCopie(false), 2200);
    }).catch(() => undefined);
  };

  return (
    <div className={`espv${aRepondu ? " repondu" : ""}`}>
      <div className="espv-hd">
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M4 10.5 12 4l8 6.5V20H4z" /><path d="M9.5 20v-5.5h5V20" />
        </svg>
        <b>Espace vendeur</b>
        <span className="sp" style={{ flex: 1 }} />
        {jeton ? (
          <>
            <a className="espv-lien" href={url} target="_blank" rel="noreferrer">Ouvrir</a>
            <button type="button" className="espv-b" onClick={copier}>{copie ? "Lien copié ✓" : "Copier le lien"}</button>
            <button type="button" className="espv-b ko" disabled={pending}
              onClick={() => start(async () => { await revoquerEspace(immeubleId, jeton); setJeton(null); })}>
              Fermer l&apos;accès
            </button>
          </>
        ) : (
          <button type="button" className="espv-b go" disabled={pending}
            onClick={() => start(async () => { setJeton(await ouvrirEspace(immeubleId)); })}>
            {pending ? "Ouverture…" : "Ouvrir un espace vendeur"}
          </button>
        )}
      </div>

      {!jeton && (
        <p className="espv-txt">
          Un lien secret à envoyer au propriétaire{proprietaireEmail ? ` (${proprietaireEmail})` : ""} : il y
          arrête son prix, dépose ses pièces — elles arrivent au coffre de l&apos;immeuble — et suit
          l&apos;avancement. Aucune donnée de locataire ni d&apos;acquéreur ne s&apos;y affiche.
        </p>
      )}

      {jeton && !prix && (
        <p className="espv-txt">
          {espace?.ouvert_le
            ? `Lien ouvert ${espace.visites} fois, la dernière le ${dateFr(espace.derniere_visite)}. Le propriétaire n'a pas encore arrêté son prix.`
            : "Lien créé, jamais ouvert. Envoyez-le au propriétaire — il est valable quatre mois."}
        </p>
      )}

      {prix !== undefined && (
        <div className="espv-prix">
          <div>
            <span className="espv-lab">
              {espace?.prix_repris ? "Prix repris du propriétaire" : "Le propriétaire a arrêté son prix"}
              {espace?.prix_le ? ` · ${dateFr(espace.prix_le)}` : ""}
            </span>
            <b>{euros(prix)} net vendeur</b>
            <em>soit {euros(Math.round(prix * (1 + tauxHonos / 100)))} HAI</em>
          </div>
          {aRepondu && (onReprendre ? (
            <button type="button" className="espv-b go" onClick={() => onReprendre(prix)}>
              Reprendre ce prix
            </button>
          ) : (
            <Link className="espv-b go" href={`/bien/${immeubleId}?ecran=prix&reprendre=1`}>
              Reprendre ce prix →
            </Link>
          ))}
        </div>
      )}
      {espace?.prix_mot && (
        <p className="espv-mot">« {espace.prix_mot} »</p>
      )}

      {/* L'espace client, avec mot de passe : celui sur lequel le propriétaire
          revient. Le lien secret ci-dessus reste pour qui refuse d'en créer un. */}
      {proprietaireId && (
        <div className="espv-cli">
          <span className="espv-lab">
            Espace client (avec mot de passe) —
            {compteActif ? " ouvert" : " pas encore ouvert"}
            {proprietaireEmail ? ` · ${proprietaireEmail}` : ""}
          </span>
          <button type="button" className="espv-b" disabled={pending || !proprietaireEmail}
            onClick={() => start(async () => {
              setErreurCompte(null);
              const r = await ouvrirCompteClient(proprietaireId, proprietaireEmail ?? "");
              if (r.ok) setLienCompte(r.lien); else setErreurCompte(r.message);
            })}>
            {pending ? "…" : compteActif ? "Renvoyer un lien d'accès" : "Ouvrir l'espace client"}
          </button>
          {erreurCompte && <p className="espv-txt" style={{ color: "#a5341f" }}>{erreurCompte}</p>}
          {lienCompte && (
            <p className="espv-txt">
              <code style={{ fontSize: 12, wordBreak: "break-all" }}>{urlCompte}</code>{" "}
              <button type="button" className="espv-b" onClick={() => {
                navigator.clipboard?.writeText(urlCompte).then(() => {
                  setCopieCompte(true);
                  setTimeout(() => setCopieCompte(false), 2200);
                }).catch(() => undefined);
              }}>{copieCompte ? "Copié ✓" : "Copier"}</button>
              <br />Valable 7 jours, une seule fois. Il y retrouvera ses immeubles et ses recherches.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Écran ---------- */

/* Depuis le retour #310, l'écran du prix ne s'occupe plus du compte client :
   il est passé à l'onglet Propriétaire avec l'espace vendeur. Il garde
   `espace` parce qu'il en reprend le prix arrêté par le propriétaire. */
export function PrixEcran({ b, espace }: {
  b: BienData; espace?: Espace | null;
}) {
  const im = b.im;
  const immeubleId = String(im._id);
  const [pending, start] = useTransition();
  const [modale, setModale] = useState(false);
  /* Le prix du propriétaire, quand l'agent choisit de le reprendre : il
     ouvre la fenêtre « Nouveau prix » déjà remplie, avec le bon motif. */
  const [duVendeur, setDuVendeur] = useState<number | null>(null);
  /* Retour #310 — l'espace vendeur vit maintenant dans l'onglet Propriétaire ;
     son bouton « Reprendre ce prix » renvoie donc ici, avec `?reprendre=1`.
     On ouvre alors la fenêtre « Nouveau prix » déjà remplie du prix arrêté par
     le propriétaire, exactement comme le bouton le faisait sur place. */
  const demandeReprise = useDepartUrl<string>("reprendre", "");
  const [repriseVue, setRepriseVue] = useState(false);

  /* Contexte de calcul : les mêmes entrées que l'estimation. */
  const ctx: ContexteRendement = useMemo(() => {
    const surface = b.lots.reduce((s, l) => s + (num(l.surface_carrez) ?? 0), 0);
    const surfaceOccupee = b.lots
      .filter((l) => (num(l.loyer) ?? 0) > 0)
      .reduce((s, l) => s + (num(l.surface_carrez) ?? 0), 0);
    return {
      loyers: num(im.fin_loyers_an) ?? 0,
      loyersMax: num(im.fin_loyers_an_max) ?? num(im.fin_loyers_an) ?? 0,
      charges: num(im.fin_charges_non_recup) ?? 0,
      travaux: num(im.fin_travaux) ?? 0,
      surface,
      surfaceOccupee,
    };
  }, [b.lots, im]);

  const sect = b.secteur ?? {};
  const refs = {
    loyer: num(sect["0 - loyer_mois"]),
    prix: num(sect["0 - prix"]),
    renta: num(sect["0 - renta _%"]),
  };

  const dernier = b.prixHisto[0];
  const prixEnBase = num(im.prix_hai) ?? num(dernier?.in_prix_hai) ?? 0;
  const honosEnBase = num(im.prix_honos_ttc) ?? num(dernier?.in_honos_ttc) ?? 0;
  const nvEnBase = Math.max(0, prixEnBase - honosEnBase);
  const tauxHonos = nvEnBase > 0 ? (honosEnBase / nvEnBase) * 100 : 5;

  /* On n'ouvre la fenêtre qu'une fois, et seulement s'il y a bien un prix de
     propriétaire à reprendre : ajuster l'état pendant le rendu est la façon
     prévue de réagir à une demande venue de l'adresse, et un effet ferait
     apparaître l'écran du prix avant la fenêtre. */
  const prixVendeur = espace?.prix_nv;
  if (demandeReprise === "1" && !repriseVue) {
    setRepriseVue(true);
    if (prixVendeur !== undefined && prixVendeur !== null && !espace?.prix_repris) {
      setDuVendeur(Math.round(prixVendeur * (1 + tauxHonos / 100)));
      setModale(true);
    }
  }

  /* Le prix de la molette ne touche à rien : il sert à voir. */
  const [hai, setHai] = useState(prixEnBase);
  const nv = Math.round(hai / (1 + tauxHonos / 100));
  const honos = hai - nv;
  const r = rendements(hai, ctx);

  /* Marge de négociation : le net vendeur minimum est une saisie. */
  const [nvMin, setNvMin] = useState(S(num(im.prix_nv_min)));
  const [financement, setFinancement] = useState(im.prix_financement !== false);
  const [permis, setPermis] = useState(im.prix_permis === true);
  const enBase = useRef("");
  const courant = JSON.stringify({ nvMin, financement, permis });
  if (!enBase.current) enBase.current = courant;
  const modifie = courant !== enBase.current;

  const nvMinN = parse(nvMin);
  const marge = nvMinN !== undefined && nvEnBase > 0 ? Math.round(((nvEnBase - nvMinN) / nvEnBase) * 1000) / 10 : 0;

  /* Sans estimation ni prix, on ne bricole pas un écran vide : on renvoie
     vers l'estimation, qui est le point de départ. */
  if (prixEnBase <= 0) {
    return (
      <div className="px-vide">
        <p>Ce bien n&apos;a pas encore de prix : il vient de l&apos;estimation.</p>
        <Link className="savebar-go" href={`/bien/${immeubleId}/estimation`}>Estimer le bien</Link>
      </div>
    );
  }

  return (
    <div style={pending ? { opacity: 0.6 } : undefined}>
      <div className="blor">
        <div className="blor-t">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M15 9.2c-.7-.8-1.8-1.2-3-1.2-1.7 0-2.7.8-2.7 1.9 0 2.7 5.7 1.3 5.7 4.1 0 1.2-1.1 2-2.9 2-1.3 0-2.4-.4-3.1-1.2M12 6.2v11.6" /></svg>
          Prix
        </div>
        <div className="blor-chips">
          <span className="fchip"><b>{euros(prixEnBase)}</b> HAI</span>
          <span className="fchip"><b>{euros(nvEnBase)}</b> net vendeur</span>
        </div>
      </div>

      <div className="px-hd">
        <div className="fsub">Prix actuel</div>
        <button className="fadd" type="button" onClick={() => setModale(true)}>✎ Modifier le prix</button>
      </div>
      <div className="px-act">
        <span className="d">{dateFr(dernier?.["Created Date"])}</span>
        <span className="t">{S(dernier?.in_Motif) || "Prix en fiche"}</span>
        {S(dernier?.in_remarque) && <span className="c">{S(dernier?.in_remarque)}</span>}
        <span className="sp" />
        <span className="badge">Prix actuel</span>
        <span className="v">{euros(prixEnBase)} HAI</span>
      </div>

      <BlocPrix nv={nv} honos={honos} hai={hai} onHai={setHai} onReinit={() => setHai(prixEnBase)} reference={prixEnBase} />
      {hai !== prixEnBase && (
        <p className="px-simu">
          Simulation à {euros(hai)} HAI — le prix en fiche reste {euros(prixEnBase)}. Passez par
          « Modifier le prix » pour l&apos;enregistrer.
        </p>
      )}

      <div className="pxt-row">
        <TableauRendement titre="Actuel" col={r.actuel} refs={refs} />
        <TableauRendement titre="Potentiel" col={r.potentiel} refs={refs} />
      </div>

      <div className="fsub" style={{ marginTop: 18 }}>Marge de négociation</div>
      <div className="px-cards">
        <div className="px-card">
          <span className="px-ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 6.2v11.6M15 9.2c-.7-.8-1.8-1.2-3-1.2-1.7 0-2.7.8-2.7 1.9 0 2.7 5.7 1.3 5.7 4.1 0 1.2-1.1 2-2.9 2-1.3 0-2.4-.4-3.1-1.2" /></svg></span>
          <span><b>Net vendeur actuel</b><i>{euros(nvEnBase)}</i></span>
        </div>
        <div className="px-card">
          <span className="px-ic"><svg viewBox="0 0 24 24"><path d="M12 4v14M6 13l6 6 6-6" /></svg></span>
          <span><b>Marge de négociation</b><i className={marge > 0 ? "vert" : "rouge"}>{fr1(marge)} %</i></span>
        </div>
        <div className="px-card">
          <span className="px-ic"><svg viewBox="0 0 24 24"><path d="M12 3 2.5 20h19z" /><path d="M12 10v4M12 17v.2" /></svg></span>
          <span>
            <b>Net vendeur minimum</b>
            <input className={`min${nvMin ? "" : " requis"}`} value={nvMin} onChange={(e) => setNvMin(e.target.value)}
              placeholder="À convenir avec le propriétaire" />
          </span>
        </div>
      </div>

      <div className="fsub" style={{ marginTop: 18 }}>Conditions de la vente</div>
      <div className="px-cards">
        <div className="px-card">
          <span className="px-ic"><svg viewBox="0 0 24 24"><path d="M4 7h16v10H4z" /><path d="M8 11h8M8 14h5" /></svg></span>
          <span>
            <b>Charge honoraires</b>
            {/* Non modifiable : c'est le mandat qui tranche. */}
            <i className="fige" title="Déterminé par le mandat">{S(im.prix_Charge_honos) || "n.c."}</i>
          </span>
        </div>
        <Bascule
          titre="Financements" ic={<><path d="M3 9.5 12 4l9 5.5M5 10v8M19 10v8M3 20h18M9 10v8M15 10v8" /></>}
          non="Refusés" oui="Acceptés" valeur={financement} onChange={setFinancement}
        />
        <Bascule
          titre="Permis de construire" ic={<><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>}
          non="Refusés" oui="Acceptés" valeur={permis} onChange={setPermis}
        />
      </div>
      <BarreEnregistrer
        modifie={modifie} pending={pending}
        onEnregistrer={() =>
          start(async () => {
            await updateBien(immeubleId, {
              prix_nv_min: nvMinN,
              prix_financement: financement,
              prix_permis: permis,
            });
            enBase.current = courant;
          })
        }
      />

      <div className="fsub" style={{ marginTop: 18 }}>Historique des prix</div>
      {b.prixHisto.length === 0 ? (
        <div className="fempty">Aucun changement de prix enregistré.</div>
      ) : (
        b.prixHisto.map((p, i) => (
          <div className="px-act histo" key={String(p._id ?? i)}>
            <span className="d">{dateFr(p["Created Date"])}</span>
            <span className="t">{S(p.in_Motif) || S(p.in_Data_source) || "Prix"}</span>
            {S(p.in_remarque) && <span className="c">{S(p.in_remarque)}</span>}
            <span className="sp" />
            <span className="v">{euros(p.in_prix_hai)} HAI</span>
          </div>
        ))
      )}

      {modale && (
        <ModalePrix
          b={b} ctx={ctx} refs={refs} depart={prixEnBase} tauxHonos={tauxHonos}
          propose={duVendeur ?? undefined}
          motifDepart={duVendeur !== null ? "Prix souhaité par le vendeur" : undefined}
          onFermer={() => { setModale(false); setDuVendeur(null); }}
          onEnregistre={() => {
            if (duVendeur !== null && espace) void marquerPrixRepris(immeubleId, espace.jeton);
            setDuVendeur(null);
          }}
        />
      )}
    </div>
  );
}

/** Bascule à deux états des conditions de vente. */
function Bascule({
  titre, ic, non, oui, valeur, onChange,
}: {
  titre: string; ic: React.ReactNode; non: string; oui: string;
  valeur: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="px-card">
      <span className="px-ic"><svg viewBox="0 0 24 24">{ic}</svg></span>
      <span>
        <b>{titre}</b>
        <span className="px-basc">
          <em className={valeur ? "" : "on rouge"}>{non}</em>
          <button type="button" className={`px-sw${valeur ? " on" : ""}`} onClick={() => onChange(!valeur)}
            aria-pressed={valeur} aria-label={titre}><span /></button>
          <em className={valeur ? "on vert" : ""}>{oui}</em>
        </span>
      </span>
    </div>
  );
}
