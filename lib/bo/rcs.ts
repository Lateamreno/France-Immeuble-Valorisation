// RCS par MailingVox — la carte « un immeuble correspondant à votre recherche ».
//
// MAV (02/11) : « je veux que tu fasses un essai de rcs avec l'immeuble paris
// 18 sur le BO, tu l'envoies à moi-même ». Le seul envoi RCS prévu pour
// l'instant (CLAUDE.md §7.5) : la photo principale, le type, la ville avec son
// département, la surface, la renta potentielle, le prix HAI, et trois
// boutons — Intéressé / Pas intéressé / Télécharger le dossier.
//
// Deux appels chez MailingVox : on crée d'abord le MODÈLE de carte (photo
// jointe en multipart, `/rcs/model/create`), qui rend un identifiant de média ;
// puis on envoie ce média (`/envoyer/rcs`, type `single`) avec un SMS de repli
// pour les téléphones qui ne lisent pas le RCS.
//
// Même doctrine que les SMS (§7.1) : rien ne part sans un clic humain.
// Code serveur seulement : la clé ne quitte jamais le serveur, et ce module
// n'est PAS un module « use server » — ses fonctions ne sont pas appelables
// depuis le navigateur, seules les actions qui les enveloppent le sont.
import sharp from "sharp";
import { villeArrondissement } from "@/lib/ville";
import { departement } from "@/lib/diffusion";
import { etatLien, lienDuDossier } from "./lien-dossier";
import { chiffresDossier } from "./chiffres-dossier";
import { NUMERO_STOP } from "./sms";

const BASE = "https://v3.mailingvox.com/api";
const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const cle = () => process.env.MAILINGVOX_KEY;

/* Le texte validé par MAV le 02/11, mot pour mot. La signature est celle de
   l'agent en charge du bien (à défaut, MAV : c'est lui qui l'a écrit). */
const INTRO =
  "Bonjour,<br>Vous trouverez ci-après un immeuble correspondant à votre recherche. "
  + "Cliquez sur Intéressé pour être rappelé ou sur Pas intéressé pour ne plus être relancé sur ce dossier.<br>"
  + "Le dossier complet est téléchargeable en cliquant sur le lien correspondant.";

/** Les libellés des deux boutons de réponse : le webhook les reconnaît. */
export const BOUTON_OUI = "Intéressé";
export const BOUTON_NON = "Pas intéressé";

type Doc = Record<string, unknown>;
const S = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const N = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const fr = (n: number, d = 0) => n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/ | /g, " ");

