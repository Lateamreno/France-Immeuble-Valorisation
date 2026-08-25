"use client";

// Estimation — réplique des écrans du BO (captures du 10/08) : Immeuble →
// Secteur → Prix et analyse → PDF → Envoi. Prix et Analyse sont réunis pour
// arbitrer le prix et rédiger la justification devant les mêmes chiffres.
// Tout est servi par l'état locatif et la fiche secteur ; ce qui manque porte
// un point d'exclamation rouge. Le prix est figé à la génération.
import { useMemo, useState, useTransition } from "react";
import { oublier, useMemoire } from "@/lib/memoire";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BienData } from "@/lib/bubble/server";
import { euros, group } from "@/lib/format";
import { Copier } from "@/components/copier";
import { AdressesInput } from "@/components/adresses-input";
import {
  createEstimation, envoyerEstimation, genererPdfEstimation, setEstimationStatut,
  type EstimationPayload,
} from "@/lib/bo/actions";

const STEPS = ["Immeuble", "Secteur", "Prix et analyse", "PDF", "Envoi"] as const;

const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const parse = (s: string) => (s === "" ? undefined : parseFloat(s.replace(",", ".")));
const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const fr1 = (x: number) => x.toFixed(1).replace(".", ",");
const dmyfr = (v: unknown) => (typeof v === "string" ? v.slice(0, 10).split("-").reverse().join("/") : "");

/* Pictos de destination du BO, repris dans l'état locatif et le secteur. */
const IC_DEST: Record<string, React.ReactNode> = {
  Logement: <><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /></>,
  Commerce: <><path d="M4 8h16l-1 12H5z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  Bureau: <><rect x="3" y="7" width="18" height="12" rx="1.5" /><path d="M9 7V5h6v2" /></>,
  Logistique: <><path d="M3 20V9l9-5 9 5v11z" /><path d="M9 20v-6h6v6" /></>,
  Cave: <><path d="M4 20V8l8-4 8 4v12z" /><path d="M9 20v-7h6v7" /></>,
  Parking: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M10 16V9h3a2.5 2.5 0 0 1 0 5h-3" /></>,
  Annexe: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 12h6" /></>,
};

/* Préfixe des colonnes de prix_secteur, identique à l'onglet Emplacement. */
const DEST_PREFIX: Record<string, string> = {
  Logement: "hab", Commerce: "com", Bureau: "bur", Parking: "parking", Cave: "cave",
};

/* Fondamentaux : la note se choisit en étoiles, le libellé suit (comme le BO). */
const FONDAMENTAUX = [
  { cle: "bati", label: "Bati", libelles: ["à rénover entièrement", "gros travaux à prévoir", "en état d'usage", "en bon état", "comme neuf"] },
  { cle: "emp", label: "Emplacement", libelles: ["emplacement difficile", "emplacement moyen", "correctement situé", "bien situé", "idéalement situé"] },
  { cle: "lot", label: "Lots", libelles: ["à rénover entièrement", "travaux à prévoir", "en état d'usage", "en bon état", "comme neufs"] },
] as const;

/* Le BO affiche des libellés courts ; la valeur enregistrée reste celle du
   référentiel acquéreurs, pour ne pas casser l'historique. */
const CIBLES_EST = [
  { valeur: "Investisseur", label: "Locatif", picto: <><path d="M4 18 10 11l4 4 6-8" /><path d="M20 7v5h-5" /></> },
  { valeur: "Patrimonial", label: "Patrimonial", picto: <><path d="m12 3 2.5 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.4 6.8 19.2l1.1-5.9L3.6 9.2l5.9-.8z" /></> },
  { valeur: "Marchand de biens", label: "Marchand", picto: <><path d="m14.5 5.5 4 4-8.5 8.5H6v-4z" /><path d="M13 7 17 11" /></> },
  { valeur: "Promoteur", label: "Promotion", picto: <><path d="M5 21V8l7-5 7 5v13" /><path d="M9 21v-6h6v6" /></> },
] as const;

/** Champ de l'estimation : servi par la fiche, grisé tant qu'on ne
 *  personnalise pas — le libellé flotte au-dessus comme dans le BO. */
function Champ({
  label, valeur, suffixe, editable, onChange, largeur,
}: {
  label: string;
  valeur: string;
  suffixe?: string;
  editable?: boolean;
  onChange?: (v: string) => void;
  largeur?: number | string;
}) {
  return (
    <label className={`est-ch${editable ? " edit" : ""}`} style={largeur ? { width: largeur } : undefined}>
      <span>{label}</span>
      <input
        value={valeur} readOnly={!editable}
        onChange={(e) => onChange?.(e.target.value)}
      />
      {suffixe && <i>{suffixe}</i>}
    </label>
  );
}

/* Flèches de navigation du wizard (retour #124).
   Les chevrons circulaires « ↺ / ↻ » se lisaient comme un rechargement : on
   dessine une vraie flèche, qui ne dit qu'une chose — on avance, on recule. */
const Fleche = ({ arriere }: { arriere?: boolean }) => (
  <svg className="est-fl" viewBox="0 0 24 24" aria-hidden>
    {arriere
      ? <><path d="M20 12H5" /><path d="m11 6-6 6 6 6" /></>
      : <><path d="M4 12h15" /><path d="m13 6 6 6-6 6" /></>}
  </svg>
);

const Ok = () => <span className="est-ok" title="Complet">✓</span>;
const Ko = () => <span className="est-ko" title="Information manquante — allez la compléter sur la fiche">!</span>;
const Etat = ({ ok }: { ok: boolean }) => (ok ? <Ok /> : <Ko />);

/**
 * Une estimation déjà faite, qu'on rouvre pour l'envoyer (retour #98).
 *
 * MAV : « Si j'ai des estimations à envoyer il faut que je puisse les envoyer
 * en cliquant dessus sinon ça m'oblige à en refaire une. » On ne recalcule
 * donc rien : on remonte l'écran directement sur l'étape Envoi, avec le
 * dossier PDF déjà fabriqué et les chiffres figés de l'estimation d'origine —
 * pas ceux de la fiche, qui ont pu bouger depuis.
 */
export type RepriseEstimation = {
  id: string;
  titre?: string;
  /** Le dossier PDF déjà au coffre, s'il existe. */
  pdfUrl?: string;
  /** Son poids, pour l'afficher en pièce jointe sans le retélécharger. */
  pdfKo?: number;
  /** Chiffres figés au jour de l'estimation, pour le corps du mail. */
  hai?: number;
  nv?: number;
  creeLe?: string;
  statut?: string;
};

