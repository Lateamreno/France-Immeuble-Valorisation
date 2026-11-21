/**
 * Constructibilité lue par l'IA — ce qui va chercher (MAV, 20/11/26).
 *
 * 1. Le Géoportail de l'urbanisme (API ouverte de l'IGN) dit la zone du point,
 *    son type, le document en vigueur et l'adresse du PDF du règlement. Aucune
 *    IA ici : c'est la donnée officielle.
 * 2. Le règlement est téléchargé et son texte tiré page par page. Un règlement
 *    fait couramment 300 à 600 pages : l'IA reçoit d'abord son plan (une ligne
 *    par page) et désigne les pages à lire.
 * 3. Ces pages-là lui sont envoyées en PDF, citations activées : chaque chiffre
 *    qu'elle retient revient avec le passage du règlement et sa page.
 *
 * Rien n'est écrit dans les quatre cases de la fiche : la lecture est gardée à
 * part (`plu_ia`), l'agent la relit et reprend les valeurs s'il est d'accord.
 * Rien de personnel ne sort du BO : un point géographique et un règlement
 * public.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  ecrirePlages, lirePlages, lireReponse, lireServitudes, lireZoneGpu, MAX_PAGES, nettoyerPages,
  pagesALire, planDuReglement, type BlocReponse, type LecturePlu, type ZonePlu,
} from "./plu";

const GPU = "https://apicarto.ign.fr/api/gpu";
/** Au-delà, on ne télécharge pas : un règlement de cette taille est un scan. */
const POIDS_MAX = 80 * 1024 * 1024;
/** La limite d'une requête à l'API est de 32 Mo, PDF encodé compris. */
const POIDS_ENVOI_MAX = 20 * 1024 * 1024;

const journal = (...a: unknown[]) => console.log("[plu]", ...a);

async function gpu(chemin: string, lon: number, lat: number): Promise<unknown> {
  const geom = encodeURIComponent(JSON.stringify({ type: "Point", coordinates: [lon, lat] }));
  const r = await fetch(`${GPU}/${chemin}?geom=${geom}`, { signal: AbortSignal.timeout(25_000), cache: "no-store" });
  if (!r.ok) throw new Error(`Géoportail de l'urbanisme : ${r.status} sur ${chemin}`);
  return r.json();
}

/** La zone, le document et ce qui couvre le point. Instantané, sans IA. */
export async function zoneDuPoint(lat: number, lon: number): Promise<{ zone: ZonePlu | null; servitudes: string[] }> {
  const [zoneUrba, documents, prescriptions, informations] = await Promise.all([
    gpu("zone-urba", lon, lat),
    gpu("document", lon, lat).catch(() => null),
    gpu("prescription-surf", lon, lat).catch(() => null),
    gpu("info-surf", lon, lat).catch(() => null),
  ]);
  return { zone: lireZoneGpu(zoneUrba, documents), servitudes: lireServitudes(prescriptions, informations) };
}

/* Un règlement sert à tous les immeubles de la commune : tant que la fonction
   reste chaude, on ne le retélécharge pas. */
const memoire = new Map<string, { octets: Uint8Array; pages: string[] }>();

async function chargerReglement(url: string): Promise<{ octets: Uint8Array; pages: string[] }> {
  const connu = memoire.get(url);
  if (connu) return connu;
  const r = await fetch(url, { signal: AbortSignal.timeout(90_000), cache: "no-store" });
  if (!r.ok) throw new Error(`Le règlement n'a pas pu être téléchargé (${r.status}).`);
  const poids = Number(r.headers.get("content-length"));
  if (poids > POIDS_MAX) throw new Error(`Le règlement pèse ${Math.round(poids / 1e6)} Mo : trop lourd pour une lecture automatique.`);
  const octets = new Uint8Array(await r.arrayBuffer());
  if (octets.length > POIDS_MAX) throw new Error(`Le règlement pèse ${Math.round(octets.length / 1e6)} Mo : trop lourd pour une lecture automatique.`);
  if (String.fromCharCode(...octets.slice(0, 5)) !== "%PDF-") throw new Error("Le règlement publié n'est pas un PDF.");
  const { extractText, getDocumentProxy } = await import("unpdf");
  /* pdf.js garde le tampon qu'on lui donne : on lui en passe une copie, pdf-lib
     a besoin de l'original ensuite. */
  const doc = await getDocumentProxy(octets.slice());
  const { text } = await extractText(doc, { mergePages: false });
  const pages = nettoyerPages(Array.isArray(text) ? text : [String(text)]);
  const charge = { octets, pages };
  memoire.clear();
  memoire.set(url, charge);
  return charge;
}

