/* Le dossier complet de vente — ce que le document a besoin de savoir.
 *
 * Retour #184 : « pour le dossier complet c'est une catastrophe, il n'y a rien
 * du tout. Je te mets le PDF de ce qu'on fait d'habitude, essaie de te caler à
 * 100 % dessus. Toutes les infos sont alimentées par le BO. »
 *
 * Le PDF de référence (Drancy, 5 rue Marcelin Berthelot, v3) fait huit pages :
 * couverture chiffrée, photos, emplacement, état technique, état locatif, état
 * financier, conditions de la vente, dos. Ce module rassemble tout ce qu'elles
 * affichent ; le composant ne fait que mettre en forme.
 *
 * DEUX SOURCES, ET C'EST VOULU. Le PRIX vient du dossier enregistré : il est
 * figé le jour de la génération, c'est lui qu'on a envoyé. Tout le reste vient
 * de la fiche, donc de l'état du bien aujourd'hui — un lot reloué depuis doit
 * apparaître. C'est la règle inverse de l'estimation, qui fige tout, et elle
 * est justifiée : une estimation est une photo, un dossier de vente est une
 * offre qu'on tient à jour.
 */

import type { BienData } from "@/lib/bubble/server";
import { rendements } from "./rendements";
import { photoUrl } from "./dossier";
import { estFacadeRue } from "./facade";

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const N = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Demande une photo du relais à la largeur où elle sera imprimée (#217). */
const taille = (u: string | undefined, largeur: number) =>
  !u || !u.startsWith("/api/photo") || u.includes("w=") ? u : `${u}&w=${largeur}`;

/** Ordre d'affichage des destinations dans les tableaux du dossier. */
const ORDRE_DEST = ["Logement", "Commerce", "Bureau", "Logistique", "Parking", "Cave", "Annexe"];

const PLURIEL: Record<string, [string, string]> = {
  Logement: ["logement", "logements"],
  Commerce: ["commerce", "commerces"],
  Bureau: ["bureau", "bureaux"],
  Logistique: ["entrepôt", "entrepôts"],
  Parking: ["parking", "parkings"],
  Cave: ["cave", "caves"],
  Annexe: ["annexe", "annexes"],
};

/** Les six points d'intérêt du BO, dans l'ordre de la page Emplacement. */
const POI = [
  { cle: "gare", label: "Trains" },
  { cle: "bus", label: "Bus" },
  { cle: "route", label: "Axes routiers" },
  { cle: "school", label: "Ecoles" },
  { cle: "com", label: "Commerces" },
  { cle: "autre", label: "Autres" },
] as const;

export type DossierVente = ReturnType<typeof construireDossierVente>;

export function construireDossierVente(
  b: BienData,
  d: Record<string, unknown>,
  agent: { nom: string; email?: string; tel?: string; photo?: string } | null,
) {
  const im = b.im;
  const lots = b.lots;

  /* --- Le prix, figé dans le dossier --- */
  const hai = N(d.prix_hai) ?? N(im.prix_hai) ?? 0;
  const taux = N(d["honos_taux_%"]) ?? N(im.prix_Charge_honos) ?? 5;
  const nv = hai > 0 ? Math.round(hai / (1 + taux / 100)) : 0;
  const honos = hai - nv;

  /* --- L'état locatif d'aujourd'hui --- */
  const surface = lots.reduce((s, l) => s + (N(l.surface_carrez) ?? 0), 0);
  const surfaceSol = lots.reduce((s, l) => s + (N(l.surface_sol) ?? 0), 0);
  const loues = lots.filter((l) => (N(l.loyer) ?? 0) > 0);
  const surfaceOcc = loues.reduce((s, l) => s + (N(l.surface_carrez) ?? 0), 0);
  const loyers = lots.reduce((s, l) => s + (N(l.loyer) ?? 0), 0) * 12;
  const loyersMax = lots.reduce((s, l) => s + (N(l.loyer_max) ?? N(l.loyer) ?? 0), 0) * 12;
  const travaux = N(im.fin_travaux) ?? 0;

  /* Occupation « carrez » : c'est la surface qui compte, pas le nombre de
     lots — sept parkings vides ne valent pas sept logements vides. */
  const occupation = surface > 0
    ? Math.round((surfaceOcc / surface) * 100)
    : lots.length > 0 ? Math.round((loues.length / lots.length) * 100) : 0;

  /* --- Charges : récupérables et non récupérables, ligne par ligne --- */
  const charges = b.charges.map((c) => ({
    type: S(c.Type_charge) || "Charge",
    total: N(c.total_an),
    recup: N(c.recup_an),
    nonRecup: N(c.non_recup_an),
  }));
  const chargesTot = {
    total: charges.reduce((s, c) => s + (c.total ?? 0), 0),
    recup: charges.reduce((s, c) => s + (c.recup ?? 0), 0),
    nonRecup: charges.reduce((s, c) => s + (c.nonRecup ?? 0), 0),
  };

  /* --- Revenus par destination, avec leur taux d'occupation --- */
  const dests = ORDRE_DEST.filter((x) => lots.some((l) => S(l.Destination) === x));
  const revenus = dests.map((dest) => {
    const ls = lots.filter((l) => S(l.Destination) === dest);
    const oc = ls.filter((l) => (N(l.loyer) ?? 0) > 0);
    const surf = ls.reduce((s, l) => s + (N(l.surface_carrez) ?? 0), 0);
    const surfOc = oc.reduce((s, l) => s + (N(l.surface_carrez) ?? 0), 0);
    return {
      dest,
      label: PLURIEL[dest]?.[1] ?? dest,
      actuel: ls.reduce((s, l) => s + (N(l.loyer) ?? 0), 0) * 12,
      potentiel: ls.reduce((s, l) => s + (N(l.loyer_max) ?? N(l.loyer) ?? 0), 0) * 12,
      /* Sur les lots vendus au lot (parkings, caves), l'occupation se compte
         en lots : ils n'ont pas de surface Carrez. */
      occupation: surf > 0
        ? Math.round((surfOc / surf) * 100)
        : ls.length > 0 ? Math.round((oc.length / ls.length) * 100) : 0,
    };
  });

  const r = rendements(hai, {
    loyers, loyersMax, charges: chargesTot.nonRecup, travaux,
    surface, surfaceOccupee: surfaceOcc,
  });

  /* --- Frais de notaire : 7,5 % dans l'ancien, comme le BO --- */
  const notaire = Math.round(hai * 0.075);

  return {
    version: S(d.version),
    date: S(d.date ?? d["Created Date"]).slice(0, 10).split("-").reverse().join("/"),
    heure: S(d.date ?? d["Created Date"]).slice(11, 16).replace(":", "h"),

    agence: {
      nom: "Agence de Paris",
      tel: "01.72.87.52.22",
      email: "agence.paris@france-immeuble.fr",
      site: "www.france-immeuble.fr",
    },
    agent: {
      nom: agent?.nom || "France Immeuble",
      email: agent?.email,
      tel: agent?.tel,
      photo: photoUrl(S(agent?.photo)),
    },

    adresse: [
      [S(im.adresse_numero_rue), S(im.adresse_rue)].filter(Boolean).join(" "),
      `${S(im.adresse_zipcode)} ${S(im.adresse_ville)}`.trim(),
    ].filter(Boolean).join(", "),
    ville: S(im.adresse_ville),
    cp: S(im.adresse_zipcode),

    /* La photo principale ouvre le dossier ; les autres suivent dans l'ordre
       du BO, « de gauche à droite » (#184). Les captures de carte et de
       cadastre n'en sont pas (voir #179).

       La façade Street View non plus : elle sert de repère dans l'outil, mais
       Google interdit de la réutiliser comme photo d'un bien dans un document
       commercial. Un dossier sans couverture vaut mieux qu'un dossier envoyé
       au vendeur avec le filigrane Google dessus. */
    /* Retour #217 : chaque photo est demandée à la taille qu'elle occupe
       réellement sur la page, pas en 2200 px de côté. La couverture couvre
       194 mm, les planches 92 mm ; à 200 points par pouce, cela fait 1520 et
       730 pixels. Le PDF n'y recompresse rien, c'est donc ici que se joue son
       poids. */
    photoPrincipale: taille(
      b.photos.find((p) => p.type === "Principale")?.urlPleine
        ?? b.photos.find((p) => p.type === "Principale")?.url
        ?? (estFacadeRue(im.photo_main_compressed) ? "" : photoUrl(S(im.photo_main_compressed))),
      1520,
    ),
    photos: b.photos
      .filter((p) => p.type !== "Principale" && !["Cadastre", "Carte", "Vue de rue"].includes(S(p.type)))
      .sort((x, y) => x.ordre - y.ordre)
      .map((p) => taille(p.urlPleine ?? p.url, 760))
      .filter((u): u is string => !!u),

    /* Page 1 — les chiffres de couverture */
    cibles: Array.isArray(im.Cibles) ? (im.Cibles as unknown[]).map(String) : [],
    /* Retour #244 : « normalement on ne peut pas en avoir plus que 4
       (commerces, habitation, bureaux, entrepôt), le reste c'est des annexes
       qui n'ont pas leur place ici. » Les caves, parkings et annexes se
       comptent dans l'état locatif, pas en couverture : c'est la nature du bien
       qu'on y annonce, pas son inventaire. */
    compo: dests
      .filter((dest) => !["Parking", "Cave", "Annexe"].includes(dest))
      .map((dest) => {
        const n = lots.filter((l) => S(l.Destination) === dest).length;
        const [un, plusieurs] = PLURIEL[dest] ?? [dest.toLowerCase(), `${dest.toLowerCase()}s`];
        return { dest, texte: `${n} ${n > 1 ? plusieurs : un}` };
      }),
    surface, surfaceSol, surfaceOcc, occupation,
    prix: { hai, nv, honos, taux, notaire, travaux, m2: surface > 0 ? Math.round(hai / surface) : 0 },
    rendement: r,

    /* Page 3 — emplacement -------------------------------------------------
       Retour #221 : « je vois pas les 2 maps de Google Map qui devraient être
       affichées. Maintenant on va pas prendre des photos des maps si elles
       s'affichent correctement avec Google Map […] du coup pas besoin
       d'ajouter de photo, on reprend la capture que ça fait directement dans
       le dossier. »

       On dessinait la carte depuis une PHOTO capturée à l'avance et rangée
       dans le coffre — une étape de plus, qui échouait en silence dès qu'elle
       n'avait pas été faite, et laissait un cadre gris. Le dossier demande
       maintenant ses deux cartes au relais, comme l'écran Emplacement : la vue
       région et la vue de quartier, calculées depuis les coordonnées du bien.
       La clé Google reste côté serveur, le relais s'en charge.

       Retour #233 : « je veux juste les aperçus de Google Map. » La capture de
       repli disparaît complètement — une fiche sans coordonnées n'aura pas de
       carte, ce qui se voit et se corrige, plutôt qu'une image périmée qui ne
       se voit pas. */
    cartes: (() => {
      /* Sans clé Google, le relais répond 404 et les deux cadres resteraient
         vides : on garde alors la capture d'avant, qui existe peut-être. Cette
         fonction ne tourne que côté serveur — la clé n'atteint jamais la page,
         on ne fait que constater sa présence. */
      if (!process.env.GOOGLE_MAPS_SERVER_KEY && !process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY) return null;
      const g = b.adr?.geo as { lat?: number; lng?: number } | undefined;
      const lat = N(g?.lat), lon = N(g?.lng);
      if (lat === undefined || lon === undefined) return null;
      const m = (z: number, pin: string, w: number, h: number) =>
        `/api/staticmap?lat=${lat}&lon=${lon}&z=${z}&w=${w}&h=${h}&pin=${pin}`;
      return { region: m(5, "petit", 400, 460), quartier: m(15, "1", 560, 460) };
    })(),
    poi: POI.map((p) => ({
      label: p.label,
      cle: p.cle,
      nom: S(im[`emp_${p.cle}_name`]),
      minutes: N(im[`emp_${p.cle}_time`]),
      /* Les six lignes sont toujours là, même vides : le document de
         référence les affiche toutes, et une ligne absente se lit comme une
         information oubliée. */
      moyen: S(im[`emp_${p.cle}_moyen`]) || "à pied",
    })),
    ville_stats: {
      habitants: N(im.emp_population),
      revenus: N(im.emp_revenus),
      tension: S(im.emp_tension_locative),
      prix: N(b.secteur?.["0 - prix"]),
    },

    /* Page 4 — état technique */
    annee: N(im.year_constru),
    composants: b.composants.map((c) => ({
      type: S(c.Type_composant),
      materiau: S(c["Type_matériau"]),
      annee: N(c.renov_year) ?? N(c.year),
      etat: S(c.Etat),
    })),
    etatGeneral: S(im.Etat),
    /* Retour #222 : « il manque les titres des colonnes du tableau des travaux
       à prévoir — objet des travaux, description et montant au minimum, si y a
       pas urgence et devis. » L'objet et la description étaient jusqu'ici
       repliés l'un sur l'autre en une seule colonne sans en-tête : le lecteur
       voyait deux colonnes muettes. */
    travauxListe: b.travaux.map((t) => ({
      objet: S(t.Type_travaux) || "Travaux",
      description: S(t.description) || S(t.commentaire),
      urgence: S(t.Urgence),
      montant: N(t.montant),
    })),
    terrain: {
      parcelle: b.parcelles.map((p) => S(p.ref_cadastre)).filter(Boolean).join(", "),
      superficie: N(im.ter_surface),
      facade: N(im.ter_facade),
      image: photoUrl(S(im.ter_parcelle_img)),
    },
    plu: {
      zone: [S(im.plu_zone), S(im.plu_Type_zone) ? `(${S(im.plu_Type_zone)})` : ""].filter(Boolean).join(" "),
      emprise: N(im.plu_emprise),
      hauteur: N(im.plu_hauteur),
    },

    /* Page 5 — état locatif, lot par lot */
    lots: lots.map((l, i) => ({
      n: N(l.numero) ?? i + 1,
      dest: S(l.Destination),
      type: S(l.Type_lot) || S(l.Destination),
      carrez: N(l.surface_carrez),
      sol: N(l.surface_sol),
      dpe: S(l.Type_dpe),
      etat: S(l.Etat),
      /* Même déduction que dans le tableau des lots (#171) : un lot qui
         encaisse un loyer n'est pas « Vide », même si le type de bail n'a pas
         encore été choisi. Le dossier ne doit pas annoncer un lot libre à un
         acheteur alors qu'il est loué. */
      bail: (N(l.loyer) ?? 0) > 0 && ["", "Vide"].includes(S(l.Type_bail)) ? "n.c." : S(l.Type_bail),
      entree: bailDebut(b, String(l._id)),
      loyer: N(l.loyer),
      potentiel: (N(l.loyer_max) ?? N(l.loyer) ?? 0) * 12,
    })),
    total: {
      carrez: surface, sol: surfaceSol,
      loyerMois: Math.round(loyers / 12),
      potentiel: loyersMax,
    },

    /* Page 6 — état financier */
    revenus, revenusTot: { actuel: loyers, potentiel: loyersMax, occupation },
    charges, chargesTot,

    /* Page 7 — conditions de la vente */
    /* Le profil se saisit sur la fiche du PROPRIÉTAIRE, à côté du motif de
       vente qui, lui, appartient à l'immeuble : on va le chercher là où il est
       réellement écrit. `profil_vendeur` reste lu en secours pour les fiches
       de l'ancien BO. */
    vendeur: {
      profil: S(b.proprietaire?.profil) || S(im.profil_vendeur),
      motif: S(im.Motif_vente),
    },
    conditions: {
      financement: S(im.condition_financement),
      permis: S(im.condition_pc),
    },
    avis: S(im.descriptif),
  };
}

/** Date d'entrée du bail en cours sur ce lot, au format « 01/24 ». */
function bailDebut(b: BienData, lotId: string): string {
  const bail = b.baux.find((x) => Array.isArray(x.LOTs) && (x.LOTs as string[]).includes(lotId));
  const d = S(bail?.date_start);
  if (!d) return "";
  return `${d.slice(5, 7)}/${d.slice(2, 4)}`;
}
