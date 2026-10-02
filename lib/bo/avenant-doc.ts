// L'avenant de prix au mandat — moteur de rédaction.
//
// Même partage des rôles que le mandat : ce module produit l'OBJET du
// document, `components/avenant-doc.tsx` le met en page avec les briques du
// mandat (en-tête, pied, registre), pour que les deux actes se ressemblent
// jusque dans la marge.
//
// Un avenant ne touche qu'au prix. Il rappelle les parties et le bien tels
// qu'ils sont au mandat, écrit l'ancien prix et le nouveau, et dit que tout
// le reste — durée, exclusivité, irrévocabilité, clause pénale — demeure. La
// loi Hoguet veut que la modification d'un mandat soit écrite et inscrite au
// registre en marge du numéro d'origine : le document le mentionne.

import { euroEnLettres } from "@/lib/nombre-lettres";
import { adresseImmeuble, lireAvenants, type Mandant, type Prix } from "@/lib/mandat";
import {
  dateCourte, dateLongue, eur, eurCourt, pct, redigerMandatBloc, regimeDe,
  type DocMandant, type EntreeMandat, type LigneRegistre, type Trous,
} from "@/lib/bo/mandat-doc";

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const A_COMPLETER = "……………………";

export type DocAvenant = {
  numeroMandat: string;
  n: number;
  refEntete: string;
  eyebrow: string;
  titre: string;
  sousTitre: string;
  heroMeta: string;
  mandants: DocMandant[];
  contactNegociateur: string;
  objet: string[];
  prixParagraphe: string;
  prixVignettes: { nv: string; honos: string; hai: string; noteHonos: string; noteHai: string };
  comparaison: { k: string; avant: string; apres: string }[];
  prixRegistre: LigneRegistre[];
  suite: string[];
  registreMention: string;
  signatureIntro: string;
  signataires: { role: string; nom: string; qualite: string }[];
  lieu: string;
};

const ligne = (p: Prix) => ({
  hai: p.hai !== undefined ? eur(p.hai) : A_COMPLETER,
  nv: p.nv !== undefined ? eur(p.nv) : A_COMPLETER,
  honos: p.honos !== undefined ? eur(p.honos) : A_COMPLETER,
  taux: p.taux !== undefined ? pct(p.taux) : A_COMPLETER,
});