async function extrairePages(octets: Uint8Array, pages: number[]): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const source = await PDFDocument.load(octets, { ignoreEncryption: true, updateMetadata: false });
  const sortie = await PDFDocument.create();
  const copies = await sortie.copyPages(source, pages.map((n) => n - 1));
  for (const p of copies) sortie.addPage(p);
  return sortie.save();
}

/**
 * Garde la lecture sur la fiche, à part des quatre cases du PLU (`plu_ia`).
 * Écrite ici plutôt que dans lib/bo/actions.ts : ce fichier-là tire avec lui la
 * fabrication des PDF, dont cette route n'a pas l'usage.
 */
export async function garderLecture(immeubleId: string, lecture: LecturePlu): Promise<void> {
  const url = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cle) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente : écriture impossible");
  const r = await fetch(`${url}/rest/v1/rpc/bo_patch_doc`, {
    method: "POST",
    headers: { apikey: cle, Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_table: "bo_immeuble", p_id: immeubleId, p_patch: { plu_ia: lecture } }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Écriture Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

const MODELE = "claude-opus-5-5";

const CONSIGNE_PLAN = `Tu aides un agent immobilier à lire un règlement de plan local d'urbanisme (PLU ou PLUi) français.
On te donne la zone d'un terrain et le plan du règlement : une ligne par page du PDF, avec son numéro, ses premières lignes et quelques repères (mention de la zone, nombre d'occurrences de « emprise au sol » et de « hauteur », sommaire).
Désigne les pages à lire pour établir, pour CETTE zone, l'emprise au sol maximale et la hauteur maximale des constructions.

À savoir :
- Le libellé d'une zone peut être un code à indices (par exemple une lettre de densité et un chiffre de hauteur) : il faut alors les pages qui expliquent le système d'indices et celles qui portent les tableaux de correspondance.
- Les règles d'une zone renvoient souvent à des dispositions générales ou communes à toutes les zones, et à un lexique (définition de l'emprise au sol, mode de calcul de la hauteur) : prends-les si elles sont nécessaires au chiffre.
- Un PLUi couvre plusieurs communes : ne prends que ce qui s'applique à la zone demandée.
- Mieux vaut quelques pages de trop qu'une page manquante, mais reste sous ${MAX_PAGES} pages.

Réponds par le seul objet JSON demandé : « pages » en plages de numéros de pages du PDF (« 12-14, 54-56, 83-91 »), « raison » en une phrase.`;

const CONSIGNE_LECTURE = `Tu lis des pages d'un règlement de plan local d'urbanisme (PLU ou PLUi) français pour un agent immobilier qui prépare le dossier de vente d'un immeuble.
Établis, pour la zone indiquée et elle seule, deux chiffres : l'emprise au sol maximale (en % du terrain) et la hauteur maximale des constructions (en mètres). Ils seront vérifiés par un humain à partir des passages que tu cites : chaque chiffre doit s'appuyer sur le passage du règlement qui le porte.

Règles de lecture :
- N'affirme que ce que les pages jointes établissent. Si elles ne suffisent pas, dis-le dans PAGES_MANQUANTES plutôt que de déduire.
- Si le libellé de la zone est un code à indices, décompose-le d'après ce que le règlement en dit, et dis dans REGLE quel indice donne quel chiffre.
- Hauteur : retiens la hauteur totale maximale (au faîtage ou au point le plus haut). Si le règlement ne fixe qu'une hauteur à l'égout ou à l'acrotère, retiens-la et dis-le. Si la hauteur dépend d'un autre paramètre (largeur de la voie, gabarit, plan des hauteurs), ne donne pas de chiffre : explique la règle dans MENTION.
- Emprise : si le règlement ne la limite pas, VALEUR vaut AUCUNE et MENTION vaut « non réglementée ». Si elle varie (par taille de terrain, par bande de constructibilité), retiens le cas général et dis l'autre dans REGLE.
- Ne convertis pas un nombre de niveaux en mètres de ton propre chef.
- A_SAVOIR : au plus quatre points que les mêmes pages établissent et qui comptent pour un acquéreur (pleine terre exigée, secteur de plan de masse, règle particulière aux constructions existantes, surélévation). Rien d'autre.

Réponds en français, exactement sous cette forme, sans rien avant ni après :

## EMPRISE
VALEUR: <nombre seul, en %, ou AUCUNE>
MENTION: <quelques mots quand il n'y a pas de chiffre, sinon AUCUNE>
REGLE: <une ou deux phrases qui disent la règle et d'où vient le chiffre>

## HAUTEUR
VALEUR: <nombre seul, en mètres, ou AUCUNE>
MENTION: <quelques mots quand il n'y a pas de chiffre, sinon AUCUNE>
REGLE: <une ou deux phrases>

## A_SAVOIR
- <point>

## PAGES_MANQUANTES
<plages de numéros de pages du règlement entier qu'il te faudrait, ou AUCUNE>

## RESERVE
<un doute que le lecteur doit connaître, ou AUCUNE>`;

function presentation(zone: ZonePlu, commune: string): string {
  return [
    `Zone du terrain : ${zone.zone}${zone.intitule ? ` — ${zone.intitule}` : ""}${zone.type ? ` (zone ${zone.type.toLowerCase()})` : ""}.`,
    commune ? `Commune : ${commune}.` : "",
    zone.document ? `Document : ${zone.document}.` : "",
    zone.page ? `Le Géoportail de l'urbanisme renvoie, pour cette zone, à la page ${zone.page} du PDF.` : "",
  ].filter(Boolean).join("\n");
}

function messageErreur(e: unknown): string {
  if (e instanceof Anthropic.RateLimitError) return "Trop de demandes à la fois : réessayez dans une minute.";
  if (e instanceof Anthropic.AuthenticationError) return "La clé ANTHROPIC_API_KEY est refusée.";
  if (e instanceof Anthropic.APIError) return `Claude ${e.status ?? ""} : ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

/** Première passe : d'après le plan, quelles pages lire ? */
async function designerPages(client: Anthropic, zone: ZonePlu, commune: string, pages: string[]): Promise<number[]> {
  const autour = zone.page
    ? [zone.page, zone.page + 1, zone.page + 2, zone.page + 3].filter((n) => n >= 1 && n <= pages.length && pages[n - 1].trim())
      .map((n) => `--- page ${n} ---\n${pages[n - 1].slice(0, 3000)}`).join("\n")
    : "";
  const r = await client.beta.messages.create({
    model: MODELE,
    max_tokens: 4000,
    output_config: {
      effort: "medium",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: { pages: { type: "string" }, raison: { type: "string" } },
          required: ["pages", "raison"],
          additionalProperties: false,
        },
      },
    },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: CONSIGNE_PLAN,
    messages: [{
      role: "user",
      content: [
        presentation(zone, commune),
        `Le règlement compte ${pages.length} pages.`,
        autour ? `\nTexte des pages auxquelles renvoie le Géoportail :\n${autour}` : "",
        `\nPlan du règlement :\n${planDuReglement(pages, zone.zone)}`,
      ].filter(Boolean).join("\n"),
    }],
  });
  if (r.stop_reason === "refusal") throw new Error("Le modèle a refusé de lire le plan du règlement.");
  const texte = r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let plages = "";
  try {
    plages = String((JSON.parse(texte) as { pages?: unknown }).pages ?? "");
  } catch {
    plages = texte;
  }
  return lirePlages(plages, pages.length);
}

/** Seconde passe : les pages en PDF, citations activées. */
async function lirePages(client: Anthropic, zone: ZonePlu, commune: string, octets: Uint8Array, pages: number[]) {
  const extrait = await extrairePages(octets, pages);
  if (extrait.length > POIDS_ENVOI_MAX) {
    throw new Error(`Les ${pages.length} pages à lire pèsent ${Math.round(extrait.length / 1e6)} Mo (pages scannées ?) : trop lourd pour une lecture automatique.`);
  }
  const flux = client.beta.messages.stream({
    model: MODELE,
    max_tokens: 16000,
    output_config: { effort: "high" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: CONSIGNE_LECTURE,
    messages: [{
      role: "user",
      content: [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: Buffer.from(extrait).toString("base64") },
          title: zone.document ?? "Règlement du PLU",
          citations: { enabled: true },
        },
        {
          type: "text",
          text: [
            presentation(zone, commune),
            `Le PDF joint contient ${pages.length} pages du règlement, dans cet ordre : ${ecrirePlages(pages)} (numéros de pages du règlement entier, à employer dans PAGES_MANQUANTES).`,
          ].join("\n"),
        },
      ],
    }],
  });
  const r = await flux.finalMessage();
  if (r.stop_reason === "refusal") throw new Error("Le modèle a refusé de lire le règlement.");
  const blocs: BlocReponse[] = [];
  for (const b of r.content) {
    if (b.type !== "text") continue;
    blocs.push({
      text: b.text,
      citations: (b.citations ?? []).map((c) => ({
        cited_text: c.cited_text,
        start_page_number: c.type === "page_location" ? c.start_page_number : undefined,
      })),
    });
  }
  return lireReponse(blocs, pages);
}

export type ResultatLecture =
  | { ok: true; lecture: LecturePlu }
  | { ok: false; message: string };

/**
 * La lecture complète. Ne lève pas : ce qui a pu être établi est rendu, et la
 * raison de ce qui manque est dans `reserve`.
 */
export async function lirePlu(e: { lat: number; lon: number; commune: string; par?: string }): Promise<ResultatLecture> {
  let zone: ZonePlu | null;
  let servitudes: string[];
  try {
    ({ zone, servitudes } = await zoneDuPoint(e.lat, e.lon));
  } catch (err) {
    return { ok: false, message: `Le Géoportail de l'urbanisme ne répond pas (${messageErreur(err)}). Réessayez dans un instant.` };
  }
  if (!zone) {
    return { ok: false, message: "Le Géoportail de l'urbanisme ne connaît pas de zonage numérisé à cette adresse (commune au règlement national, ou document pas encore versé). La constructibilité reste à saisir à la main." };
  }
  const lecture: LecturePlu = { fait_le: new Date().toISOString(), par: e.par, zone, servitudes, a_savoir: [], pages_lues: [] };
  const incomplete = (reserve: string): ResultatLecture => ({ ok: true, lecture: { ...lecture, reserve } });

  if (!zone.reglement) return incomplete("Le Géoportail ne donne pas le PDF du règlement de cette zone : l'emprise et la hauteur restent à lire à la main.");
  if (!process.env.ANTHROPIC_API_KEY) return incomplete("ANTHROPIC_API_KEY n'est pas posée dans Vercel : le règlement n'a pas été lu. La zone et son type viennent du Géoportail.");

  try {
    const debut = Date.now();
    const { octets, pages } = await chargerReglement(zone.reglement);
    lecture.pages_total = pages.length;
    journal("règlement", zone.reglement, pages.length, "pages,", Math.round(octets.length / 1e6), "Mo,", Date.now() - debut, "ms");
    const lisible = pages.reduce((t, p) => t + p.length, 0) / Math.max(1, pages.length) > 150;
    if (!lisible && pages.length > MAX_PAGES) {
      return incomplete(`Le règlement est un document scanné de ${pages.length} pages : il ne peut pas être parcouru automatiquement.`);
    }

    const client = new Anthropic();
    /* Un règlement court (un fichier par zone) se lit en entier. */
    let aLire = pages.length <= MAX_PAGES
      ? pages.map((_, i) => i + 1)
      : pagesALire(await designerPages(client, zone, e.commune, pages), zone.page, pages.length);
    if (aLire.length === 0) return incomplete("L'IA n'a pas su désigner les pages du règlement à lire.");
    journal("pages désignées", ecrirePlages(aLire), Date.now() - debut, "ms");

    let lu = await lirePages(client, zone, e.commune, octets, aLire);
    /* Une seule relance : si l'IA dit qu'il lui manque des pages, on les ajoute. */
    const manquantes = lirePlages(lu.manquantes, pages.length).filter((n) => !aLire.includes(n));
    if (manquantes.length > 0 && aLire.length < pages.length) {
      aLire = [...new Set([...aLire, ...manquantes.slice(0, 20)])].sort((a, b) => a - b);
      journal("pages ajoutées", ecrirePlages(manquantes), Date.now() - debut, "ms");
      lu = await lirePages(client, zone, e.commune, octets, aLire);
    }
    journal("lecture faite", { emprise: lu.emprise?.valeur, hauteur: lu.hauteur?.valeur }, Date.now() - debut, "ms");
    return {
      ok: true,
      lecture: {
        ...lecture,
        emprise: lu.emprise,
        hauteur: lu.hauteur,
        a_savoir: lu.aSavoir,
        pages_lues: aLire,
        ...(lu.reserve ? { reserve: lu.reserve } : {}),
      },
    };
  } catch (err) {
    journal("échec", messageErreur(err));
    return incomplete(`Le règlement n'a pas pu être lu : ${messageErreur(err)}`);
  }
}