async function lire<T>(chemin: string): Promise<T[]> {
  if (!SB_KEY) return [];
  const res = await fetch(`${SB_URL}/rest/v1/${chemin}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: "no-store",
  }).catch(() => null);
  return res?.ok ? ((await res.json()) as T[]) : [];
}

/* ---------------------------------------------------------------- La carte */

/**
 * Le type de l'immeuble dans les mots de MAV : habitation, bureaux, commerces,
 * entrepôt — ou mixte dès qu'il y en a deux. Caves, parkings et annexes ne
 * comptent pas (un immeuble d'habitation avec des caves n'est pas mixte).
 */
const TYPES: Record<string, string> = {
  Logement: "Habitation", Bureau: "Bureaux", Commerce: "Commerces", Logistique: "Entrepôt",
};
export function typeCarte(destinations: unknown): string {
  const liste = Array.isArray(destinations) ? destinations.map(String) : [];
  const vrais = [...new Set(liste.map((d) => TYPES[d]).filter(Boolean))];
  if (vrais.length > 1) return "Mixte";
  return vrais[0] ?? "Immeuble";
}

/** Le type en toutes lettres, pour le titre de la carte. */
export function natureCarte(type: string): string {
  switch (type) {
    case "Habitation": return "Immeuble d'habitation";
    case "Bureaux": return "Immeuble de bureaux";
    case "Commerces": return "Immeuble de commerces";
    case "Entrepôt": return "Entrepôt";
    case "Mixte": return "Immeuble mixte";
    default: return "Immeuble";
  }
}

export type CarteRcs = {
  immeubleId: string;
  titre: string;
  /** Le texte de la carte, `<br>` pour les retours à la ligne (format MailingVox). */
  texte: string;
  chiffres: { surface?: number; renta?: number; prixHai?: number };
  photo?: string;
  lienDossier?: string;
  /** Le lien transfer.it existe mais est périmé ou sur le point de l'être. */
  lienPerime?: boolean;
  repli: string;
  signature: { nom: string; tel?: string };
};

/** Le nombre de caractères facturés d'un SMS de repli (doc MailingVox : ces signes comptent double). */
export const longueurRepli = (t: string) => [...t].reduce((s, c) => s + ("|^€{}[~]\\".includes(c) ? 2 : 1), 0);

/**
 * Prépare la carte d'un bien, sans rien envoyer : c'est ce que l'écran montre
 * avant le clic, et exactement ce qui partira.
 */
export async function preparerCarte(
  immeubleId: string,
  signataire?: { nom: string; tel?: string },
  /* La commercialisation : le dossier qui part (ses chiffres, MAV 03/11) et le
     lien transfer.it tel qu'il est saisi à l'écran. */
  envoi: { dossierId?: string; lien?: string } = {},
): Promise<CarteRcs | null> {
  const enc = encodeURIComponent(immeubleId);
  const [im] = (await lire<{ data: Doc }>(`bo_immeuble?select=data&id=eq.${enc}&limit=1`)).map((r) => r.data);
  if (!im) return null;
  const [photos, dossiers] = await Promise.all([
    lire<{ data: Doc }>(`bo_photo?select=data&data->>IMMEUBLE=eq.${enc}&data->>Type=eq.Principale&limit=1`),
    lire<{ data: Doc }>(`bo_dossier?select=data&data->>IMMEUBLE=eq.${enc}&limit=50`),
  ]);

  const cp = S(im.adresse_zipcode)?.replace(/\s/g, "");
  const ville = villeArrondissement(im.adresse_ville, cp) ?? S(im.adresse_ville) ?? "";
  const dept = departement(cp) || S(im.adresse_dpt) || "";
  const type = typeCarte(im.Destinations);
  /* MAV (02/11) : « Immeuble d'habitation · Paris 18ème (75) - Prix HAI ». */

  /* Le dossier qui part : celui de la commercialisation, sinon le dernier qui
     porte un lien transfer.it (MAV : pas de lien france-immeuble.fr). Un
     dossier sans lien n'empêche pas l'envoi : la carte part avec deux boutons
     au lieu de trois, et l'écran le dit. */
  const tries = dossiers.map((d) => d.data).sort((a, b) => (N(b.version) ?? 0) - (N(a.version) ?? 0));
  const dossier = (envoi.dossierId ? tries.find((d) => S(d._id) === envoi.dossierId) : undefined)
    ?? tries.find((d) => S(d.lien_partage)) ?? tries[0];
  const lienSaisi = envoi.lien?.trim();
  /* Le lien saisi à l'écran l'emporte ; s'il est celui du dossier, il garde
     sa date d'expiration (un lien périmé ne fait pas de bouton). */
  const lien = lienSaisi && lienSaisi !== S(dossier?.lien_partage)
    ? etatLien(lienSaisi, undefined)
    : lienDuDossier(dossier);

  /* MAV (03/11) : « il faut que les rendements et prix au m² correspondent
     toujours au dossier que j'envoie ». Les chiffres de la carte sont ceux du
     dossier ; la fiche ne sert qu'à défaut. */
  const c = chiffresDossier(dossier);
  const surface = c?.surface ?? N(im.surface_carrez) ?? N(im.surface_sol);
  /* La renta potentielle : tout loué au loyer max, ÷ (prix HAI + travaux). */
  const renta = c?.rentaPotentielle ?? N(im.fin_renta_bm);
  const prixHai = c?.prixHai ?? N(im.prix_hai);

  const titre = `${natureCarte(type)} · ${ville}${dept ? ` (${dept})` : ""}`
    + (prixHai ? ` - ${fr(Math.round(prixHai))} € HAI` : "");

  const sig = signataire ?? { nom: "Marc-Antoine VOCI", tel: "0630768381" };
  const telAffiche = sig.tel ? sig.tel.replace(/^\+33/, "0").replace(/\D/g, "").replace(/(\d{2})(?=\d)/g, "$1 ") : undefined;

  const lignes = [
    surface ? `Surface : ${fr(Math.round(surface))} m²` : null,
    renta ? `Renta potentielle : ${fr(renta, 1)} %` : null,
    prixHai ? `Prix HAI : ${fr(Math.round(prixHai))} €` : null,
  ].filter(Boolean);
  const texte = [
    INTRO,
    lignes.join("<br>"),
    [sig.nom, telAffiche].filter(Boolean).join("<br>"),
  ].filter(Boolean).join("<br><br>");

  /* Le repli : 145 caractères au plus (MailingVox refuse un repli trop long —
     erreur 134). Avec le lien transfer.it du dossier : MAV (02/11) « tu peux
     mettre le lien, il passait de mon côté ». On essaie du plus complet au plus
     court, et le lien ne saute qu'en dernier recours. */
  const k = prixHai ? `${fr(Math.round(prixHai / 1000))} k€ HAI` : "";
  const lieu = `${type} ${ville}${dept ? ` (${dept})` : ""}`;
  const chiffresCourts = (avecRenta: boolean) => [
    surface ? `${fr(Math.round(surface))} m2` : "",
    avecRenta && renta ? `renta ${fr(renta, 1)}%` : "",
    k,
  ].filter(Boolean).join(", ");
  const urlDossier = lien && !lien.aRemplacer ? lien.url.replace(/^https:\/\//, "") : "";
  const stop = `STOP ${NUMERO_STOP}`;
  const candidats = [
    ...(urlDossier ? [
      `France Immeuble: ${lieu}, ${chiffresCourts(true)}. Dossier ${urlDossier} Repondez 1 si interesse, 2 sinon. ${stop}`,
      `France Immeuble: ${lieu}, ${chiffresCourts(true)}. Dossier ${urlDossier} 1=interesse 2=non. ${stop}`,
      `France Immeuble: ${lieu}, ${chiffresCourts(false)}. Dossier ${urlDossier} 1=interesse 2=non. ${stop}`,
      `France Immeuble: ${lieu}. Dossier ${urlDossier} 1=interesse 2=non. ${stop}`,
    ] : []),
    `France Immeuble: ${lieu}, ${chiffresCourts(true)}. Repondez 1 si interesse, 2 sinon. ${stop}`,
    `France Immeuble: ${lieu}, ${chiffresCourts(true)}. 1=interesse 2=non. ${stop}`,
  ];
  const repli = candidats.find((t) => longueurRepli(t) <= 145) ?? candidats.at(-1)!;

  const photoBrute = S(photos[0]?.data.image) ?? S(photos[0]?.data.compressed) ?? S(im.photo_main_compressed);
  return {
    immeubleId,
    titre: titre.slice(0, 200),
    texte: texte.slice(0, 2000),
    chiffres: { surface, renta, prixHai },
    photo: photoBrute,
    lienDossier: lien && !lien.aRemplacer ? lien.url : undefined,
    lienPerime: !!lien?.aRemplacer,
    repli,
    signature: sig,
  };
}

/** Les octets de la photo principale, ramenés sous les 2 Mo que MailingVox accepte. */
async function imageCarte(ref: string): Promise<Buffer | null> {
  const url = ref.startsWith("storage:")
    ? `${SB_URL}/storage/v1/object/bo-files/${ref.slice("storage:".length)}`
    : ref.startsWith("//") ? `https:${ref}` : ref;
  if (!/^https:\/\//.test(url)) return null;
  const hote = new URL(url).hostname;
  const jetonBubble = process.env.BUBBLE_API_TOKEN;
  const res = await fetch(url, {
    headers: url.startsWith(SB_URL) && SB_KEY ? { Authorization: `Bearer ${SB_KEY}` }
      : jetonBubble && hote === "vente.france-immeuble.fr" ? { Authorization: `Bearer ${jetonBubble}` } : {},
    redirect: "follow",
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return null;
  const brut = Buffer.from(await res.arrayBuffer());
  /* 1440 px de large en JPEG : net sur un téléphone, et bien sous les 2 Mo. */
  return sharp(brut, { failOn: "none" }).rotate().resize({ width: 1440, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
}

/* ------------------------------------------------------------ MailingVox */

/** Les erreurs propres au RCS (101 à 165), en français d'agent. */
const ERREURS_RCS: Record<string, string> = {
  "10": "crédits insuffisants",
  "30": "clé API non reconnue (MAILINGVOX_KEY)",
  "45": "le RCS n'est pas activé sur le compte MailingVox",
  "61": "un lien a été détecté : MailingVox demande une validation par son service client",
  "100": "adresse IP non autorisée — retirer la restriction d'IP dans MailingVox (Vercel n'a pas d'adresse fixe)",
  "123": "l'adresse d'un bouton lien doit commencer par https://",
  "132": "aucun média trouvé",
  "134": "le SMS de repli est trop long",
  "136": "le SMS de repli contient des termes interdits",
  "138": "le SMS de repli contient un lien interdit",
  "140": "identifiant de média introuvable",
  "141": "identifiant d'agent RCS introuvable",
  "143": "des mots interdits ont été trouvés dans le texte",
  "145": "un lien non validé a été trouvé dans le texte",
  "155": "média non défini",
  "156": "média non reconnu",
  "162": "crédits RCS insuffisants",
};
const direErreurs = (brut: unknown) =>
  String(brut ?? "").split(",").map((c) => c.trim()).filter(Boolean)
    .map((c) => ERREURS_RCS[c] ?? `erreur ${c}`).join(" · ") || "refus sans code d'erreur";

/** L'agent RCS du compte (l'expéditeur vérifié « France Immeuble »). */
export async function agentRcs(): Promise<{ id: string; nom: string } | null> {
  const k = cle();
  if (!k) return null;
  const res = await fetch(`${BASE}/rcs-agents?key=${encodeURIComponent(k)}`, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  try {
    const j = (await res.json()) as { agents?: { id?: unknown; name?: unknown; status?: unknown }[] };
    const liste = (j.agents ?? []).filter((a) => a.id !== undefined && a.id !== null);
    /* Un seul agent aujourd'hui ; s'il y en avait plusieurs, le premier actif. */
    const a = liste.find((x) => !x.status || /activ|launch|valid/i.test(String(x.status))) ?? liste[0];
    return a ? { id: String(a.id), nom: String(a.name ?? "") } : null;
  } catch {
    return null;
  }
}

/** Crée le modèle de carte chez MailingVox. Rend l'identifiant de média. */
async function creerModele(c: CarteRcs, image: Buffer): Promise<string> {
  const boutons: Record<string, unknown>[] = [
    { type: "reply", caption: BOUTON_OUI },
    { type: "reply", caption: BOUTON_NON },
  ];
  if (c.lienDossier) {
    boutons.push({ type: "url", caption: "Télécharger le dossier", url: c.lienDossier });
  }
  const modele = {
    name: `Bien ${c.immeubleId}`.slice(0, 50),
    type: "card",
    content: {
      card: {
        mediaType: "image",
        file: "{cid:card_file}",
        title: c.titre,
        text: c.texte,
        buttons: boutons,
        options: { cardOrientation: "VERTICAL", cardThumbnailImageAlignment: "CENTER", mediaHeight: "MEDIUM" },
      },
      property: { stop: true },
    },
  };
  const form = new FormData();
  form.set("key", cle()!);
  form.set("model", JSON.stringify(modele));
  form.set("{cid:card_file}", new Blob([new Uint8Array(image)], { type: "image/jpeg" }), "photo.jpg");
  const res = await fetch(`${BASE}/rcs/model/create`, { method: "POST", body: form, cache: "no-store" });
  const brut = await res.text();
  let j: { success?: unknown; id?: unknown; message?: unknown } | null = null;
  try { j = JSON.parse(brut); } catch { /* lu plus bas */ }
  if (!j) throw new Error(`MailingVox (modèle RCS) HTTP ${res.status} : ${brut.slice(0, 200)}`);
  if (!j.success || j.id === undefined || j.id === null) {
    throw new Error(`MailingVox a refusé la carte : ${String(j.message ?? brut.slice(0, 200))}`);
  }
  return String(j.id);
}

export type ResultatRcs = { campagne?: string; mediaId: string; agent: string };

/**
 * Prépare la carte, la crée chez MailingVox et l'envoie aux numéros donnés
 * (déjà en E.164). Lève une erreur lisible au moindre refus.
 */
export async function envoyerCarteRcs(
  c: CarteRcs,
  numeros: string[],
  options: { campagne?: string } = {},
): Promise<ResultatRcs> {
  if (!cle()) throw new Error("Mode simulation : MAILINGVOX_KEY n'est pas renseignée, rien n'est parti.");
  const uniques = [...new Set(numeros.filter((n) => /^\+\d{8,15}$/.test(n)))];
  if (uniques.length === 0) throw new Error("Aucun numéro valide.");
  if (!c.photo) throw new Error("Ce bien n'a pas de photo principale : la carte RCS en exige une.");
  if (longueurRepli(c.repli) > 145) throw new Error("Le SMS de repli dépasse 145 caractères.");

  const agent = await agentRcs();
  if (!agent) throw new Error("Aucun agent RCS lisible chez MailingVox (rcs-agents) : l'expéditeur vérifié n'est pas visible par l'API.");
  const image = await imageCarte(c.photo);
  if (!image) throw new Error("La photo principale n'a pas pu être lue.");
  if (image.byteLength > 2 * 1024 * 1024) throw new Error("La photo dépasse 2 Mo même réduite.");

  const mediaId = await creerModele(c, image);

  const corps = new URLSearchParams({
    key: cle()!,
    rcs_type: "single",
    media_id: mediaId,
    agent_id: agent.id,
    fallback_message: c.repli,
    campaign_title: (options.campagne ?? `RCS ${c.immeubleId}`).slice(0, 50),
    timezone: "Europe/Paris",
  });
  uniques.forEach((n, i) => corps.set(`custom_list[${i}]`, n));

  const res = await fetch(`${BASE}/envoyer/rcs`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: corps,
    cache: "no-store",
  });
  const brut = await res.text();
  /* 02/11, premier essai : le RCS est bien arrivé, mais la réponse ne portait
     pas `resultat` — l'API RCS ne répond pas comme l'API SMS. On accepte les
     deux formes, on garde la réponse brute au journal (elle ne contient pas la
     clé) et, en cas de doute, on la MONTRE plutôt que d'inventer un refus. */
  console.info("[rcs envoi]", res.status, brut.slice(0, 500));
  let j: Record<string, unknown> | null = null;
  try { j = JSON.parse(brut) as Record<string, unknown>; } catch { /* lu plus bas */ }
  if (!j) throw new Error(`MailingVox (envoi RCS) HTTP ${res.status} : ${brut.slice(0, 200)}`);
  const ok = j.resultat === 1 || j.resultat === "1" || j.resultat === true || j.success === true;
  if (!ok) {
    const motif = j.erreurs !== undefined && j.erreurs !== null && j.erreurs !== ""
      ? direErreurs(j.erreurs)
      : `réponse ${brut.slice(0, 200)}`;
    throw new Error(`MailingVox a refusé l'envoi RCS : ${motif}.`);
  }
  const idBrut = j.id ?? j.campaign_id ?? j.campagne ?? (j.data as Record<string, unknown> | undefined)?.id;
  return { campagne: idBrut === undefined || idBrut === null ? undefined : String(idBrut), mediaId, agent: agent.nom };
}
