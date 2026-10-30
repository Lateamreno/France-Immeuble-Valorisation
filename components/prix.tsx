"use client";

// Description et prix — réplique de l'écran du BO (retours #93, #94, #398).
//
// Le prix affiché est le dernier en date : celui de l'estimation, du mandat,
// ou celui saisi à la main. La molette le fait bouger et tout le tableau suit
// — c'est l'outil de négociation, il faut voir en direct ce que coûte une
// baisse. Rien n'est enregistré tant qu'on n'a pas validé.
import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useDepartUrl } from "@/lib/etat-url";
import type { BienData } from "@/lib/bubble/server";
import { euros, group, S } from "@/lib/format";
import { ecart, rendements, type ContexteRendement } from "@/lib/bo/rendements";
import { PICTOS_DEST } from "@/components/pictos-destination";
import { enregistrerPrix, updateBien } from "@/lib/bo/actions";
import { BarreEnregistrer } from "@/components/barre-enregistrer";
import { Modale, useQuestion } from "@/components/modale";

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
    <Modale
      titre="Nouveau prix" onFermer={onFermer} className="sect-mod"
      pied={
        <>
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
        </>
      }
    >
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
    </Modale>
  );
}

/* ---------- Écran ---------- */

/* Depuis le retour #310, l'écran du prix ne s'occupe plus du compte client :
   il est passé à l'onglet Propriétaire avec l'espace vendeur. Il garde
   `espace` parce qu'il en reprend le prix arrêté par le propriétaire. */

/* ============ Retour #311 · rendre l'écran du prix lisible d'un coup ========
   MAV : « tu peux faire des pictos et organiser les informations pour que ce
   soit plus compréhensible, pareil pour le prix, les honos et tout. Limite tu
   fais un petit résumé d'état locatif, genre Bureau x — x m² — x loyer, avec
   une ligne par type sur deux colonnes, et le récap dans lequel on met tous
   les loyers, les travaux, le prix au m² après travaux et la renta après
   travaux vs actuel — limite remettre les deux grilles de la détermination de
   prix de l'estimation. »

   L'écran donnait le prix et les rendements, mais rien de ce dont ils
   découlent : on descendait dans l'état locatif pour savoir ce qui compose
   les loyers, et on refaisait de tête le prix au m² travaux compris. Deux
   blocs comblent ça — ce que l'immeuble contient, et ce que ça donne. */

/* Pictos de destination, les mêmes que l'état locatif et l'estimation (#444). */
const IC_DEST = PICTOS_DEST;

/** Les destinations qui se comptent au lot, jamais au m² (retours #249/#250). */
const AU_LOT = new Set(["Cave", "Parking"]);

/**
 * Le résumé de l'immeuble, sous le titre (retour #398).
 *
 * MAV : « dans l'encadré or pas besoin de mettre d'infos, c'est juste pour dire
 * sur quelle page on est ; par contre c'est bien de remettre les infos
 * principales sur l'immeuble dans "ce que l'immeuble contient" pour rappeler
 * la surface, l'occupation, le nombre de lots, le loyer annuel actuel et
 * potentiel et les travaux à réaliser. Du coup ça s'appellerait résumé de
 * l'immeuble. »
 *
 * Les cinq pastilles du #338 quittent donc le cadre or pour rejoindre le
 * détail par destination du #311, dans un seul bloc : les chiffres d'ensemble
 * en tête, et dessous d'où ils viennent. Les travaux s'y ajoutent — c'est eux
 * qui séparent le prix actuel du prix potentiel des deux tableaux plus bas.
 */
function ResumeImmeuble({ b, ctx, occupationPct }: {
  b: BienData; ctx: ContexteRendement; occupationPct: number;
}) {
  const tuiles: [string, string][] = [
    ["Surface Carrez", ctx.surface > 0 ? `${group(Math.round(ctx.surface))} m²` : "n.c."],
    ["Occupation", `${Math.round(occupationPct)} %`],
    ["Lots", `${b.lots.length} lot${b.lots.length > 1 ? "s" : ""}`],
    ["Loyer annuel actuel", `${euros(Math.round(ctx.loyers))} HC`],
    ["Loyer annuel potentiel", `${euros(Math.round(ctx.loyersMax))} HC`],
    ["Travaux à réaliser", ctx.travaux > 0 ? euros(Math.round(ctx.travaux)) ?? "—" : "Aucun"],
  ];
  return (
    <>
      <div className="fsub">Résumé de l&apos;immeuble</div>
      <div className="px-res">
        <div className="px-res-g">
          {tuiles.map(([l, v]) => (
            <div className="px-res-t" key={l}><span>{l}</span><b>{v}</b></div>
          ))}
        </div>
        <ResumeLocatif b={b} />
      </div>
    </>
  );
}

/**
 * Le détail par destination, une ligne par destination, sur deux colonnes.
 *
 * « Bureau 3 lots — 120 m² — 2 400 €/mois » : de quoi comprendre d'où viennent
 * les loyers sans quitter l'écran du prix. Les caves et les parkings
 * n'affichent pas de surface — un prix au m² de parking ne veut rien dire.
 */