export function EstimationWizard({
  b, secteur, envoiActif, reprise,
}: {
  b: BienData;
  secteur: Record<string, unknown> | null;
  /** Vrai quand la boîte d'envoi est configurée : l'app envoie elle-même. */
  envoiActif?: boolean;
  /** Renseigné quand on rouvre une estimation existante pour l'envoyer. */
  reprise?: RepriseEstimation;
}) {
  const router = useRouter();
  const im = b.im;
  const immeubleId = String(im._id);
  /* Espace de noms de la mémoire d'écran : la saisie survit à une balade
     dans les autres menus, y compris hors de la fiche (#96). */
  /* Une reprise a sa propre mémoire d'écran : sinon renvoyer une vieille
     estimation écraserait la saisie d'une nouvelle en cours. */
  const NS = reprise ? `est:${immeubleId}:${reprise.id}:` : `est:${immeubleId}:`;
  const useMem = <T,>(cle: string, initial: T | (() => T)) => useMemoire<T>(NS + cle, initial);

  const [step, setStep] = useMem("step", reprise ? 4 : 0);
  const [pending, start] = useTransition();
  const [estId, setEstId] = useMem<string | null>("estId", reprise?.id ?? null);
  /** Le PDF du dossier, fabriqué juste après l'estimation. */
  const [pdf, setPdf] = useMem<{ url: string; ko: number } | null>(
    "pdf",
    reprise?.pdfUrl ? { url: reprise.pdfUrl, ko: reprise.pdfKo ?? 0 } : null,
  );
  const [pdfKo, setPdfKo] = useState<string | null>(null);
  /** Envoi réel : null tant qu'on n'a pas envoyé, sinon l'horodatage. */
  const [envoye, setEnvoye] = useMem<string | null>("envoye", null);
  const [envoiKo, setEnvoiKo] = useState<string | null>(null);
  /** Copie, copie cachée et pièces jointes (demandes MAV du 14/08). */
  const [cc, setCc] = useMem<string[]>("cc", []);
  const [cci, setCci] = useMem<string[]>("cci", []);
  /* Le destinataire n'est pas toujours le propriétaire de la fiche : gestionnaire,
     conseil, indivisaire qui centralise… On part de lui, et on peut le changer
     comme dans n'importe quelle messagerie (retour #132). */
  const [destinataires, setDest] = useMem<string[]>(
    "dest",
    S(b.proprietaire?.email) ? [S(b.proprietaire?.email)] : [],
  );
  /** Trace du « Marquer envoyée » : sinon le clic ne dit rien (retour #132). */
  const [marque, setMarque] = useState<string | null>(null);
  const [marqueKo, setMarqueKo] = useState<string | null>(null);
  /** Le dossier est joint d'office ; on peut le retirer puis le remettre. */
  const [dossierJoint, setDossierJoint] = useMem("dossierJoint", true);
  const [pjDocs, setPjDocs] = useMem<string[]>("pjDocs", []);
  const [pjFichiers, setPjFichiers] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** « Personnaliser les informations » : les champs servis deviennent éditables. */
  const [perso, setPerso] = useMem("perso", false);

  /* --- Immeuble --- */
  const [gareName, setGareName] = useMem("gareName", S(im.emp_gare_name));
  const [gareTime, setGareTime] = useMem("gareTime", S(num(im.emp_gare_time)));
  const [comName, setComName] = useMem("comName", S(im.emp_com_name));
  const [comTime, setComTime] = useMem("comTime", S(num(im.emp_com_time)));
  const chTf0 = b.charges.filter((c) => String(c.Type_charge ?? "").startsWith("Taxe"))
    .reduce((s, c) => s + (num(c.non_recup_an) ?? num(c.total_an) ?? 0), 0);
  const chAut0 = b.charges.filter((c) => !String(c.Type_charge ?? "").startsWith("Taxe"))
    .reduce((s, c) => s + (num(c.non_recup_an) ?? num(c.total_an) ?? 0), 0);
  const [chTf, setChTf] = useMem("chTf", chTf0 ? String(chTf0) : "");
  const [chAutres, setChAutres] = useMem("chAutres", chAut0 ? String(chAut0) : "");
  const tvxBati0 = b.travaux.filter((t) => Array.isArray(t.COMPOSANTs) && (t.COMPOSANTs as unknown[]).length > 0)
    .reduce((s, t) => s + (num(t.montant) ?? 0), 0);
  const tvxLots0 = b.travaux.filter((t) => Array.isArray(t.LOTs) && (t.LOTs as unknown[]).length > 0)
    .reduce((s, t) => s + (num(t.montant) ?? 0), 0);
  const [tvxBati, setTvxBati] = useMem("tvxBati", tvxBati0 ? String(tvxBati0) : "");
  const [tvxLots, setTvxLots] = useMem("tvxLots", tvxLots0 ? String(tvxLots0) : "");

  /* --- Agrégats lots, par destination comme le BO --- */
  const agg = useMemo(() => {
    const lots = b.lots;
    const by = (d: string) => lots.filter((l) => String(l.Destination ?? "") === d);
    const dests = [...new Set(lots.map((l) => String(l.Destination ?? "")).filter(Boolean))];
    const carrez = lots.reduce((s, l) => s + (num(l.surface_carrez) ?? 0), 0);
    const occ = lots.filter((l) => (num(l.loyer) ?? 0) > 0);
    return {
      dests,
      parDest: dests.map((d) => {
        const ls = by(d);
        return {
          dest: d,
          lots: ls.length,
          occ: ls.filter((l) => (num(l.loyer) ?? 0) > 0).length,
          surface: ls.reduce((s, l) => s + (num(l.surface_carrez) ?? 0), 0),
          // Surface effectivement louée : la colonne « Dont louée » du dossier.
          surfaceOcc: ls.filter((l) => (num(l.loyer) ?? 0) > 0)
            .reduce((s, l) => s + (num(l.surface_carrez) ?? 0), 0),
          loyer: ls.reduce((s, l) => s + (num(l.loyer) ?? 0), 0) * 12,
          max: ls.reduce((s, l) => s + (num(l.loyer_max) ?? num(l.loyer) ?? 0), 0) * 12,
        };
      }),
      tot: lots.length, hab: by("Logement").length, com: by("Commerce").length, bur: by("Bureau").length,
      carrez,
      carrezOcc: occ.reduce((s, l) => s + (num(l.surface_carrez) ?? 0), 0),
      loyersAn: lots.reduce((s, l) => s + (num(l.loyer) ?? 0), 0) * 12,
      loyersMaxAn: lots.reduce((s, l) => s + (num(l.loyer_max) ?? num(l.loyer) ?? 0), 0) * 12,
      occupation: lots.length ? Math.round((occ.length / lots.length) * 100) : 0,
      destinations: dests,
    };
  }, [b.lots]);

  /* --- Secteur : une ligne de références par destination présente, comme le
     BO. Le bandeau « global » n'est pas saisi : c'est la moyenne pondérée par
     les surfaces, et le rendement global s'en déduit (loyer × 12 / prix). --- */
  const sect = secteur ?? {};
  const [refs, setRefs] = useMem<Record<string, { l: string; p: string; r: string }>>("refs", () =>
    Object.fromEntries(agg.parDest.map((d) => {
      const px = DEST_PREFIX[d.dest] ?? "autre";
      // Faute de référence propre à la destination, on part du global saisi
      // dans Emplacement — c'est ce que l'agent recopierait à la main.
      return [d.dest, {
        l: S(num(sect[`${px}_loyer_retenu`]) ?? num(sect["0 - loyer_mois"])),
        p: S(num(sect[`${px}_prix_retenu`]) ?? num(sect["0 - prix"])),
        r: S(num(sect[`${px}_renta_retenu`]) ?? num(sect["0 - renta _%"])),
      }];
    })));
  const majRef = (dest: string, cle: "l" | "p" | "r", v: string) =>
    setRefs({ ...refs, [dest]: { ...refs[dest], [cle]: v.replace(/[^\d.,]/g, "") } });

  const glob = useMemo(() => {
    let sl = 0, sp = 0, st = 0;
    for (const d of agg.parDest) {
      const r = refs[d.dest];
      if (!r || d.surface <= 0) continue;
      const l = parse(r.l), p = parse(r.p);
      if (l === undefined && p === undefined) continue;
      st += d.surface; sl += (l ?? 0) * d.surface; sp += (p ?? 0) * d.surface;
    }
    const loyer = st > 0 && sl > 0 ? sl / st : num(sect["0 - loyer_mois"]) ?? 0;
    const prix = st > 0 && sp > 0 ? sp / st : num(sect["0 - prix"]) ?? 0;
    const renta = loyer > 0 && prix > 0 ? (loyer * 12 * 100) / prix : num(sect["0 - renta _%"]) ?? 0;
    return { loyer, prix, renta };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refs, agg.parDest]);

  /* --- Prix --- */
  const travauxTot = (parse(tvxBati) ?? 0) + (parse(tvxLots) ?? 0);
  const chargesTot = (parse(chTf) ?? 0) + (parse(chAutres) ?? 0);
  const rRenta = glob.renta;
  const rPrix = glob.prix;
  const rLoyer = glob.loyer;
  const pRendement = rRenta > 0 ? agg.loyersAn / (rRenta / 100) : 0;
  const pRendementMax = rRenta > 0 ? agg.loyersMaxAn / (rRenta / 100) : 0;
  const pM2 = agg.carrez * rPrix;
  const pM2Max = agg.carrez * rPrix + travauxTot;
  const candidates = [pRendement, pRendementMax, pM2, pM2Max].filter((x) => x > 0);
  const pAuto = candidates.length
    ? Math.round(candidates.reduce((s, x) => s + x, 0) / candidates.length / 1000) * 1000
    : 0;

  const [haiStr, setHaiStr] = useMem("haiStr", "");
  const hai = parse(haiStr) ?? pAuto;
  const [honosPct, setHonosPct] = useMem("honosPct", "5");
  const pct = parse(honosPct) ?? 5;
  const nv = pct >= 0 ? Math.round(hai / (1 + pct / 100)) : hai;
  const honos = hai - nv;
  const haiTravaux = hai + travauxTot;

  /* Bornes du curseur : l'éventail des méthodes, élargi pour l'arbitrage. */
  const bornes = useMemo(() => {
    if (candidates.length === 0) return null;
    const min = Math.floor((Math.min(...candidates) * 0.9) / 5000) * 5000;
    const max = Math.ceil((Math.max(...candidates) * 1.1) / 5000) * 5000;
    return { min, max: Math.max(max, min + 5000) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pRendement, pRendementMax, pM2, pM2Max]);

  const ecart = (v: number, ref: number) => (ref > 0 ? Math.round(((v - ref) / ref) * 100) : 0);
  const lm2Act = agg.carrezOcc > 0 ? agg.loyersAn / 12 / agg.carrezOcc : 0;
  const lm2Max = agg.carrez > 0 ? agg.loyersMaxAn / 12 / agg.carrez : 0;

  /* --- Analyse --- */
  const [scores, setScores] = useMem<Record<string, number>>("scores", { bati: 3, emp: 4, lot: 4 });
  const [cibles, setCibles] = useMem<string[]>("cibles", ["Investisseur"]);
  const [analyse, setAnalyse] = useMem("analyse", "");
  const [titre, setTitre] = useMem("titre", `Estimation ${S(im.adresse_ville)}`.trim());

  /* --- Complétude --- */
  const okAdresse = !!(S(im.adresse_rue) && S(im.adresse_ville));
  const okPoi = !!(gareName && gareTime && comName && comTime);
  const okCharges = chTf !== "";
  const okLocatif = agg.tot > 0 && agg.carrez > 0;
  const okSecteur = rLoyer > 0 && rPrix > 0 && rRenta > 0;
  const okPrixAnalyse = hai > 0 && analyse.trim().length > 0;
  /* Sur une reprise, les trois premières étapes sont derrière nous : elles
     s'affichent faites, pas en alerte sur des données de fiche qui ont pu
     bouger depuis (retour #98). */
  const etatEtape: ("ok" | "warn" | "lock")[] = reprise
    ? ["ok", "ok", "ok", "ok", "ok"]
    : [
        okAdresse && okPoi && okCharges && okLocatif ? "ok" : "warn",
        okSecteur ? "ok" : "warn",
        okPrixAnalyse ? "ok" : "warn",
        estId ? "ok" : step >= 3 ? "warn" : "lock",
        estId ? "ok" : "lock",
      ];

  /* Le dossier d'estimation est déjà en pièce jointe : le proposer une
     seconde fois dans la liste des documents n'aurait pas de sens. */
  const autresDocs = b.documents.filter(
    (d) => String(d.name ?? "") !== "Dossier d'estimation" || String(d.ESTIMATION ?? "") !== estId,
  );

  const envoyer = () =>
    start(async () => {
      setEnvoiKo(null);
      try {
        const fd = new FormData();
        for (const f of pjFichiers) fd.append("f", f);
        await envoyerEstimation({
          immeubleId, estimationId: estId!,
          to: destinataires.join(", "),
          objet: mailObjet,
          message: `${mailCorps}\n\n${b.agentInitials} — France Immeuble`,
          cc: cc.join(", ") || undefined,
          cci: cci.join(", ") || undefined,
          sansDossier: !dossierJoint,
          documents: pjDocs,
          fichiers: pjFichiers.length ? fd : undefined,
        });
        setEnvoye(new Date().toISOString());
      } catch (err) {
        setEnvoiKo(err instanceof Error ? err.message : "erreur inconnue");
      }
    });

  const generer = () =>
    start(async () => {
      setError(null);
      try {
        const payload: EstimationPayload = {
          titre,
          adresse: {
            rue: S(im.adresse_rue) || undefined,
            numero_rue: S(im.adresse_numero_rue) || undefined,
            ville: S(im.adresse_ville) || undefined,
            zipcode: S(im.adresse_zipcode) || undefined,
            departement: S(im.adresse_departement ?? im.adresse_dpt) || undefined,
          },
          imm: {
            nb_lots_tot: agg.tot, nb_lots_hab: agg.hab, nb_lots_com: agg.com, nb_lots_bur: agg.bur,
            carrez_tot: agg.carrez, carrez_occ: agg.carrezOcc, occupation: agg.occupation,
            loyer_hc_tot: agg.loyersAn, loyer_hc_max_tot: agg.loyersMaxAn,
            destinations: agg.destinations,
            parDest: agg.parDest.map((d) => ({
              dest: d.dest, lots: d.lots, surface: d.surface, surfaceOcc: d.surfaceOcc,
              loyer: d.loyer, loyerMax: d.max,
            })),
          },
          emp: {
            gare_name: gareName || undefined, gare_time: parse(gareTime),
            com_name: comName || undefined, com_time: parse(comTime),
          },
          charges: { tf_non_recup: parse(chTf), autres_non_recup: parse(chAutres) },
          travaux: { bati: parse(tvxBati), lots: parse(tvxLots) },
          ref: {
            loyer: rLoyer || undefined, prix: rPrix || undefined, renta: rRenta || undefined,
            parDest: agg.parDest.map((d) => {
              const r = refs[d.dest] ?? { l: "", p: "", r: "" };
              return { dest: d.dest, loyer: parse(r.l), prix: parse(r.p), renta: parse(r.r) };
            }),
          },
          prix: { hai, honos_pct: pct },
          scores: { emp: String(scores.emp), lot: String(scores.lot), bati: String(scores.bati) },
          cibles,
          analyse: analyse || undefined,
          photo: b.photos[0]?.url,
        };
        const id = await createEstimation(immeubleId, String(im.AGENT ?? ""), payload);
        setEstId(id);
        setStep(4);
        // Le dossier 6 pages part ensuite dans le coffre : c'est la pièce
        // jointe du mail. S'il échoue, l'estimation reste valable et la page
        // imprimable prend le relais.
        const f = await genererPdfEstimation(immeubleId, id);
        if (f.ok) setPdf({ url: f.url, ko: f.ko });
        else setPdfKo(f.message);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur inconnue");
      }
    });

  /**
   * Marque l'estimation envoyée (ou interne) — et le DIT.
   *
   * MAV : « quand je clique sur marquée comme envoyée rien ne se passe, ça
   * n'écrit pas que c'est envoyé ». On revenait bien à la fiche, mais sans un
   * mot, et si l'écriture échouait le clic restait muet. Maintenant l'écran
   * confirme, puis rend la main.
   */
  const marquer = (statut: "3 - Envoyée" | "4 - Interne") =>
    start(async () => {
      if (!estId) return;
      setMarqueKo(null);
      try {
        await setEstimationStatut(immeubleId, estId, statut);
        setMarque(statut === "3 - Envoyée"
          ? "Estimation marquée comme envoyée."
          : "Estimation classée en interne.");
        setTimeout(() => router.push(`/bien/${immeubleId}`), 1100);
      } catch (e) {
        setMarqueKo(e instanceof Error ? e.message : "erreur inconnue");
      }
    });

  const Nav = ({ suivantLabel }: { suivantLabel?: string }) => (
    <div className="est-nav">
      {step > 0 && step < 4 && (
        <button className="est-prec" type="button" onClick={() => setStep(step - 1)}>
          <Fleche arriere /> Précédent
        </button>
      )}
      <span className="sp" style={{ flex: 1 }} />
      {step < 3 && (
        <button className="est-suiv" type="button" onClick={() => setStep(step + 1)}>
          {suivantLabel ?? "Suivant"} <Fleche />
        </button>
      )}
    </div>
  );

  const mailObjet = `Estimation de votre immeuble à ${S(im.adresse_ville)}`;
  /* Sur une reprise, le mail annonce les chiffres de l'estimation d'origine.
     Ceux de la fiche ont pu bouger depuis — un lot reloué, des travaux
     ressaisis — et le dossier joint, lui, n'a pas changé. */
  const haiMail = reprise?.hai ?? hai;
  const nvMail = reprise?.nv ?? nv;
  const baseMail = reprise?.hai ?? haiTravaux;
  const mailCorps = [
    `Bonjour${b.proprietaire ? ` ${S(b.proprietaire["Civilité"]) === "Madame" ? "Madame" : "Monsieur"} ${S(b.proprietaire.nom).toUpperCase()}` : ""},`,
    "",
    `Comme convenu, vous trouverez ci-joint l'estimation de votre immeuble sis ${[S(im.adresse_numero_rue), S(im.adresse_rue)].filter(Boolean).join(" ")} à ${S(im.adresse_ville)}.`,
    "",
    `Nous avons estimé l'immeuble à ${euros(haiMail)} HAI (${euros(nvMail)}) soit ${agg.carrez > 0 ? group(baseMail / agg.carrez) : "—"} €/m² et ${baseMail > 0 ? fr1((agg.loyersMaxAn / baseMail) * 100) : "—"} % de rendement brut après travaux et relocation.${travauxTot > 0 ? ` Pour les travaux nous sommes partis sur ${euros(travauxTot)}.` : ""}`,
    "",
    "Ce prix correspond-il à vos attentes ? Seriez-vous disponible demain pour en discuter ?",
    "",
    "Vous en souhaitant bonne réception, je reste à votre disposition pour tout complément.",
    "",
    "Cordialement,",
  ].join("\n");

  return (
    <div className="est">
      {/* Plus de croix de fermeture ici (retour #99) : cet écran n'est pas une
          fenêtre posée sur la fiche, c'est une section de la fiche. On en sort
          en cliquant une autre entrée du rail, comme partout ailleurs. */}
      <div className="est-head">
        <span className="est-titre">
          {reprise
            ? `Envoyer — ${reprise.titre || "estimation"}${reprise.creeLe ? ` du ${dmyfr(reprise.creeLe)}` : ""}`
            : estId ? "Estimation" : "Nouvelle estimation"}
        </span>
        {reprise ? (
          <span className="est-sous">
            Estimation déjà faite : rien n&apos;est recalculé, le dossier joint est celui d&apos;origine.
          </span>
        ) : (
          /* La saisie est mémorisée pour l'onglet : ce bouton est le seul moyen
             de repartir d'une page blanche (#96). */
          <button
            type="button" className="est-reset"
            title="Vider la saisie et repartir de zéro"
            onClick={() => {
              if (!confirm("Effacer la saisie en cours et recommencer l'estimation ?")) return;
              oublier(NS);
              window.location.reload();
            }}
          >Recommencer</button>
        )}
      </div>

      <div className="est-prog"><i style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
      <div className="est-steps">
        {STEPS.map((s, i) => (
          <button
            key={s} type="button"
            className={`est-step ${etatEtape[i]}${i === step ? " on" : ""}`}
            onClick={() => { if (i < 3 && !estId) setStep(i); }}
          >
            <span className="ic">
              {etatEtape[i] === "ok" ? "✓" : etatEtape[i] === "warn" ? "⚠" : "🔒"}
            </span>
            {s}
          </button>
        ))}
      </div>

      <div className="est-body">
        {step === 0 && (
          <>
            <div className="est-h">Données de l&apos;immeuble</div>
            <button type="button" className={`est-perso${perso ? " on" : ""}`} onClick={() => setPerso(!perso)}>
              <span className="sw" /> Personnaliser les informations
            </button>

            <div className="est-sect">Adresse</div>
            <div className="est-l">
              <Champ label="Adresse de l'immeuble"
                valeur={`${[S(im.adresse_numero_rue), S(im.adresse_rue)].filter(Boolean).join(" ")}, ${S(im.adresse_zipcode)} ${S(im.adresse_ville)}, France`} />
              <Etat ok={okAdresse} />
            </div>

            <div className="est-sect">Points d&apos;intérêt</div>
            <div className="est-l">
              <Champ label="Nom des transports" valeur={gareName} editable={perso} onChange={setGareName} />
              <Champ label="Temps" valeur={gareTime ? `${gareTime} min` : ""} editable={perso}
                onChange={(v) => setGareTime(v.replace(/[^\d]/g, ""))} largeur={110} />
              <Etat ok={!!(gareName && gareTime)} />
            </div>
            <div className="est-l">
              <Champ label="Nom des commerces" valeur={comName} editable={perso} onChange={setComName} />
              <Champ label="Temps" valeur={comTime ? `${comTime} min` : ""} editable={perso}
                onChange={(v) => setComTime(v.replace(/[^\d]/g, ""))} largeur={110} />
              <Etat ok={!!(comName && comTime)} />
            </div>

            <div className="est-sect">Charges</div>
            <div className="est-l">
              <Champ label="Taxe foncière" valeur={chTf ? `${group(Number(chTf))} €/an` : "0 €/an"}
                editable={perso} onChange={(v) => setChTf(v.replace(/[^\d]/g, ""))} />
              <Champ label="Autres charges" valeur={chAutres ? `${group(Number(chAutres))} €/an` : "0 €/an"}
                editable={perso} onChange={(v) => setChAutres(v.replace(/[^\d]/g, ""))} />
              <Champ label="Charges totales" valeur={`${group(chargesTot)} €/an`} />
              <Etat ok={okCharges} />
            </div>

            <div className="est-sect">Travaux</div>
            <div className="est-l">
              <Champ label="Travaux sur le bâti" valeur={tvxBati ? `${group(Number(tvxBati))} €` : "0 €"}
                editable={perso} onChange={(v) => setTvxBati(v.replace(/[^\d]/g, ""))} />
              <Champ label="Travaux sur les lots" valeur={tvxLots ? `${group(Number(tvxLots))} €` : "0 €"}
                editable={perso} onChange={(v) => setTvxLots(v.replace(/[^\d]/g, ""))} />
              <Champ label="Travaux totaux" valeur={`${group(travauxTot)} €`} />
              <Ok />
            </div>

            <div className="est-sect">Etat locatif</div>
            {agg.parDest.length === 0 && <div className="fempty">Aucun lot saisi : complétez l&apos;état locatif.</div>}
            {agg.parDest.map((d) => (
              <div className="est-l" key={d.dest}>
                <span className="est-pic"><svg viewBox="0 0 24 24">{IC_DEST[d.dest] ?? IC_DEST.Annexe}</svg></span>
                <Champ label="Lots" valeur={String(d.lots)} largeur={72} />
                <Champ label="Occupés" valeur={`${d.occ} lot${d.occ > 1 ? "s" : ""}`} largeur={130} />
                <Champ label="Surface" valeur={`${Math.round(d.surface)} m²`} largeur={130} />
                <Champ label="Loyer" valeur={`${group(d.loyer)} €/an`} />
                <Champ label="Potentiel" valeur={`${group(d.max)} €/an`} />
                <Etat ok={d.surface > 0} />
              </div>
            ))}
            <Nav />
          </>
        )}

        {step === 1 && (
          <>
            <div className="est-h">
              Données du secteur
              <span className="est-liens">
                {([
                  ["Seloger", `https://www.seloger.com/prix-de-l-immo/vente/${S(im.adresse_zipcode)}.htm`],
                  ["Notaires", `https://www.google.com/search?q=${encodeURIComponent(`site:immobilier.notaires.fr prix ${S(im.adresse_ville)} ${S(im.adresse_zipcode)}`)}`],
                  ["Notaires Paris", "https://www.paris.notaires.fr/fr/immobilier-a-paris/prix-de-limmobilier"],
                  ["LocalCommercial", `https://www.google.com/search?q=${encodeURIComponent(`site:localcommercial.net ${S(im.adresse_ville)} ${S(im.adresse_zipcode)}`)}`],
                ] as const).map(([l, href]) => (
                  <a key={l} href={href} target="_blank" rel="noreferrer">↗ {l}</a>
                ))}
              </span>
            </div>
            <button type="button" className={`est-perso${perso ? " on" : ""}`} onClick={() => setPerso(!perso)}>
              <span className="sw" /> Personnaliser les informations
            </button>

            <div className="est-glob">
              <div><span>Loyer global</span><b>{rLoyer ? `${fr1(rLoyer)} €/m²/mois` : "—"}</b></div>
              <div><span>Prix global</span><b>{rPrix ? `${group(rPrix)} €/m²` : "—"}</b></div>
              <div><span>Rendement global</span><b>{rRenta ? `${fr1(rRenta)} %` : "—"}</b></div>
            </div>

            <div className="est-sect">Loyers et prix du secteur</div>
            {agg.parDest.length === 0 && <div className="fempty">Aucun lot saisi : le secteur ne peut pas être ventilé.</div>}
            {agg.parDest.map((d) => {
              const r = refs[d.dest] ?? { l: "", p: "", r: "" };
              return (
                <div className="est-l" key={d.dest}>
                  <span className="est-pic"><svg viewBox="0 0 24 24">{IC_DEST[d.dest] ?? IC_DEST.Annexe}</svg></span>
                  <Champ label="Loyer de référence" valeur={r.l ? `${r.l.replace(".", ",")} €/m²/mois` : ""} editable={perso}
                    onChange={(v) => majRef(d.dest, "l", v)} />
                  <Champ label="Prix de référence" valeur={r.p ? `${group(Number(r.p))} €/m²` : ""} editable={perso}
                    onChange={(v) => majRef(d.dest, "p", v)} />
                  <Champ label="Rendement de référence" valeur={r.r ? `${r.r.replace(".", ",")} %` : ""} editable={perso}
                    onChange={(v) => majRef(d.dest, "r", v)} />
                  <Etat ok={!!(r.l && r.p)} />
                </div>
              );
            })}
            <Nav />
          </>
        )}

        {step === 2 && (
          <>
            <div className="est-h">Prix</div>
            <div className="est-sect">Selon le secteur</div>
            <div className="est-meths">
              {([
                ["Rendement", rRenta ? `${fr1(rRenta)} %` : "—", pRendement],
                ["Rendement max", rRenta ? `${fr1(rRenta)} %` : "—", pRendementMax],
                ["Prix au m² max", rPrix ? `${group(rPrix)} €/m²` : "—", pM2Max],
                ["Prix au m²", rPrix ? `${group(rPrix)} €/m²` : "—", pM2],
              ] as const).map(([label, src, val]) => {
                const mini = candidates.length > 0 && val === Math.min(...candidates);
                const maxi = candidates.length > 0 && val === Math.max(...candidates);
                return (
                  <button key={label} type="button" className="est-meth"
                    title={`Caler le prix sur ${label}`}
                    onClick={() => val > 0 && setHaiStr(String(Math.round(val / 1000) * 1000))}>
                    <span className="t">{label}</span>
                    <span className="s">{src}</span>
                    <span className={`v${mini ? " bas" : maxi ? " haut" : ""}`}>{euros(val) ?? "—"}</span>
                  </button>
                );
              })}
            </div>

            <div className="est-auto">
              <span>Prix automatique</span>
              <b>{euros(pAuto) ?? "—"}</b>
              <em>Moyenne</em>
            </div>

            <div className="est-sect">Prix estimé</div>
            <div className="est-l">
              <Champ label="Net Vendeur" valeur={`${group(nv)} €`} />
              <span className="est-op">+</span>
              {/* Les honoraires ne se saisissent pas : ils découlent du taux et
                  du prix HAI — d'où le cadenas vert du BO. */}
              <label className="est-ch honos">
                <span>Honoraires</span>
                <svg className="cad" viewBox="0 0 24 24" aria-hidden>
                  <path d="M6 10h12v10H6z" />
                  <path d="M9 10V7a3 3 0 0 1 6 0v3" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
                <input readOnly value={`${group(honos)} €`} />
                <input className="pct" value={`${honosPct} %`} aria-label="Taux d'honoraires"
                  onChange={(e) => setHonosPct(e.target.value.replace(/[^\d.,]/g, ""))} />
              </label>
              <span className="est-op">=</span>
              <label className="est-ch edit hai">
                <span>Prix HAI</span>
                <input value={`${group(hai)} €`}
                  onChange={(e) => setHaiStr(e.target.value.replace(/[^\d]/g, ""))} />
                <button type="button" className="est-reset" title="Revenir au prix automatique"
                  onClick={() => setHaiStr(String(pAuto))}>↺</button>
              </label>
            </div>

            {bornes && (
              <div className="pxbar">
                <input type="range" min={bornes.min} max={bornes.max} step={1000} value={hai}
                  onChange={(e) => setHaiStr(e.target.value)}
                  style={{ ["--p" as string]: `${((hai - bornes.min) / (bornes.max - bornes.min)) * 100}%` }} />
                <div className="pxbar-reps">
                  {([["Rendement", pRendement], ["Rendement max", pRendementMax], ["Prix m²", pM2], ["Prix m² max", pM2Max]] as const)
                    .filter(([, v]) => v > 0)
                    .map(([l, v], i) => (
                      <button key={l} type="button" className={`rep${i % 2 ? " bas" : ""}`}
                        title={`Caler sur ${l} — ${euros(v)}`}
                        style={{ left: `${((v - bornes.min) / (bornes.max - bornes.min)) * 100}%` }}
                        onClick={() => setHaiStr(String(Math.round(v / 1000) * 1000))}>
                        <i /><span>{l}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}

            <div className="est-cmps">
              {([
                ["Actuel", agg.loyersAn, lm2Act, hai],
                ["Potentiel", agg.loyersMaxAn, lm2Max, haiTravaux],
              ] as const).map(([titre2, loyerAn, lm2, prix]) => {
                const eLoyer = ecart(lm2, rLoyer);
                const pm2 = agg.carrez > 0 ? prix / agg.carrez : 0;
                const ePrix = ecart(pm2, rPrix);
                const brut = prix > 0 ? (loyerAn / prix) * 100 : 0;
                const eBrut = ecart(brut, rRenta);
                return (
                  <div className="est-cmp" key={titre2}>
                    <div className="est-cmp-h">{titre2}<i title="Comparaison au secteur">ⓘ</i></div>
                    <div className={`l ${eLoyer >= 0 ? "v" : "r"}`}>
                      <span>Loyer au m²</span><em>{eLoyer >= 0 ? "+" : ""}{eLoyer} %</em><b>{fr1(lm2)} €/m²/mois</b>
                    </div>
                    <div className={`l ${ePrix > 0 ? "r" : "v"}`}>
                      <span>Prix au m²</span><em>{ePrix >= 0 ? "+" : ""}{ePrix} %</em><b>{group(pm2)} €/m²</b>
                    </div>
                    <div className={`l ${eBrut >= 0 ? "v" : "r"}`}>
                      <span>Brut</span><em>{eBrut >= 0 ? "+" : ""}{eBrut} %</em><b>{fr1(brut)} %</b>
                    </div>
                    <div className="l n">
                      <span>Net</span><b>{prix > 0 ? fr1(((loyerAn - chargesTot) / prix) * 100) : "—"} %</b>
                    </div>
                    <div className="l n">
                      <span>Acte en main</span><b>{prix > 0 ? fr1(((loyerAn - chargesTot) / (prix * 1.075)) * 100) : "—"} %</b>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="est-h" style={{ marginTop: 20 }}>Analyse</div>
            <div className="est-sect">Fondamentaux</div>
            <div className="est-fonds">
              {FONDAMENTAUX.map((f) => (
                <div className="est-fond" key={f.cle}>
                  <div className="h">
                    {f.label}
                    <span className="et">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} type="button" className={n <= scores[f.cle] ? "on" : ""}
                          title={f.libelles[n - 1]}
                          onClick={() => setScores({ ...scores, [f.cle]: n })}>★</button>
                      ))}
                    </span>
                  </div>
                  <div className="s">{f.libelles[scores[f.cle] - 1]}</div>
                </div>
              ))}
              <Ok />
            </div>

            <div className="est-sect">Cibles</div>
            <div className="est-cibles">
              <div className="g">
                {CIBLES_EST.map((c) => (
                  <button key={c.valeur} type="button"
                    className={`est-cible${cibles.includes(c.valeur) ? " on" : ""}`}
                    onClick={() => setCibles(cibles.includes(c.valeur) ? cibles.filter((x) => x !== c.valeur) : [...cibles, c.valeur])}>
                    <svg viewBox="0 0 24 24">{c.picto}</svg>
                    {c.label}
                    <i />
                  </button>
                ))}
              </div>
              <Etat ok={cibles.length > 0} />
            </div>

            <div className="est-sect">Loyers pratiqués par rapport au secteur</div>
            <div className="est-loyers">
              <div><span>Loyers actuels</span><b className={ecart(lm2Act, rLoyer) >= 0 ? "v" : "r"}>{ecart(lm2Act, rLoyer) >= 0 ? "+" : ""}{ecart(lm2Act, rLoyer)} %</b></div>
              <div><span>Loyers potentiels</span><b className={ecart(lm2Max, rLoyer) >= 0 ? "v" : "r"}>{ecart(lm2Max, rLoyer) >= 0 ? "+" : ""}{ecart(lm2Max, rLoyer)} %</b></div>
              <span className="est-tiret">—</span>
            </div>

            <div className="est-sect">Analyse</div>
            <div className="est-l" style={{ alignItems: "flex-start" }}>
              <label className="est-ch txt edit" style={{ flex: 1 }}>
                <span>Analyse</span>
                <textarea rows={8} maxLength={900} value={analyse} onChange={(e) => setAnalyse(e.target.value)}
                  placeholder="Analyse du bien, références comparables, justification du prix…" />
              </label>
              <Etat ok={analyse.trim().length > 0} />
            </div>
            <div className="est-cpt">{analyse.length} / 900 caractères</div>

            <div className="est-nav">
              <button className="est-prec" type="button" onClick={() => setStep(1)}>
                <Fleche arriere /> Précédent
              </button>
              <span className="sp" style={{ flex: 1 }} />
              <button className="est-suiv" type="button" onClick={() => setStep(3)}>
                Suivant <Fleche />
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="est-h">Génération</div>
            <div className="est-l">
              <Champ label="Titre de l'estimation" valeur={titre} editable onChange={setTitre} largeur={380} />
            </div>
            <div className="est-l">
              <Champ label="Agent à afficher" valeur={b.agentInitials} largeur={200} />
            </div>
            <div className="warnbox">
              Vous ne pourrez plus modifier les informations après avoir généré l&apos;estimation.
            </div>
            {error && <div className="warnbox" style={{ color: "var(--red)", borderColor: "var(--red)" }}>{error}</div>}
            <div className="est-nav">
              <button className="est-prec" type="button" onClick={() => setStep(2)}>↺ Précédent</button>
              <span className="sp" style={{ flex: 1 }} />
              <button className="est-suiv" type="button" disabled={pending} onClick={generer}>
                + Générer l&apos;estimation PDF
              </button>
            </div>
          </>
        )}

        {step === 4 && estId && (
          <>
            <div className="est-envoi-h">
              <span className={`tag${envoye ? "" : " att"}`}>
                {envoye ? <>✈ Envoyé <b>automatiquement</b></> : <>✈ <b>Prêt à envoyer</b></>}
              </span>
              {envoye && <span className="date">{dmyfr(envoye)} <b>{new Date(envoye).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</b></span>}
            </div>
            <div className="est-ml">
              <span className="lbl">De</span>
              <div className="est-ch plat">
                <b className="est-badge">{b.agentInitials}</b> {S(im.AGENT_nom) || "France Immeuble"}
              </div>
            </div>
            <div className="est-ml">
              <span className="lbl">À</span>
              <div className="est-ch plat">
                {/* Modifiable : le propriétaire est le point de départ, pas une
                    fatalité — gestionnaire, conseil, indivisaire qui centralise
                    (retour #132). */}
                <AdressesInput valeurs={destinataires} onChange={setDest}
                  placeholder={b.proprietaire ? "Ajouter ou remplacer le destinataire" : "Adresse du destinataire"} />
              </div>
            </div>
            {b.proprietaire && (
              <div className="est-ml">
                <span className="lbl" />
                <div className="est-ch plat est-dest-nb">
                  Propriétaire de la fiche : {S(b.proprietaire["prénom"])}{" "}
                  <b>{S(b.proprietaire.nom).toUpperCase()}</b>
                  {S(b.proprietaire.email) && <i>{S(b.proprietaire.email)}</i>}
                  {S(b.proprietaire.email) && !destinataires.includes(S(b.proprietaire.email)) && (
                    <button type="button" className="fadd"
                      onClick={() => setDest([...destinataires, S(b.proprietaire!.email)])}>
                      Le remettre en destinataire
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="est-ml">
              <span className="lbl">Cc</span>
              <div className="est-ch plat">
                <AdressesInput valeurs={cc} onChange={setCc}
                  placeholder="Ajouter une adresse en copie" />
              </div>
            </div>
            <div className="est-ml">
              <span className="lbl">Cci</span>
              <div className="est-ch plat">
                <AdressesInput valeurs={cci} onChange={setCci}
                  placeholder="Copie cachée — le destinataire ne la voit pas" />
              </div>
            </div>
            <div className="est-ml">
              <span className="lbl">PJ</span>
              <div className="est-ch plat est-pjplus">
                {pdf && dossierJoint && (
                  <span className="est-pjf pdf">
                    <a href={pdf.url} target="_blank" rel="noreferrer" title="Ouvrir le PDF">
                      <svg viewBox="0 0 24 24" aria-hidden>
                        <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z" />
                        <path d="M14 3v4h4" />
                      </svg>
                      Estimation.pdf
                    </a>
                    <i>{pdf.ko} ko</i>
                    <button type="button" title="Retirer du message" aria-label="Retirer du message"
                      onClick={() => setDossierJoint(false)}>✕</button>
                  </span>
                )}
                {pdf && !dossierJoint && (
                  <button type="button" className="fadd" onClick={() => setDossierJoint(true)}>
                    ↩ Remettre le dossier d&apos;estimation
                  </button>
                )}
                {!pdf && (
                  <span>{pdfKo ? "PDF non fabriqué — dossier à imprimer" : "génération en cours…"}</span>
                )}
                <Link className="fadd" href={`/bien/${immeubleId}/estimation/${estId}/imprimer`} target="_blank">
                  Voir le dossier
                </Link>
              </div>
            </div>
            {/* Joindre en plus : les documents déjà rangés dans le coffre du
                bien, et des fichiers pris sur le poste. */}
            <div className="est-ml">
              <span className="lbl" />
              <div className="est-ch plat est-pjplus">
                {autresDocs.length > 0 && (
                  <details>
                    <summary>+ Joindre un document du bien ({autresDocs.length})</summary>
                    <div className="est-pjlist">
                      {autresDocs.map((d) => {
                        const id = String(d._id);
                        return (
                          <label key={id}>
                            <input type="checkbox" checked={pjDocs.includes(id)}
                              onChange={(e) => setPjDocs((v) =>
                                e.target.checked ? [...v, id] : v.filter((x) => x !== id))} />
                            {S(d.name) || S(d.file_name) || "Document"}
                          </label>
                        );
                      })}
                    </div>
                  </details>
                )}
                <label className="fadd">
                  + Ajouter un fichier
                  <input type="file" multiple hidden
                    onChange={(e) => setPjFichiers((v) => [...v, ...Array.from(e.target.files ?? [])])} />
                </label>
                {pjFichiers.map((f, i) => (
                  <span className="est-pjf" key={`${f.name}-${i}`}>
                    {f.name}
                    <button type="button" title="Retirer" aria-label="Retirer"
                      onClick={() => setPjFichiers((v) => v.filter((_, j) => j !== i))}>✕</button>
                  </span>
                ))}
              </div>
            </div>
            {pdfKo && (
              <div className="warnbox">
                Le PDF n&apos;a pas pu être fabriqué ({pdfKo}). Le dossier reste consultable et
                imprimable : ouvrez-le puis « Enregistrer en PDF ».
              </div>
            )}
            <div className="est-l">
              <Champ label="Objet" valeur={mailObjet} />
              <Copier valeur={mailObjet} titre="Copier l'objet" petit>Copier</Copier>
            </div>
            <label className="est-ch txt">
              <span>Message</span>
              <textarea rows={14} readOnly value={`${mailCorps}\n\n${b.agentInitials} — France Immeuble`} />
            </label>
            <div className="est-l">
              <Copier valeur={`${mailCorps}\n\n${b.agentInitials} — France Immeuble`}
                titre="Copier le message" petit>Copier le message</Copier>
            </div>
            <div className="est-note">
              {envoiActif
                ? "L'app envoie depuis la boîte France Immeuble, avec l'agent en « Répondre à » : la réponse du propriétaire arrive directement dans sa boîte."
                : "L'envoi reste manuel : l'app prépare, l'agent envoie depuis sa boîte."}
            </div>
            {envoiKo && <div className="warnbox">Envoi impossible : {envoiKo}</div>}
            {marqueKo && <div className="warnbox">Impossible d&apos;enregistrer le statut : {marqueKo}</div>}
            {marque && <div className="est-fait">✓ {marque}</div>}
            {envoye && (
              <div className="est-fait">
                ✓ Envoyée le {dmyfr(envoye)} à {destinataires.join(", ") || "—"}.
                Le bouton reste actif : on peut la renvoyer, en changeant le destinataire ou en
                ajoutant quelqu&apos;un en copie.
              </div>
            )}
            <div className="est-nav">
              {destinataires.length > 0 && (
                envoiActif ? (
                  /* Renvoyer reste possible : une estimation se renvoie souvent
                     — au conseil, au deuxième indivisaire (retour #132). */
                  <button className="est-suiv" type="button"
                    disabled={pending || !pdf}
                    title={pdf ? undefined : "Le dossier PDF doit être fabriqué avant l'envoi"}
                    onClick={envoyer}>
                    {envoye ? "✈ Renvoyer" : "✈ Envoyer au propriétaire"}
                  </button>
                ) : (
                  <a className="est-suiv" style={{ textDecoration: "none" }}
                    href={`mailto:${destinataires.join(",")}?subject=${encodeURIComponent(mailObjet)}&body=${encodeURIComponent(mailCorps)}`}>
                    ✈ Préparer l&apos;e-mail
                  </a>
                )
              )}
              <span className="sp" style={{ flex: 1 }} />
              <button className="est-suiv" type="button" disabled={pending || !!marque}
                onClick={() => marquer("3 - Envoyée")}>
                {marque ? "✓ Enregistré" : "Marquer envoyée"}
              </button>
              <button className="est-prec" type="button" disabled={pending || !!marque}
                onClick={() => marquer("4 - Interne")}>
                Estimation interne
              </button>
            </div>
          </>
        )}
      </div>

      <HistoriqueEstimations b={b} immeubleId={immeubleId} />
    </div>
  );
}

/** Historique des estimations, bandeau sticky maigre au bas de la page : la
 *  dernière est toujours visible, « Voir plus » déplie les précédentes.
 *  Chaque estimation est figée à sa date — son PDF montre les chiffres sur
 *  lesquels elle s'est basée à l'époque. */
function HistoriqueEstimations({ b, immeubleId }: { b: BienData; immeubleId: string }) {
  const [plus, setPlus] = useState(false);
  const ests = [...b.estimations].sort((a, z) =>
    String(z["Created Date"] ?? "").localeCompare(String(a["Created Date"] ?? "")),
  );
  if (ests.length === 0) return null;

  const Ligne = ({ e, derniere }: { e: Record<string, unknown>; derniere?: boolean }) => (
    <div className={`hest-l${derniere ? " last" : ""}`}>
      {derniere && <b className="tag">Dernière estimation</b>}
      <span className="t">{S(e.titre) || "Estimation"}</span>
      <span className="d">figée au {dmyfr(e["Created Date"])}</span>
      <span className="p">{euros(num(e.prix_hai)) ?? "—"}</span>
      <span className={String(e.Statut ?? "").startsWith("3") ? "badge-g" : "badge-o"}>
        {S(e.Statut).replace(/^\d+ - /, "") || "?"}
      </span>
      <Link className="fadd" href={`/bien/${immeubleId}/estimation/${S(e._id)}/imprimer`} target="_blank">PDF</Link>
    </div>
  );

  return (
    <div className="hest">
      <Ligne e={ests[0]} derniere />
      {ests.length > 1 && (
        <button type="button" className="hest-plus" onClick={() => setPlus(!plus)}>
          {plus ? "Réduire" : `Voir plus (${ests.length - 1})`}
        </button>
      )}
      {plus && ests.slice(1).map((e) => <Ligne key={S(e._id)} e={e} />)}
    </div>
  );
}