export function redigerAvenantPrix(
  e: EntreeMandat & { mandants: Mandant[] },
  n: number,
): { doc: DocAvenant; trous: Trous } {
  const { m } = e;
  /* Les parties, le bien et le contact du négociateur sont ceux du mandat :
     on les prend au moteur du mandat, pas à une seconde rédaction. */
  const base = redigerMandatBloc(e);
  const trous: Trous = [];
  const avenant = lireAvenants(m).find((a) => a.n === n);
  if (!avenant) trous.push(`l'avenant n° ${n}`);

  const numero = S(m.numero) || A_COMPLETER;
  if (!S(m.numero)) trous.push("le numéro d'inscription au registre des mandats");
  const signature = m.date_signature ? new Date(S(m.date_signature)) : undefined;
  if (!signature) trous.push("la date de signature du mandat");
  const regime = regimeDe(m.Type_exclu);
  const regimeTxt = regime === "exclusif" ? "exclusif" : regime === "semi_exclusif" ? "semi-exclusif" : "simple";

  const avant = avenant?.avant ?? {};
  const apres = avenant?.apres ?? {};
  if (apres.nv === undefined || apres.hai === undefined) trous.push("le nouveau prix");
  const effet = avenant?.dateEffet ? new Date(avenant.dateEffet) : new Date();
  const chargeVendeur = (avenant?.charge || S(m.Charge_hono)) === "Vendeur";
  const aCharge = chargeVendeur ? "à la charge du vendeur" : "à la charge de l'acquéreur";
  const hai = apres.hai ?? 0, nv = apres.nv ?? 0, honos = apres.honos ?? Math.max(0, hai - nv);
  const taux = apres.taux ?? (nv > 0 ? Math.round((honos / nv) * 10000) / 100 : 0);
  const tva = Math.round(honos / 6 * 100) / 100;

  const sens = avant.hai !== undefined && apres.hai !== undefined
    ? apres.hai < avant.hai ? "baisse" : apres.hai > avant.hai ? "hausse" : "modification"
    : "modification";

  const adresse = adresseImmeuble(e.im);
  const objet: string[] = [
    `Le présent avenant a pour objet de modifier le prix de vente stipulé à l'article ${base.doc.art.bien} du mandat de vente ${regimeTxt} `
      + `<b>n° ${numero}</b>, signé le <b>${signature ? dateLongue(signature) : A_COMPLETER}</b>, portant sur l'immeuble sis <b>${adresse}</b>.`,
    avenant?.motif
      ? `Motif de la ${sens} : ${avenant.motif}.`
      : `Les parties conviennent d'une ${sens} du prix, sans autre modification des conditions du mandat.`,
  ];

  const prixParagraphe =
    `À compter du <b>${dateLongue(effet)}</b>, le prix de vente HAI, honoraires d'agence inclus, est fixé à la somme de <b>${eur(hai)}</b> (${euroEnLettres(hai)}), `
    + `se décomposant en un prix net vendeur de <b>${eur(nv)}</b> (${euroEnLettres(nv)}) `
    + `et des honoraires de <b>${eur(honos)}</b> (${euroEnLettres(honos)}) toutes taxes comprises, `
    + `soit <b>${pct(taux)} TTC du prix net vendeur</b>, dont ${eur(tva)} de taxe sur la valeur ajoutée, <b>${aCharge}</b>. `
    + "Ce prix se substitue, pour l'avenir, à celui stipulé au mandat.";

  const av = ligne(avant), ap = ligne(apres);
  const comparaison = [
    { k: "Prix net vendeur", avant: av.nv, apres: ap.nv },
    { k: "Honoraires du Mandataire TTC", avant: `${av.honos} (${av.taux})`, apres: `${ap.honos} (${ap.taux})` },
    { k: "Prix de vente HAI", avant: av.hai, apres: ap.hai },
  ];
  const prixRegistre: LigneRegistre[] = [
    { k: "Prix net vendeur", note: "Somme revenant au Mandant, hors honoraires", v: eur(nv) },
    { k: "Honoraires du Mandataire", note: `Soit ${pct(taux)} TTC du prix net vendeur, dont ${eur(tva)} de TVA · ${aCharge}`, v: eur(honos) },
    { k: "Prix de vente HAI", note: "Honoraires d'agence inclus · somme payée par l'acquéreur", v: eur(hai) },
  ];

  const suite = [
    "Toutes les autres clauses et conditions du mandat demeurent inchangées et continuent de produire leur plein effet : "
      + "sa durée, sa date d'échéance, son régime d'exclusivité, sa période d'irrévocabilité, la clause pénale, les obligations "
      + "des parties et les pouvoirs conférés au Mandataire. Le présent avenant ne proroge ni ne renouvelle le mandat.",
    "Les honoraires modifiés ci-dessus s'appliquent à toute vente conclue avec un acquéreur présenté par le Mandataire à compter "
      + "de la date d'effet, y compris lorsque cet acquéreur a été présenté avant celle-ci. Ils restent payables au comptant à la "
      + "signature de l'acte authentique, par prélèvement sur le prix entre les mains du notaire.",
    "Le présent avenant fait partie intégrante du mandat. En cas de contradiction, ses stipulations prévalent sur celles du mandat "
      + "pour les seuls points qu'il modifie.",
  ];

  const mandants = base.doc.mandants;
  return {
    trous: [...new Set([...trous, ...base.trous.filter((t) => !/prix net vendeur|numéro d'inscription/.test(t))])],
    doc: {
      numeroMandat: numero,
      n,
      refEntete: `Avenant n° ${n} au mandat n° ${numero} · France Immeuble`,
      eyebrow: `Mandat n° ${numero} · Registre des mandats · Avenant n° ${n}`,
      titre: `Avenant n° ${n} — ${sens === "baisse" ? "baisse" : sens === "hausse" ? "hausse" : "modification"} du prix`,
      sousTitre: `Au mandat de vente ${regimeTxt} n° ${numero}${signature ? ` signé le ${dateLongue(signature)}` : ""}`,
      heroMeta: ["Immeuble de rapport", adresse, `Prise d'effet le ${dateCourte(effet)}`].join(" · "),
      mandants,
      contactNegociateur: base.doc.contactNegociateur,
      objet,
      prixParagraphe,
      prixVignettes: {
        nv: eurCourt(nv), honos: eurCourt(honos), hai: eurCourt(hai),
        noteHonos: `${pct(taux)} TTC du net vendeur`,
        noteHai: "Honoraires d'agence inclus · payé par l'acquéreur",
      },
      comparaison,
      prixRegistre,
      suite,
      registreMention:
        `Le présent avenant est inscrit au registre des mandats de France Immeuble S.A.S. en marge du mandat n° ${numero}, `
        + `sous la référence ${numero}-A${n}. Un exemplaire est remis au Mandant le jour de sa signature.`,
      signatureIntro:
        `Le présent avenant est signé électroniquement le ${dateLongue(new Date())}, chaque partie en recevant un exemplaire.`,
      signataires: base.doc.signataires,
      lieu: "Paris",
    },
  };
}