function ResumeLocatif({ b }: { b: BienData }) {
  const lignes = useMemo(() => {
    const par = new Map<string, { lots: number; occ: number; surface: number; loyer: number; max: number }>();
    for (const l of b.lots) {
      const d = S(l.Destination) || "Autre";
      const e = par.get(d) ?? { lots: 0, occ: 0, surface: 0, loyer: 0, max: 0 };
      e.lots++;
      if ((num(l.loyer) ?? 0) > 0) e.occ++;
      e.surface += num(l.surface_carrez) ?? 0;
      e.loyer += num(l.loyer) ?? 0;
      e.max += num(l.loyer_max) ?? num(l.loyer) ?? 0;
      par.set(d, e);
    }
    return [...par.entries()]
      .map(([dest, v]) => ({ dest, ...v }))
      .sort((a, z) => z.loyer - a.loyer || z.lots - a.lots);
  }, [b.lots]);

  if (lignes.length === 0) return null;
  return (
    <>
      <div className="px-res-s">Ce que l&apos;immeuble contient</div>
      <div className="px-loc">
        {lignes.map((l) => (
          <div className="px-loc-l" key={l.dest}>
            <span className="px-loc-ic"><svg viewBox="0 0 24 24">{IC_DEST[l.dest] ?? IC_DEST.Annexe}</svg></span>
            <b>{l.dest}</b>
            <span className="px-loc-n">{l.lots} lot{l.lots > 1 ? "s" : ""}</span>
            {!AU_LOT.has(l.dest) && l.surface > 0 && (
              <span className="px-loc-n">{group(l.surface)} m²</span>
            )}
            <span className="sp" />
            <span className={`px-loc-v${l.loyer > 0 ? "" : " vide"}`}>
              {l.loyer > 0 ? `${group(l.loyer)} €/mois` : "libre"}
            </span>
            {l.occ < l.lots && (
              <span className="px-loc-o" title={`${l.lots - l.occ} lot(s) sans loyer`}>
                {l.occ}/{l.lots}
              </span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export function PrixEcran({ b }: {
  b: BienData;
}) {
  const im = b.im;
  const immeubleId = String(im._id);
  const [pending, start] = useTransition();
  const [modale, setModale] = useState(false);
  /* Le prix du propriétaire, quand l'agent choisit de le reprendre : il
     ouvre la fenêtre « Nouveau prix » déjà remplie, avec le bon motif. */
  const [duVendeur, setDuVendeur] = useState<number | null>(null);

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


  /* Le taux d'occupation des pastilles de synthèse (#338). Il se compte en
     SURFACE et non en nombre de lots : douze caves libres et un plateau de
     bureaux loué, ce n'est pas 8 % d'occupation. C'est la même définition que
     celle des rendements plus bas — deux chiffres qui se contrediraient à
     l'écran seraient pires que pas de chiffre du tout. */
  const occupationPct = ctx.surface > 0 ? (ctx.surfaceOccupee / ctx.surface) * 100 : 0;

  /* Retour #337 — « t'as pas mis la charge des honoraires ; si le mandat est
     signé tu reprends l'info depuis le mandat, et s'il n'y a pas de mandat tu
     écris "Mandat non signé". »
     C'est le mandat qui tranche, pas la fiche : la charge des honoraires est
     une clause signée. Le champ de l'immeuble, lui, n'était qu'une copie —
     et une copie qui se désynchronise ment sur un point qui engage l'agence
     (et qui, sur un lot préemptable, doit rester charge vendeur, §8.2). */
  const chargeHonos = useMemo(() => {
    const signes = b.mandats.filter(
      (m) => String(m.Type ?? "Vente") === "Vente"
        && (m.date_signature || m.pdf_signed)
        && String(m.Statut ?? "") !== "Annulé",
    );
    const recent = [...signes].sort((x, y) =>
      String(y.date_signature ?? y["Created Date"] ?? "").localeCompare(
        String(x.date_signature ?? x["Created Date"] ?? "")))[0];
    const v = S(recent?.Charge_hono);
    return v ? { texte: `Charge ${v.toLowerCase()}`, mandat: true } : { texte: "Mandat non signé", mandat: false };
  }, [b.mandats]);

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

  /* Retour #398 — « la page prix est trop déstructurée. Sur le BO actuel elle
     ne prend pas toute la largeur, ce qui facilite la lecture : elle est
     cantonnée au milieu. » La page se resserre donc sur ~760 px (`px-page`),
     et suit l'ordre de la capture du BO : le résumé de l'immeuble sous le
     titre, le prix actuel, les deux tableaux, la marge, les conditions,
     l'historique. Le cadre or ne porte plus que le titre (voir PrixSection
     dans bien-fiche.tsx) : ses pastilles vivent maintenant dans le résumé. */
  return (
    <div className="px-page" style={pending ? { opacity: 0.6 } : undefined}>
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

      {/* Les deux grilles de l'estimation, que MAV voulait retrouver ici. */}
      <div className="pxt-row">
        <TableauRendement titre="Actuel" col={r.actuel} refs={refs} />
        <TableauRendement titre="Potentiel" col={r.potentiel} refs={refs} />
      </div>

      {/* MAV, 25/09 : « le résumé de l'immeuble, tu le mets en dessous du prix
          et du tableau, juste avant la marge de négo ». */}
      <div style={{ marginTop: 18 }}>
        <ResumeImmeuble b={b} ctx={ctx} occupationPct={occupationPct} />
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
            {/* Non modifiable, et lue du MANDAT SIGNÉ (#337) : c'est une clause
                signée, pas une case de la fiche. Sans mandat signé, on le dit
                plutôt que d'afficher une valeur qui n'engage personne. */}
            <i className={chargeHonos.mandat ? "fige" : "fige requis"}
               title={chargeHonos.mandat ? "Repris du mandat signé" : "Aucun mandat de vente signé sur ce bien"}>
              {chargeHonos.texte}
            </i>
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
        /* Retour #454 : Annuler rend l'état d'avant modification. */
        onAnnuler={() => {
          const v = JSON.parse(enBase.current) as { nvMin: string; financement: boolean; permis: boolean };
          setNvMin(v.nvMin); setFinancement(v.financement); setPermis(v.permis);
        }}
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
