# Prompt — la méthode de travail avec MAV : outil de retours + document avant / après

> À coller tel quel, en premier message, dans toute conversation Claude Code qui
> travaille sur un projet de MAV (Marc-Antoine VOCI). Tout ce qui suit est à
> reproduire **à l'identique** : mêmes écrans, mêmes gestes, mêmes fichiers,
> même document de fin de lot. Le code est fourni ; il se copie, il ne se
> réinvente pas.

---

Tu travailles pour MAV sur un projet Next.js (App Router) déployé sur Vercel,
avec un projet Supabase à côté. Tout se passe **en français** : les messages,
les commentaires de code, les libellés d'écran, les commits.

Trois choses sont non négociables, et ce document explique comment les faire :

1. **L'outil de retours** (« Mode Revue ») : un bouton flottant sur chaque écran
   de la preview, avec lequel MAV entoure une zone, note ce qui ne va pas,
   colle des captures ; et une page `/revue` qui liste tous les retours avec
   leur statut. Tu l'installes si le projet ne l'a pas, et tu le lis à chaque
   fois que MAV dit « je t'ai fait des retours ».
2. **Le cycle de livraison** : une branche de travail, fusion dans `main`,
   attendre que le déploiement Vercel de `main` soit **Ready** et le dire.
3. **Le document avant / après**, publié en Artifact à chaque lot livré, avec
   des captures **réelles** prises sur les deux versions construites.

---

## 1. Le cycle de livraison

- Développer sur la branche de travail indiquée par la conversation. Commits
  clairs, en français, avec le résumé en première ligne (`#489 #492 : sociétés
  en entités, propriétaires multiples…`).
- `git push -u origin <branche>` puis `git checkout main && git merge --no-edit
  <branche> && git push origin main`, puis revenir sur la branche.
- **Après chaque fusion dans `main`, attendre que le déploiement Vercel soit
  « Ready » et le dire dans le récap.** Un lot n'est livré que quand le
  déploiement de `main` est passé. (Un jour, deux déploiements ont échoué sans
  que personne ne le voie : la prod est restée trois jours sur l'ancienne
  version alors que le lot était annoncé livré.)
- Vérifier avant de pousser : `npx tsc --noEmit` et `npm run build` passent.
- Jamais de secret dans une réponse ni dans un fichier versionné (clés
  Supabase, jetons d'API, mots de passe).
- **Validation humaine avant tout envoi** : l'app prépare, MAV envoie. Aucun
  e-mail, SMS ou publication ne part d'une action automatique, jamais. Ne
  jamais déclencher un envoi réel pour « tester ».

---

## 2. L'outil de retours — comment il marche

### 2.1 Ce que MAV voit

Sur chaque page de la preview, en bas à droite, trois pastilles :

- **« N retours »** (seulement s'il y a des retours ouverts sur cette page) :
  affiche / masque les cadres et épingles déjà posés sur l'écran, numérotés,
  dans la couleur de leur gravité.
- **« Liste »** : lien vers `/revue`.
- **« ✎ Signaler un écart »** (ou **Ctrl/Cmd + Shift + R**) : arme le Mode
  Revue. Un bandeau rouge en haut dit « Mode Revue — entourez la zone concernée
  en glissant la souris, ou cliquez pour une épingle (Échap pour annuler) », le
  curseur devient une croix, la page a un liseré rouge. MAV **trace un
  rectangle** autour de la zone (comme une capture d'écran) ou **clique** pour
  poser une épingle. Le clic est avalé : la page ne réagit pas au tracé.

La fiche de retour s'ouvre alors (panneau en bas à droite) :

- la zone visée (« Zone entourée (412 × 180 px) : *texte de l'élément* » ou
  « Point visé : … ») ;
- la **gravité**, quatre boutons : **Bloquant** (rouge `#d60000`), **Écart avec
  le BO** (orange `#e3790d`, par défaut), **Détail visuel** (doré `#b6a359`),
  **Idée / plus tard** (vert `#3db327`) ;
- un champ texte « Ce qui ne va pas et ce qui devrait s'afficher à la place… » ;
- les **captures** : MAV colle une ou plusieurs images au presse-papier
  (Ctrl/Cmd + V, chaque collage AJOUTE) ou choisit des fichiers ; chaque
  vignette se retire d'une croix ;
- le chemin de la page, et le bouton **« Enregistrer le retour »** (inactif
  tant que le commentaire est vide). « Retour enregistré ✓ » puis le panneau
  se ferme.

La page **`/revue`** (« Retours de recette ») liste tout, groupé par URL de
page, avec quatre onglets : **À traiter / Corrigés / Écartés / Tous**, chacun
avec son compte. Chaque retour montre : `#id · Gravité · auteur · date`, le
commentaire, la zone (texte de l'élément ou sélecteur CSS), la réponse si
elle existe (en vert), les captures (cliquables, pleine taille), et les
actions : **Modifier** (texte, gravité, ajout d'images, les captures déjà là
sont conservées), **Marquer corrigé**, **Écarter** (motif optionnel),
**Rouvrir**, **✕** supprimer (avec confirmation). Un retour corrigé s'affiche
à 55 % d'opacité.

### 2.2 Ce que ça stocke

Table **`bo_feedback`** dans le projet Supabase du projet (voir le SQL en 3.2)
et les captures dans le bucket privé **`bo-files`**, sous `feedback/<horodatage>-<aléa>.<ext>`.
L'écriture et la lecture passent par des **server actions** avec la clé de
service, jamais depuis le navigateur. Les captures se servent par
`/api/photo?s=<chemin dans le bucket>`.

Les statuts : `ouvert` → `corrige` (avec `reponse` et `traite_at`) ou
`ecarte` (avec motif). Un retour se numérote par son `id` : MAV dit « le 489 »,
« pour le 481 », et tes récaps reprennent cette numérotation.

### 2.3 Comment TU t'en sers

Quand MAV dit « je t'ai fait des retours » :

1. Lire les retours ouverts (SQL via l'outil Supabase, ou REST avec la clé de
   service) :
   ```sql
   select id, created_at, url, gravite, commentaire, element_texte, selecteur, captures, capture_path
   from bo_feedback where statut = 'ouvert' order by id;
   ```
2. **Regarder chaque capture** (télécharger depuis le bucket et l'ouvrir avec
   l'outil de lecture d'image) : la capture est souvent l'essentiel du retour,
   le texte ne dit pas tout.
3. Traiter les retours par lot, dans la numérotation de MAV. Un retour qui
   demande un arbitrage (plusieurs lectures possibles, choix de maquette) se
   pose en question dans le récap ; il reste `ouvert` jusqu'à la réponse.
4. Une fois le lot livré (fusionné, déploiement Ready), passer chaque retour
   traité en `corrige` avec une `reponse` courte qui dit ce qui a été fait :
   ```sql
   update bo_feedback set statut = 'corrige', traite_at = now(),
     reponse = 'Les trois barres portent l''ombre de l''ancien BO.'
   where id = 494;
   ```
   (Avec l'outil MCP Supabase, un `update … returning` seul peut rendre un
   résultat vide ; écrire `with u as (update … returning id) select count(*) from u`.)
5. Publier le document avant / après (section 4) et donner le lien.

---

## 3. Installer l'outil de retours (si le projet ne l'a pas)

Vérifier d'abord : `components/revue.tsx` existe-t-il ? Si oui, ne rien
réinstaller. Sinon, tout ce qui suit, **tel quel**.

### 3.1 Prérequis

- Next.js App Router (React 19, server actions).
- Variables d'environnement (Vercel + `.env.local`) : `SUPABASE_URL` et
  `SUPABASE_SERVICE_ROLE_KEY` du projet Supabase du projet. Ne jamais exposer
  la clé de service au navigateur (pas de préfixe `NEXT_PUBLIC_`).
- Dans `lib/bo/feedback.ts` et `app/api/photo/route.ts`, la valeur de repli de
  `SB_URL` est celle du BO France Immeuble : **la remplacer par l'URL du projet
  Supabase de ce projet-ci**, ou s'assurer que `SUPABASE_URL` est définie. C'est
  la seule ligne à adapter dans tout le code fourni.

### 3.2 La base : table + bucket (à exécuter dans le projet Supabase)

```sql
create table if not exists public.bo_feedback (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  auteur        text not null default 'MAV',
  url           text not null,
  page_titre    text,
  selecteur     text,
  element_texte text,
  x_pct         numeric,
  y_pct         numeric,
  viewport_w    integer,
  gravite       text not null default 'ecart',
  commentaire   text not null,
  capture_path  text,
  statut        text not null default 'ouvert',
  reponse       text,
  traite_at     timestamptz,
  w_pct         double precision,
  h_pct         double precision,
  captures      text[]
);
alter table public.bo_feedback enable row level security;
-- Aucune policy : seule la clé de service (server actions) lit et écrit.

insert into storage.buckets (id, name, public)
values ('bo-files', 'bo-files', false)
on conflict (id) do nothing;
```

### 3.3 `lib/bo/feedback.ts` — les server actions

```ts
"use server";

// Mode Revue — retours de recette posés directement sur les écrans.
// Stockage dans le projet Supabase dédié (table bo_feedback + bucket bo-files).
import { revalidatePath } from "next/cache";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export type Feedback = {
  id: number;
  created_at: string;
  auteur: string;
  url: string;
  page_titre: string | null;
  selecteur: string | null;
  element_texte: string | null;
  /** Coin haut-gauche de la zone si w_pct/h_pct sont renseignés,
   *  centre de l'épingle sinon (retours antérieurs au tracé rectangulaire). */
  x_pct: number | null;
  y_pct: number | null;
  w_pct: number | null;
  h_pct: number | null;
  gravite: "bloquant" | "ecart" | "detail" | "idee";
  commentaire: string;
  capture_path: string | null;
  /** Toutes les captures du retour ; `capture_path` est la première. */
  captures: string[] | null;
  statut: "ouvert" | "corrige" | "ecarte";
  reponse: string | null;
};

async function sb(path: string, init?: RequestInit) {
  if (!SB_KEY) throw new Error("Stockage des retours indisponible (clé Supabase absente).");
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

/** Dépose une capture dans le coffre et rend son chemin. */
async function deposerCapture(f: File): Promise<string> {
  if (f.size > 10 * 1024 * 1024) throw new Error(`« ${f.name || "capture"} » dépasse 10 Mo.`);
  const ext = (f.type.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "") || "png";
  const chemin = `feedback/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const up = await fetch(`${SB_URL}/storage/v1/object/bo-files/${chemin}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": f.type || "image/png",
      "x-upsert": "true",
    },
    body: Buffer.from(await f.arrayBuffer()),
  });
  if (!up.ok) throw new Error(`Upload capture ${up.status}`);
  return chemin;
}

/**
 * Enregistre un retour, avec autant de captures qu'il en faut.
 *
 * Une seule était acceptée, et MAV en avait souvent plusieurs à montrer pour
 * un même écart — il devait alors ouvrir deux retours pour une seule remarque.
 * `capture_path` reste renseigné avec la première : les retours déjà
 * enregistrés continuent de s'afficher sans reprise.
 */
export async function addFeedback(fd: FormData) {
  const fichiers = fd.getAll("capture").filter((c): c is File => c instanceof File && c.size > 0);
  // Déposées ensemble : trois captures ne doivent pas coûter trois attentes.
  const captures = await Promise.all(fichiers.map(deposerCapture));
  const capture_path = captures[0] ?? null;

  const num = (k: string) => {
    const v = fd.get(k);
    return v === null || v === "" ? null : Number(v);
  };
  const str = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" && v !== "" ? v : null;
  };

  await sb("bo_feedback", {
    method: "POST",
    body: JSON.stringify({
      auteur: str("auteur") ?? "MAV",
      url: str("url") ?? "/",
      page_titre: str("page_titre"),
      selecteur: str("selecteur"),
      element_texte: str("element_texte")?.slice(0, 300) ?? null,
      x_pct: num("x_pct"),
      y_pct: num("y_pct"),
      w_pct: num("w_pct"),
      h_pct: num("h_pct"),
      viewport_w: num("viewport_w"),
      gravite: str("gravite") ?? "ecart",
      commentaire: str("commentaire") ?? "",
      capture_path,
      captures: captures.length ? captures : null,
    }),
  });
  revalidatePath("/revue");
}

/** Liste les retours (tous, ou d'une page). */
export async function listFeedback(url?: string): Promise<Feedback[]> {
  if (!SB_KEY) return [];
  const q = new URLSearchParams({ select: "*", order: "created_at.desc", limit: "500" });
  if (url) q.append("url", `eq.${url}`);
  const res = await sb(`bo_feedback?${q}`).catch(() => null);
  return res ? ((await res.json()) as Feedback[]) : [];
}

/**
 * Les retours OUVERTS seulement, pour le bouton de recette de chaque page.
 *
 * Le layout embarquait TOUS les retours, réponses comprises, dans CHAQUE page
 * — alors que le bouton ne dessine que les épingles ouvertes de la page
 * courante. Il ne lit plus que celles-là, et rien que les colonnes qu'il
 * dessine.
 */
export async function listFeedbackOuverts(): Promise<Feedback[]> {
  if (!SB_KEY) return [];
  const q = new URLSearchParams({
    select: "id,url,statut,gravite,commentaire,x_pct,y_pct,w_pct,h_pct",
    statut: "eq.ouvert",
    order: "created_at.desc",
    limit: "200",
  });
  const res = await sb(`bo_feedback?${q}`).catch(() => null);
  return res ? ((await res.json()) as Feedback[]) : [];
}

/** Marque un retour corrigé / écarté (avec réponse). */
export async function setFeedbackStatut(
  id: number,
  statut: "ouvert" | "corrige" | "ecarte",
  reponse?: string,
) {
  await sb(`bo_feedback?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      statut,
      reponse: reponse ?? null,
      traite_at: statut === "ouvert" ? null : new Date().toISOString(),
    }),
  });
  revalidatePath("/revue");
}

/**
 * Corrige un retour déjà posé.
 *
 * MAV : « dans les retours je veux une option avec un crayon pour modifier le
 * texte ou ajouter une image ». Un retour se précise après coup — on se relit,
 * on retrouve la capture qui manquait. Les captures s'AJOUTENT : celles déjà
 * déposées ne sont jamais remplacées à l'aveugle.
 */
export async function modifierFeedback(fd: FormData) {
  const id = Number(fd.get("id"));
  if (!Number.isFinite(id)) throw new Error("Retour introuvable.");

  const commentaire = String(fd.get("commentaire") ?? "").trim();
  const gravite = String(fd.get("gravite") ?? "");
  const fichiers = fd.getAll("capture").filter((c): c is File => c instanceof File && c.size > 0);
  const neuves = await Promise.all(fichiers.map(deposerCapture));

  const patch: Record<string, unknown> = {};
  if (commentaire) patch.commentaire = commentaire;
  if (["bloquant", "ecart", "detail", "idee"].includes(gravite)) patch.gravite = gravite;

  if (neuves.length) {
    const res = await sb(`bo_feedback?id=eq.${id}&select=captures,capture_path`).catch(() => null);
    const rows = res ? ((await res.json()) as { captures: string[] | null; capture_path: string | null }[]) : [];
    const avant = rows[0]?.captures ?? (rows[0]?.capture_path ? [rows[0].capture_path] : []);
    const toutes = [...avant, ...neuves];
    patch.captures = toutes;
    patch.capture_path = toutes[0];
  }

  if (!Object.keys(patch).length) return;
  await sb(`bo_feedback?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  revalidatePath("/revue");
}

/** Supprime un retour (erreur de saisie). */
export async function deleteFeedback(id: number) {
  await sb(`bo_feedback?id=eq.${id}`, { method: "DELETE" });
  revalidatePath("/revue");
}
```

### 3.4 `components/revue.tsx` — le bouton flottant, le tracé, la fiche

```tsx
"use client";

// Mode Revue — bouton flottant présent sur tous les écrans.
// Activé, le curseur devient une croix : on entoure la zone concernée en
// traçant un rectangle libre (comme une capture d'écran), ou on clique
// simplement pour poser une épingle ponctuelle. La fiche de retour s'ouvre
// ensuite (gravité, commentaire, capture collée au presse-papier ou choisie).
// Les zones déjà signalées sur l'écran restent visibles.
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { addFeedback, type Feedback } from "@/lib/bo/feedback";

type Draft = {
  /** Coin haut-gauche de la zone, en % de la page. */
  xPct: number; yPct: number;
  /** Taille de la zone en % ; absente pour une épingle ponctuelle. */
  wPct?: number; hPct?: number;
  selecteur: string; elementTexte: string;
  /** Géométrie en pixels de page, pour l'aperçu à l'écran. */
  pageX: number; pageY: number; pageW: number; pageH: number;
};

/** En-deçà de ce déplacement, on considère que c'est un simple clic. */
const SEUIL_GLISSER = 6;

const GRAVITES: { key: Feedback["gravite"]; label: string; color: string }[] = [
  { key: "bloquant", label: "Bloquant", color: "#d60000" },
  { key: "ecart", label: "Écart avec le BO", color: "#e3790d" },
  { key: "detail", label: "Détail visuel", color: "#b6a359" },
  { key: "idee", label: "Idée / plus tard", color: "#3db327" },
];

/** Sélecteur CSS court et lisible pour retrouver l'élément visé. */
function selectorOf(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  for (let i = 0; cur && i < 4 && cur.tagName !== "BODY"; i++) {
    const cls = (cur.getAttribute("class") ?? "")
      .split(/\s+/)
      .filter((c) => c && !/^(css-|__)/.test(c))
      .slice(0, 2)
      .map((c) => `.${c}`)
      .join("");
    parts.unshift(cur.tagName.toLowerCase() + cls);
    cur = cur.parentElement;
  }
  return parts.join(" > ");
}

export function RevueButton({ pins }: { pins: Feedback[] }) {
  const pathname = usePathname();
  const [actif, setActif] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  // Les cadres enregistrés ne s'affichent pas par défaut — ils recouvraient
  // les menus et bloquaient la navigation. Le compteur de la barre de recette
  // les réaffiche à la demande.
  const [voirPins, setVoirPins] = useState(false);

  // Raccourci clavier : Ctrl/Cmd + Shift + R
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        setActif((v) => !v);
      }
      if (e.key === "Escape") { setDraft(null); setActif(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Tracé du rectangle : on suit la souris depuis l'appui jusqu'au relâché.
  // Tout est capté en phase descendante pour neutraliser l'action de la page.
  const depart = useRef<{ x: number; y: number } | null>(null);
  const [trace, setTrace] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const onDown = useCallback(
    (e: MouseEvent) => {
      if (!actif || e.button !== 0) return;
      const t = e.target as Element | null;
      if (!t || t.closest(".rv-panel, .rv-fab, .rv-pin, .rv-zone")) return;
      e.preventDefault();
      e.stopPropagation();
      depart.current = { x: e.pageX, y: e.pageY };
      setTrace({ x: e.pageX, y: e.pageY, w: 0, h: 0 });
    },
    [actif],
  );

  const onMove = useCallback((e: MouseEvent) => {
    const d = depart.current;
    if (!d) return;
    e.preventDefault();
    setTrace({
      x: Math.min(d.x, e.pageX),
      y: Math.min(d.y, e.pageY),
      w: Math.abs(e.pageX - d.x),
      h: Math.abs(e.pageY - d.y),
    });
  }, []);

  const onUp = useCallback(
    (e: MouseEvent) => {
      const d = depart.current;
      if (!d) return;
      e.preventDefault();
      e.stopPropagation();
      depart.current = null;
      setTrace(null);

      const x = Math.min(d.x, e.pageX);
      const y = Math.min(d.y, e.pageY);
      const w = Math.abs(e.pageX - d.x);
      const h = Math.abs(e.pageY - d.y);
      const doc = document.documentElement;
      const rectangle = w >= SEUIL_GLISSER && h >= SEUIL_GLISSER;

      // L'élément décrit est celui du centre de la zone (ou du point cliqué).
      const cx = rectangle ? x + w / 2 : e.pageX;
      const cy = rectangle ? y + h / 2 : e.pageY;
      const cible =
        document.elementFromPoint(cx - window.scrollX, cy - window.scrollY) ??
        (e.target as Element | null);

      setDraft({
        xPct: ((rectangle ? x : e.pageX) / doc.scrollWidth) * 100,
        yPct: ((rectangle ? y : e.pageY) / doc.scrollHeight) * 100,
        wPct: rectangle ? (w / doc.scrollWidth) * 100 : undefined,
        hPct: rectangle ? (h / doc.scrollHeight) * 100 : undefined,
        pageX: rectangle ? x : e.pageX,
        pageY: rectangle ? y : e.pageY,
        pageW: w,
        pageH: h,
        selecteur: cible ? selectorOf(cible) : "",
        elementTexte: (cible?.textContent ?? "").trim().slice(0, 200),
      });
      setActif(false);
    },
    [],
  );

  useEffect(() => {
    // Le clic est avalé pour que la page ne réagisse pas au tracé.
    const avale = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!actif || t?.closest(".rv-panel, .rv-fab, .rv-pin, .rv-zone")) return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
    document.addEventListener("click", avale, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
      document.removeEventListener("click", avale, true);
    };
  }, [actif, onDown, onMove, onUp]);

  useEffect(() => {
    document.body.classList.toggle("rv-armed", actif);
    return () => document.body.classList.remove("rv-armed");
  }, [actif]);

  const mine = pins.filter((p) => p.url === pathname && p.statut === "ouvert");

  return (
    <>
      {voirPins &&
        mine.map((p, i) => {
          if (p.x_pct === null || p.y_pct === null) return null;
          const couleur = GRAVITES.find((g) => g.key === p.gravite)?.color ?? "#e3790d";
          const titre = `${p.gravite} — ${p.commentaire}`;
          // Zone rectangulaire si elle a été tracée, épingle ponctuelle sinon.
          return p.w_pct && p.h_pct ? (
            <span
              key={p.id}
              className="rv-zone"
              style={{
                left: `${p.x_pct}%`, top: `${p.y_pct}%`,
                width: `${p.w_pct}%`, height: `${p.h_pct}%`,
                borderColor: couleur,
              }}
              title={titre}
            >
              <b style={{ background: couleur }}>{i + 1}</b>
            </span>
          ) : (
            <span key={p.id} className="rv-pin"
              style={{ left: `${p.x_pct}%`, top: `${p.y_pct}%`, background: couleur }}
              title={titre}>
              {i + 1}
            </span>
          );
        })}

      {trace && (
        <span className="rv-zone trace"
          style={{ left: trace.x, top: trace.y, width: trace.w, height: trace.h }}>
          <b>{Math.round(trace.w)} × {Math.round(trace.h)}</b>
        </span>
      )}

      <div className="rv-fab">
        {mine.length > 0 && (
          <button
            type="button"
            className="rv-chip"
            onClick={() => setVoirPins((v) => !v)}
            title="Afficher / masquer les épingles de cet écran"
          >
            {mine.length} retour{mine.length > 1 ? "s" : ""}
          </button>
        )}
        <Link className="rv-chip" href="/revue" title="Voir tous les retours">Liste</Link>
        <button
          type="button"
          className={`rv-btn${actif ? " on" : ""}`}
          onClick={() => setActif((v) => !v)}
          title="Mode Revue (Ctrl/Cmd + Shift + R) : entourez la zone concernée, ou cliquez simplement pour poser une épingle"
        >
          {actif ? "Entourez la zone concernée…" : "✎ Signaler un écart"}
        </button>
      </div>

      {draft && <RevuePanel draft={draft} pathname={pathname} onClose={() => setDraft(null)} />}
    </>
  );
}

function RevuePanel({
  draft, pathname, onClose,
}: {
  draft: Draft; pathname: string; onClose: () => void;
}) {
  const [gravite, setGravite] = useState<Feedback["gravite"]>("ecart");
  const [commentaire, setCommentaire] = useState("");
  /* Plusieurs captures par retour : un écart se montre souvent mieux à deux
     images — l'écran actuel et celui qui sert de référence. */
  const [captures, setCaptures] = useState<{ f: File; apercu: string }[]>([]);
  const ajouter = (fs: File[]) =>
    setCaptures((c) => [...c, ...fs.map((f) => ({ f, apercu: URL.createObjectURL(f) }))]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();
  const zone = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { zone.current?.focus(); }, []);

  // Coller une capture d'écran directement (Ctrl/Cmd + V) — le cas d'usage
  // principal : MAV fait une capture et la colle ici.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      // Chaque collage AJOUTE : on colle trois captures à la suite sans que
      // la deuxième efface la première.
      const fs = [...(e.clipboardData?.items ?? [])]
        .filter((i) => i.type.startsWith("image/"))
        .map((i) => i.getAsFile())
        .filter((f): f is File => !!f);
      if (fs.length) ajouter(fs);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const envoyer = () =>
    start(async () => {
      setErr(null);
      try {
        const fd = new FormData();
        fd.set("url", pathname);
        fd.set("page_titre", document.title || pathname);
        fd.set("selecteur", draft.selecteur);
        fd.set("element_texte", draft.elementTexte);
        fd.set("x_pct", String(draft.xPct));
        fd.set("y_pct", String(draft.yPct));
        if (draft.wPct !== undefined) fd.set("w_pct", String(draft.wPct));
        if (draft.hPct !== undefined) fd.set("h_pct", String(draft.hPct));
        fd.set("viewport_w", String(window.innerWidth));
        fd.set("gravite", gravite);
        fd.set("commentaire", commentaire);
        for (const c of captures) fd.append("capture", c.f);
        await addFeedback(fd);
        setOk(true);
        setTimeout(onClose, 900);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });

  return (
    <>
      {draft.wPct !== undefined ? (
        <span className="rv-zone draft"
          style={{ left: draft.pageX, top: draft.pageY, width: draft.pageW, height: draft.pageH }}>
          <b>✎</b>
        </span>
      ) : (
        <span className="rv-pin draft" style={{ left: draft.pageX, top: draft.pageY }}>✎</span>
      )}
      <div className="rv-panel" onClick={(e) => e.stopPropagation()}>
        <div className="rv-head">
          Signaler un écart
          <button type="button" onClick={onClose}>✕</button>
        </div>
        <div className="rv-body">
          <div className="rv-target" title={draft.selecteur}>
            {draft.wPct !== undefined
              ? `Zone entourée (${Math.round(draft.pageW)} × ${Math.round(draft.pageH)} px) : `
              : "Point visé : "}
            <b>{draft.elementTexte || draft.selecteur || "page"}</b>
          </div>
          <div className="mrow">
            {GRAVITES.map((g) => (
              <button
                key={g.key}
                type="button"
                className={`mopt${gravite === g.key ? " on" : ""}`}
                style={gravite === g.key ? { background: g.color, borderColor: g.color } : undefined}
                onClick={() => setGravite(g.key)}
              >
                {g.label}
              </button>
            ))}
          </div>
          <textarea
            ref={zone}
            className="min"
            rows={4}
            placeholder="Ce qui ne va pas et ce qui devrait s'afficher à la place…"
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
          />
          <div className="rv-paste">
            {captures.length === 0 && (
              <span>Collez une ou plusieurs captures (Ctrl/Cmd + V) ou</span>
            )}
            {captures.map((c, i) => (
              <span className="rv-vig" key={i}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.apercu} alt={`capture ${i + 1}`} />
                <button
                  type="button" className="xdel" title="Retirer cette capture"
                  onClick={() => setCaptures((v) => v.filter((_, j) => j !== i))}
                >✕</button>
              </span>
            ))}
            <label className="fadd">
              {captures.length ? "Ajouter" : "choisir des fichiers"}
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={(e) => {
                  ajouter([...(e.target.files ?? [])]);
                  // Sans ça, rechoisir le même fichier ne déclencherait rien.
                  e.target.value = "";
                }}
              />
            </label>
            {captures.length > 1 && (
              <span className="rv-cnt">{captures.length} captures</span>
            )}
          </div>
          {err && <div className="warnbox" style={{ color: "var(--red)", borderColor: "var(--red)" }}>{err}</div>}
          {ok && <div className="warnbox" style={{ color: "#3d7327", borderColor: "#b7e2ae" }}>Retour enregistré ✓</div>}
        </div>
        <div className="rv-foot">
          <span className="rv-ou">{pathname}</span>
          <button
            className="kgo"
            type="button"
            disabled={pending || !commentaire.trim()}
            style={pending || !commentaire.trim() ? { opacity: 0.5 } : undefined}
            onClick={envoyer}
          >
            <span className="ch">›</span> {pending ? "Envoi…" : "Enregistrer le retour"}
          </button>
        </div>
      </div>
    </>
  );
}
```

### 3.5 `components/revue-actions.tsx` — les actions d'un retour dans la liste

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { deleteFeedback, modifierFeedback, setFeedbackStatut } from "@/lib/bo/feedback";
import { useQuestion } from "@/components/modale";

const GRAVITES = [
  { v: "bloquant", l: "Bloquant" },
  { v: "ecart", l: "Écart" },
  { v: "detail", l: "Détail" },
  { v: "idee", l: "Idée" },
];

export function FeedbackActions({ id, statut, commentaire, gravite }: {
  id: number; statut: string;
  /** Repris tels quels dans l'éditeur : on corrige, on ne réécrit pas. */
  commentaire?: string;
  gravite?: string;
}) {
  const [pending, start] = useTransition();
  const [edite, setEdite] = useState(false);
  const [texte, setTexte] = useState(commentaire ?? "");
  const [grav, setGrav] = useState(gravite ?? "ecart");
  const [ajouts, setAjouts] = useState<File[]>([]);
  const zone = useRef<HTMLTextAreaElement>(null);
  const { confirmer, saisir, question } = useQuestion();

  const enregistrer = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("id", String(id));
      fd.set("commentaire", texte);
      fd.set("gravite", grav);
      for (const f of ajouts) fd.append("capture", f);
      await modifierFeedback(fd);
      setAjouts([]);
      setEdite(false);
    });

  if (edite) {
    return (
      <div className="fbk-edit">
        <textarea ref={zone} rows={4} value={texte} onChange={(e) => setTexte(e.target.value)}
          /* Un collage suffit à joindre une capture, comme à la saisie. */
          onPaste={(e) => {
            const f = Array.from(e.clipboardData.files).filter((x) => x.type.startsWith("image/"));
            if (f.length) setAjouts((v) => [...v, ...f]);
          }} />
        <div className="fbk-edit-l">
          {GRAVITES.map((g) => (
            <button key={g.v} type="button" className={grav === g.v ? "on" : ""}
              onClick={() => setGrav(g.v)}>{g.l}</button>
          ))}
          <span style={{ flex: 1 }} />
          <label className="fadd">
            + Image
            <input type="file" accept="image/*" multiple hidden
              onChange={(e) => setAjouts((v) => [...v, ...Array.from(e.target.files ?? [])])} />
          </label>
        </div>
        {ajouts.length > 0 && (
          <div className="fbk-edit-n">
            {ajouts.length} image{ajouts.length > 1 ? "s" : ""} à ajouter — les captures déjà là sont conservées.
          </div>
        )}
        <div className="mrow" style={{ gap: 5, marginTop: 8 }}>
          <button className="fadd" type="button" disabled={pending} onClick={() => setEdite(false)}>
            Annuler
          </button>
          <span style={{ flex: 1 }} />
          <button className="savebar-go" type="button" disabled={pending || !texte.trim()}
            onClick={enregistrer}>
            <span className="ch">›</span> Enregistrer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mrow" style={{ gap: 5, marginTop: 8 }}>
      <button className="fadd" type="button" title="Modifier le texte ou ajouter une image"
        onClick={() => setEdite(true)}>
        <svg viewBox="0 0 24 24" className="fbk-crayon" aria-hidden>
          <path d="m14.5 5.5 4 4-9 9H5.5v-4z" /><path d="M13 7 17 11" />
        </svg>
        Modifier
      </button>
      {statut !== "corrige" && (
        <button className="fadd" type="button" disabled={pending}
          onClick={() => start(() => setFeedbackStatut(id, "corrige"))}>
          Marquer corrigé
        </button>
      )}
      {statut !== "ecarte" && (
        <button className="fadd" type="button" disabled={pending}
          onClick={async () => {
            /* Comme avec l'ancien `prompt()` : annuler la question n'annule pas
               l'écart, il part simplement sans motif. */
            const r = (await saisir("Pourquoi écarter ce retour ? (optionnel)", { oui: "Écarter" })) ?? undefined;
            start(() => setFeedbackStatut(id, "ecarte", r));
          }}>
          Écarter
        </button>
      )}
      {statut !== "ouvert" && (
        <button className="fadd" type="button" disabled={pending}
          onClick={() => start(() => setFeedbackStatut(id, "ouvert"))}>
          Rouvrir
        </button>
      )}
      <button className="xdel" type="button" disabled={pending} title="Supprimer"
        onClick={async () => {
          if (!(await confirmer("Supprimer ce retour ?", { danger: true, oui: "Supprimer" }))) return;
          start(() => deleteFeedback(id));
        }}>✕</button>
      {question}
    </div>
  );
}
```

### 3.6 `components/modale.tsx` — la fenêtre partagée et `useQuestion`

Si le projet a déjà une fenêtre modale partagée avec `useQuestion`
(`confirmer`, `saisir`, `question`), la garder. Sinon, celle-ci :

```tsx
"use client";

/**
 * La fenêtre modale partagée.
 *
 *   · la fenêtre se pose dans <body> (un portail) : jamais coincée dans un
 *     conteneur qui défile ou qui la rogne ;
 *   · Échap ferme, le clic sur le fond ferme (sauf `fermeDehors={false}` pour
 *     une saisie qu'on ne veut pas perdre d'un clic malheureux) ;
 *   · un en-tête avec le titre et la croix, un corps, un pied facultatif ;
 *     `brut` rend les enfants tels quels pour les fenêtres qui ont leur propre
 *     mise en page.
 */
import { useCallback, useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Les fenêtres ouvertes, de la plus ancienne à la plus récente. */
const PILE: Array<() => void> = [];

export function Modale({
  titre, onFermer, children, pied, className, style, largeur, fermeDehors = true, entete = true, brut = false, apresTitre,
}: {
  titre?: ReactNode;
  /** Ce qui se passe quand on ferme (croix, Échap, clic dehors). Absent : pas de croix. */
  onFermer?: () => void;
  children: ReactNode;
  /** Le pied (boutons), rendu dans `.modal-f` quand il est donné. */
  pied?: ReactNode;
  /** Classes en plus sur `.modal`, pour les dessins existants. */
  className?: string;
  style?: CSSProperties;
  /** Largeur maximale en pixels ; sinon celle de la classe. */
  largeur?: number;
  /** Le clic sur le fond ferme-t-il ? Non pour une saisie longue. */
  fermeDehors?: boolean;
  /** Sans en-tête : la fenêtre dessine le sien. */
  entete?: boolean;
  /** Les enfants tels quels, sans `.modal-b`. */
  brut?: boolean;
  /** Quelque chose à ranger juste après le titre. */
  apresTitre?: ReactNode;
}) {
  /* Le portail n'existe qu'au navigateur : au rendu serveur (et pendant
     l'hydratation) on ne dessine rien, puis la fenêtre apparaît. */
  const monte = useSyncExternalStore(() => () => {}, () => true, () => false);

  /* Échap ne ferme que la fenêtre du DESSUS : une question posée au-dessus
     d'une fenêtre se ferme seule, la fenêtre de dessous reste. D'où une
     pile : la dernière ouverte a la main. */
  useEffect(() => {
    if (!onFermer) return;
    const moi = () => onFermer();
    PILE.push(moi);
    const echap = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || PILE[PILE.length - 1] !== moi) return;
      e.stopPropagation();
      moi();
    };
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("keydown", echap);
      const i = PILE.lastIndexOf(moi);
      if (i >= 0) PILE.splice(i, 1);
    };
  }, [onFermer]);

  if (!monte) return null;

  const largeurStyle: CSSProperties | undefined = largeur ? { maxWidth: largeur, width: "100%" } : undefined;
  return createPortal(
    <div
      className="modal-ov"
      onMouseDown={(e) => { if (fermeDehors && onFermer && e.target === e.currentTarget) onFermer(); }}
    >
      <div
        className={`modal${className ? ` ${className}` : ""}`}
        style={{ ...largeurStyle, ...style }}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {entete && (
          <div className="modal-h">
            <span className="modal-t">{titre}{apresTitre}</span>
            {onFermer && <button type="button" aria-label="Fermer" title="Fermer (Échap)" onClick={onFermer}>✕</button>}
          </div>
        )}
        {brut ? children : <div className="modal-b">{children}</div>}
        {pied && <div className="modal-f">{pied}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ Questions */

type Question =
  | { genre: "confirmer"; titre?: string; message: ReactNode; oui: string; non: string; danger: boolean; resolve: (v: boolean) => void }
  | { genre: "saisir"; titre?: string; message: ReactNode; placeholder?: string; initial: string; oui: string; non: string; multiligne: boolean; obligatoire: boolean; resolve: (v: string | null) => void };

/**
 * Les questions posées à l'utilisateur (les `confirm()` et `prompt()` du
 * navigateur, remplacés par la fenêtre partagée).
 *
 *   const { confirmer, saisir, question } = useQuestion();
 *   …
 *   if (!(await confirmer("Retirer ce document ?"))) return;
 *   const motif = await saisir("Motif du refus ?");   // null si annulé
 *   …
 *   return <>{…}{question}</>;
 *
 * `question` est l'élément à rendre quelque part dans le composant : c'est la
 * fenêtre, quand une question est posée, rien sinon.
 *
 * PIÈGE : ne jamais poser la question DANS une transition (`start(async …)`).
 * React retient l'écran tant que l'action court, la fenêtre n'apparaît pas et
 * la promesse n'est jamais tenue. On demande d'abord, on lance la transition
 * ensuite.
 */
export function useQuestion() {
  const [q, setQ] = useState<Question | null>(null);

  const confirmer = useCallback(
    (message: ReactNode, opts: { titre?: string; oui?: string; non?: string; danger?: boolean } = {}) =>
      new Promise<boolean>((resolve) => {
        setQ({ genre: "confirmer", message, titre: opts.titre, oui: opts.oui ?? "Oui", non: opts.non ?? "Annuler", danger: opts.danger ?? false, resolve });
      }),
    [],
  );
  const saisir = useCallback(
    (message: ReactNode, opts: { titre?: string; placeholder?: string; initial?: string; oui?: string; non?: string; multiligne?: boolean; obligatoire?: boolean } = {}) =>
      new Promise<string | null>((resolve) => {
        setQ({
          genre: "saisir", message, titre: opts.titre, placeholder: opts.placeholder, initial: opts.initial ?? "",
          oui: opts.oui ?? "Valider", non: opts.non ?? "Annuler", multiligne: opts.multiligne ?? false, obligatoire: opts.obligatoire ?? false, resolve,
        });
      }),
    [],
  );

  const question = q ? <FenetreQuestion q={q} onFin={() => setQ(null)} /> : null;
  return { confirmer, saisir, question };
}

function FenetreQuestion({ q, onFin }: { q: Question; onFin: () => void }) {
  const [valeur, setValeur] = useState(q.genre === "saisir" ? q.initial : "");
  const annuler = () => { if (q.genre === "confirmer") q.resolve(false); else q.resolve(null); onFin(); };
  const valider = () => {
    if (q.genre === "confirmer") q.resolve(true);
    else {
      if (q.obligatoire && !valeur.trim()) return;
      q.resolve(valeur);
    }
    onFin();
  };
  const peut = q.genre === "confirmer" || !q.obligatoire || valeur.trim().length > 0;
  return (
    <Modale
      titre={q.titre ?? (q.genre === "confirmer" ? "Confirmer" : "Précision")}
      onFermer={annuler}
      largeur={440}
      pied={
        <>
          <button type="button" className="fadd" onClick={annuler}>{q.non}</button>
          <button
            type="button"
            className="fadd"
            style={q.genre === "confirmer" && q.danger ? { color: "#fff", background: "var(--red)", borderColor: "var(--red)" } : { color: "#fff", background: "var(--slate)", borderColor: "var(--slate)" }}
            disabled={!peut}
            onClick={valider}
            autoFocus={q.genre === "confirmer"}
          >
            {q.oui}
          </button>
        </>
      }
    >
      <div className="qst-m">{q.message}</div>
      {q.genre === "saisir" && (
        q.multiligne ? (
          <textarea
            className="qst-i" rows={4} autoFocus value={valeur} placeholder={q.placeholder}
            onChange={(e) => setValeur(e.target.value)}
          />
        ) : (
          <input
            className="qst-i" autoFocus value={valeur} placeholder={q.placeholder}
            onChange={(e) => setValeur(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); valider(); } }}
          />
        )
      )}
    </Modale>
  );
}
```

### 3.7 `app/revue/page.tsx` — la liste

```tsx
// Synthèse des retours de recette (mode Revue) : liste par écran, statut,
// capture jointe. C'est la « todo » de fidélité au BO.
import Link from "next/link";
import { listFeedback } from "@/lib/bo/feedback";
import { FeedbackActions } from "@/components/revue-actions";

export const dynamic = "force-dynamic";

const COULEURS: Record<string, string> = {
  bloquant: "#d60000", ecart: "#e3790d", detail: "#b6a359", idee: "#3db327",
};
const LABELS: Record<string, string> = {
  bloquant: "Bloquant", ecart: "Écart", detail: "Détail", idee: "Idée",
};

export default async function RevuePage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  const { statut = "ouvert" } = await searchParams;
  const all = await listFeedback().catch(() => []);
  const rows = all.filter((f) => (statut === "tous" ? true : f.statut === statut));
  const parEcran = new Map<string, typeof rows>();
  for (const f of rows) {
    const k = f.url;
    parEcran.set(k, [...(parEcran.get(k) ?? []), f]);
  }
  const compte = (s: string) => (s === "tous" ? all.length : all.filter((f) => f.statut === s).length);

  return (
    <div className="lst-page">
      <h1 className="lst-title">Retours de recette</h1>
      <div style={{ fontSize: 12.5, color: "var(--gray-txt)", marginBottom: 10 }}>
        Pour signaler un écart : ouvrez l&apos;écran concerné, cliquez sur <b>✎ Signaler un écart</b>
        {" "}en bas à droite (ou Ctrl/Cmd + Shift + R), puis cliquez sur la zone fautive.
        Vous pouvez coller une capture de votre BO actuel directement dans la fiche (Ctrl/Cmd + V).
      </div>

      <div className="ftabs">
        {[["ouvert", "À traiter"], ["corrige", "Corrigés"], ["ecarte", "Écartés"], ["tous", "Tous"]].map(([k, l]) => (
          <Link key={k} href={`/revue?statut=${k}`} className={`ftab${statut === k ? " on" : ""}`}>
            {l}{compte(k) > 0 && <span className="n">{compte(k)}</span>}
          </Link>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="fempty">
          Aucun retour {statut === "ouvert" ? "en attente" : ""} pour l&apos;instant.
        </div>
      )}

      {[...parEcran.entries()].map(([url, items]) => (
        <div key={url}>
          <div className="fsub" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <Link className="lnk" href={url}>{url}</Link>
            <span style={{ fontWeight: 400, color: "var(--gray-lt)", fontSize: 12 }}>
              {items.length} retour{items.length > 1 ? "s" : ""}
            </span>
          </div>
          {items.map((f) => (
            <div key={f.id} className={`fb${f.statut === "corrige" ? " corrige" : ""}`}>
              <span className="fb-gr" style={{ background: COULEURS[f.gravite] }} />
              <div className="fb-main">
                <div className="fb-meta">
                  #{f.id} · {LABELS[f.gravite]} · {f.auteur} ·{" "}
                  {new Date(f.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}
                  {f.statut !== "ouvert" && ` · ${f.statut === "corrige" ? "corrigé" : "écarté"}`}
                </div>
                <div className="fb-txt">{f.commentaire}</div>
                {(f.element_texte || f.selecteur) && (
                  <div className="fb-zone">Zone : {f.element_texte || f.selecteur}</div>
                )}
                {f.reponse && (
                  <div className="fb-zone" style={{ color: "#3d7327" }}>Réponse : {f.reponse}</div>
                )}
                <FeedbackActions id={f.id} statut={f.statut} commentaire={f.commentaire} gravite={f.gravite} />
              </div>
              {/* Les retours d'avant le multi-fichiers n'ont que `capture_path` :
                  on le prend en repli pour qu'ils s'affichent comme avant. */}
              {(f.captures?.length ? f.captures : f.capture_path ? [f.capture_path] : []).map((c, i) => (
                <a key={i} href={`/api/photo?s=${encodeURIComponent(c)}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="fb-shot" src={`/api/photo?s=${encodeURIComponent(c)}`} alt={`capture ${i + 1}`} />
                </a>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

### 3.8 `app/api/photo/route.ts` — servir les captures du bucket privé

Si une route `/api/photo` existe déjà, n'y ajouter que la branche `?s=`.
Sinon :

```ts
import { NextRequest } from "next/server";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";

/** Pixel transparent : une image source cassée ne doit pas casser la page. */
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const pixel = () =>
  new Response(new Uint8Array(PIXEL), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=300" },
  });

export async function GET(req: NextRequest) {
  // Fichiers du bucket privé Supabase (`bo-files`) : ?s=<chemin dans le bucket>
  const s = req.nextUrl.searchParams.get("s");
  if (!s) return new Response("missing s", { status: 400 });
  if (s.includes("..")) return new Response("bad path", { status: 400 });
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return new Response("storage indisponible", { status: 503 });
  const upstream = await fetch(`${SB_URL}/storage/v1/object/bo-files/${s}`, {
    headers: { Authorization: `Bearer ${key}` },
    next: { revalidate: 86400 },
  });
  if (!upstream.ok) return pixel();
  const type = upstream.headers.get("Content-Type") ?? "application/octet-stream";
  const nom = s.split("/").pop() || "document";
  return new Response(upstream.body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `inline; filename="${nom.replace(/"/g, "")}"`,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
```

### 3.9 `app/layout.tsx` — le montage

Dans le layout racine (composant serveur `async`), juste après le contenu
principal, à l'intérieur du `<body>` :

```tsx
import { RevueButton } from "@/components/revue";
import { listFeedbackOuverts } from "@/lib/bo/feedback";
…
            {children}
            <RevueButton pins={await listFeedbackOuverts().catch(() => [])} />
```

Le bouton doit être **sur toutes les pages** de la preview, y compris `/revue`.

### 3.10 Le CSS (dans `app/globals.css`)

Deux blocs. Le premier est l'outil lui-même, à copier tel quel. Le second,
ce sont les classes partagées qu'il utilise : **ne redéclarer que celles qui
n'existent pas déjà** dans le projet (garder le dessin du projet si elles
existent).

```css
/* --- Mode Revue (retours de recette posés sur les écrans) --- */
body.rv-armed, body.rv-armed * { cursor: crosshair !important; user-select: none !important; }
body.rv-armed::after {
  content: "Mode Revue — entourez la zone concernée en glissant la souris, ou cliquez pour une épingle (Échap pour annuler)";
  position: fixed; inset: 0 0 auto 0; z-index: 998;
  background: rgba(214, 0, 0, .92); color: #fff;
  font-family: var(--font-title); font-size: 12.5px; font-weight: 600;
  text-align: center; padding: 6px;
}
body.rv-armed { outline: 3px solid var(--red); outline-offset: -3px; }

.rv-fab {
  position: fixed; right: 16px; bottom: calc(var(--bottbar-h) + 14px); z-index: 999;
  display: flex; align-items: center; gap: 6px;
}
.rv-btn {
  border: 0; border-radius: 20px; padding: 9px 16px;
  background: var(--slate); color: #fff;
  font-family: var(--font-title); font-size: 12.5px; font-weight: 600;
  box-shadow: 0 3px 10px rgba(0, 0, 0, .22);
}
.rv-btn:hover { background: #38434e; }
.rv-btn.on { background: var(--red); }
.rv-chip {
  border: 1px solid var(--line); background: #fff; color: var(--slate);
  border-radius: 20px; padding: 7px 12px; font-size: 12px; font-weight: 600;
  text-decoration: none; box-shadow: 0 2px 6px rgba(0, 0, 0, .12);
}

.rv-pin {
  position: absolute; z-index: 997;
  transform: translate(-50%, -50%);
  width: 22px; height: 22px; border-radius: 50% 50% 50% 2px;
  background: var(--orange); color: #fff;
  font-size: 11px; font-weight: 700; font-family: var(--font-body);
  display: grid; place-items: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, .3);
  cursor: help;
}
.rv-pin.draft { background: var(--red); z-index: 1001; }

.rv-panel {
  position: fixed; right: 16px; bottom: calc(var(--bottbar-h) + 60px); z-index: 1000;
  width: 380px; max-width: calc(100vw - 32px);
  background: #fff; border: 1px solid var(--line); border-radius: 8px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, .28);
  display: flex; flex-direction: column; max-height: 78vh;
}
.rv-head {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--slate); color: #fff; border-radius: 7px 7px 0 0;
  padding: 10px 14px; font-family: var(--font-title); font-size: 13.5px; font-weight: 600;
}
.rv-head button { border: 0; background: none; color: #fff; font-size: 14px; }
/* `min-height: 0` n'est pas décoratif : sans lui, un enfant qui défile dans
   une colonne flex refuse de se comprimer sous la taille de son contenu. Le
   corps poussait alors le pied hors du panneau et le bouton Enregistrer
   disparaissait dès qu'on collait deux captures. */
.rv-body { flex: 1 1 auto; min-height: 0; padding: 12px 14px; overflow: auto; }
.rv-body .mrow { margin-bottom: 8px; }
.rv-target {
  font-size: 12px; color: var(--gray-txt); background: #f6f6f4;
  border-radius: 4px; padding: 6px 9px; margin-bottom: 10px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.rv-paste {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  border: 1px dashed var(--line); border-radius: 5px; padding: 8px;
  margin-top: 8px; font-size: 12px; color: var(--gray-txt);
}
.rv-paste img { max-height: 90px; border-radius: 4px; border: 1px solid var(--line); display: block; }
/* Une vignette par capture, chacune retirable : on en colle trois, on en
   enlève une sans devoir tout recommencer. */
.rv-vig { position: relative; display: inline-block; }
.rv-vig .xdel {
  position: absolute; top: -6px; right: -6px; width: 18px; height: 18px;
  border-radius: 50%; background: #fff; border: 1px solid var(--line);
  line-height: 1; font-size: 10px; cursor: pointer; padding: 0;
}
.rv-cnt { font-size: 11.5px; color: var(--gray-txt); }
/* Le bouton est centré dans le panneau : c'est le geste principal, il n'a pas
   à être poussé dans un coin par le chemin de la page. */
.rv-foot {
  flex: none;
  display: flex; flex-direction: column; align-items: center; gap: 7px;
  padding: 10px 14px; border-top: 1px solid var(--line);
}
.rv-foot .rv-ou { font-size: 11.5px; color: var(--gray-lt); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rv-foot .kgo { justify-content: center; min-width: 210px; }

/* Fiche de retour dans la page /revue */
.fb { display: flex; gap: 12px; border: 1px solid var(--line-lt); border-radius: 6px; padding: 12px 14px; margin-bottom: 10px; background: #fff; }
.fb.corrige { opacity: .55; }
.fb .fb-gr { flex: none; width: 8px; border-radius: 4px; }
.fb .fb-main { flex: 1; min-width: 0; }
.fb .fb-meta { font-size: 11.5px; color: var(--gray-lt); margin-bottom: 4px; }
.fb .fb-txt { font-size: 13.5px; color: var(--slate); white-space: pre-wrap; }
.fb .fb-zone { font-size: 12px; color: var(--gray-txt); margin-top: 4px; }
.fb img.fb-shot { max-width: 220px; max-height: 150px; border: 1px solid var(--line); border-radius: 4px; }

/* --- Mode Revue : sélection rectangulaire libre --- */
.rv-zone {
  position: absolute; z-index: 997;
  /* Même réaffichée, la zone laisse passer les clics : seule la pastille
     numérotée capte la souris. */
  pointer-events: none;
  border: 2px solid var(--orange); border-radius: 3px;
  background: rgba(227, 121, 13, .10);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, .55) inset;
}
.rv-zone b, .rv-pin { pointer-events: auto; cursor: help; }
.rv-zone b {
  position: absolute; left: -2px; top: -2px;
  min-width: 20px; height: 18px; padding: 0 5px;
  display: grid; place-items: center;
  background: var(--orange); color: #fff;
  font-size: 11px; font-weight: 700; font-family: var(--font-body);
  border-radius: 3px 0 3px 0;
}
.rv-zone.trace, .rv-zone.draft {
  z-index: 1001; border-color: var(--red); background: rgba(214, 0, 0, .10);
  pointer-events: none;
}
.rv-zone.trace b, .rv-zone.draft b { background: var(--red); white-space: nowrap; }

/* --- Corriger un retour depuis la revue --- */
.fbk-crayon { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; margin-right: 5px; }
.fbk-edit { margin-top: 10px; border: 1px solid var(--gold-bo); border-radius: 5px; padding: 10px; background: #fbfaf7; }
.fbk-edit textarea {
  width: 100%; box-sizing: border-box; border: 1px solid #cfcfcf; border-radius: 4px;
  padding: 8px 10px; font-family: var(--font-body); font-size: 13px; color: var(--slate);
  line-height: 1.55; resize: vertical;
}
.fbk-edit textarea:focus { border-color: var(--gold-bo); outline: none; }
.fbk-edit-l { display: flex; align-items: center; gap: 5px; margin-top: 8px; flex-wrap: wrap; }
.fbk-edit-l button {
  border: 1px solid #cfcfcf; border-radius: 99px; background: #fff; cursor: pointer;
  padding: 4px 11px; font-family: var(--font-title); font-size: 11.5px; color: var(--gray-txt);
}
.fbk-edit-l button.on { background: var(--slate); border-color: var(--slate); color: #fff; }
.fbk-edit-n { margin-top: 7px; font-size: 11.5px; color: var(--gray-txt); }
```

Classes et variables partagées, **seulement si le projet ne les a pas** (si
le projet a sa propre palette, garder ses valeurs pour `--slate`, `--red`,
etc. — ce sont les noms qui comptent) :

```css
:root {
  --slate: #44525f; --slate-2: #4e5b67;
  --gray-txt: #6c7781; --gray-lt: #b9bdc2;
  --red: #d60000; --orange: #e3790d; --green: #3db327; --gold-bo: #b6a359;
  --chip: #e3e3e3; --line: #e3e3e3; --line-lt: #ececec;
  --font-title: "Poppins", -apple-system, "Segoe UI", sans-serif;
  --font-body: "Lato", -apple-system, "Segoe UI", sans-serif;
  --bottbar-h: 0px; /* hauteur d'une barre fixe en bas de page, s'il y en a une */
}

.mrow { display: flex; gap: 6px; flex-wrap: wrap; }
.mopt { border: 1px solid var(--line); border-radius: 4px; background: #fff; color: var(--slate-2); font-size: 12.5px; font-weight: 700; padding: 6px 11px; }
.mopt.on { background: var(--slate); border-color: var(--slate); color: #fff; }
.min { width: 100%; border: 1px solid var(--line); border-radius: 4px; padding: 8px 10px; font: inherit; font-size: 13.5px; color: var(--slate); background: #fff; outline: none; }
.min:focus { border-color: var(--red); }
.warnbox { border: 1px solid #e5c98a; background: #fdf6e5; color: #8a6d1a; border-radius: 4px; padding: 10px 13px; font-size: 12.5px; margin-top: 14px; }
.kgo { border: 1px solid var(--line); border-radius: 4px; background: #fff; color: var(--slate); font-family: var(--font-title); font-size: 14px; font-weight: 600; height: 34px; padding: 0 14px; display: inline-flex; align-items: center; gap: 7px; cursor: pointer; }
.kgo:hover { background: #f6f6f6; }
.kgo .ch { font-weight: 700; }
.fadd { border: 1px solid #cfcfcf; background: #fff; border-radius: 4px; font-family: var(--font-title); font-size: 12.5px; font-weight: 600; color: var(--slate-2); padding: 5px 10px; cursor: pointer; white-space: nowrap; }
.fadd:hover { background: #f6f6f6; }
.xdel { border: 0; background: none; color: var(--gray-lt); font-size: 13px; cursor: pointer; padding: 2px 5px; border-radius: 3px; }
.xdel:hover { color: var(--red); background: #fdeaea; }
.savebar-go { border: 0; background: var(--green); color: #fff; border-radius: 4px; padding: 9px 20px; font-family: var(--font-title); font-size: 13.5px; font-weight: 700; cursor: pointer; }
.savebar-go:disabled { opacity: .55; cursor: default; }
.ftabs { display: flex; justify-content: center; gap: 2px; border-bottom: 1px solid var(--line); margin: 2px 0 12px; }
.ftab { font-family: var(--font-title); font-size: 13px; font-weight: 600; color: var(--gray-txt); background: none; border: 0; border-bottom: 2px solid transparent; padding: 7px 12px 8px; cursor: pointer; text-decoration: none; }
.ftab:hover { color: var(--slate); }
.ftab.on { color: var(--slate); border-bottom-color: #b6a359; }
.ftab .n { margin-left: 6px; background: var(--chip); border-radius: 8px; font-size: 10.5px; padding: 1px 6px; color: var(--slate-2); }
.fempty { color: var(--gray-lt); font-size: 13px; text-align: center; padding: 26px 0; }
.fsub { font-family: var(--font-title); font-size: 13px; font-weight: 700; color: var(--slate); margin: 4px 0 8px; }
.lnk { color: #2f6fb1; text-decoration: underline; }
.lst-page { max-width: 1040px; margin: 0 auto; padding: 22px 26px 60px; }
.lst-title { font-family: var(--font-title); font-size: 22px; font-weight: 700; color: var(--slate); margin-bottom: 14px; }

/* La fenêtre partagée (components/modale.tsx) */
.modal-ov { position: fixed; inset: 0; z-index: 60; background: rgba(30, 30, 30, .55); display: grid; place-items: start center; padding: 60px 16px; overflow-y: auto; }
.modal { background: #fff; border-radius: 6px; width: 100%; max-width: 560px; box-shadow: 0 18px 50px rgba(0, 0, 0, .3); }
.modal-h { display: flex; align-items: center; justify-content: space-between; padding: 13px 18px; border-bottom: 1px solid var(--line); font-family: var(--font-title); font-weight: 600; font-size: 15px; color: var(--slate); }
.modal-h button { border: 0; background: none; color: var(--gray-lt); font-size: 15px; cursor: pointer; }
.modal-b { padding: 16px 18px; }
.modal-f { display: flex; justify-content: space-between; align-items: center; padding: 12px 18px; border-top: 1px solid var(--line); background: #fafafa; border-radius: 0 0 6px 6px; }
.qst-m { font-size: 14px; color: var(--slate); line-height: 1.5; white-space: pre-line; }
.qst-i { display: block; width: 100%; margin-top: 12px; border: 1px solid var(--line); border-radius: 4px; padding: 8px 10px; font: inherit; font-size: 14px; }
.qst-i:focus { outline: none; border-color: var(--gold-bo); }
```

### 3.11 Vérifier l'installation

`npx tsc --noEmit`, `npm run build`, puis en local : le bouton est en bas à
droite de chaque page ; Ctrl/Cmd + Shift + R arme le mode ; tracer un
rectangle ouvre la fiche ; enregistrer un retour crée une ligne dans
`bo_feedback` ; `/revue` l'affiche ; une capture collée apparaît dans la liste.
Livrer l'outil comme n'importe quel lot (section 1), et c'est le premier
document avant / après du projet (section 4), avec un volet « avant » en texte
puisque l'écran n'existait pas.

---

## 4. Le document avant / après — à chaque lot livré

Dès qu'un **lot de modifications** est livré — plusieurs corrections d'un
coup, qu'elles soient arrivées **en direct dans la conversation** ou **via
l'outil de retours** — le travail n'est pas fini tant que le document n'est pas
publié en **Artifact** et le lien donné. **Sans le demander.**

### 4.1 Ce que le document contient, dans cet ordre

1. **Le relevé** — une ligne par modification, dans la numérotation de MAV
   quand elle existe (`#489`, `#490`…), avec ce qui est fait et la mention
   **« vérifié »** (ou « en attente » si c'est un arbitrage qui lui revient).
2. **Les comparaisons avant / après** — des captures **réelles**, prises au
   navigateur sur les **deux versions construites** : l'ancienne servie depuis
   un worktree du commit d'avant, la nouvelle depuis le build courant, sur le
   même écran et les mêmes données. Les deux commits sont cités dans le
   document.
3. **Ce qu'il faut savoir** — les arbitrages pris sans lui, les vrais défauts
   trouvés en chemin, ce qui reste en pause.

### 4.2 Règles non négociables

- **Aucune capture fabriquée ni décorative.** Si un écran n'existait pas
  avant, le volet « avant » est un **texte** qui dit ce que faisait l'ancienne
  version — avec le libellé exact de l'alerte ou du message s'il y en avait un
  — jamais une image de rien.
- **Écarter les paires trompeuses** : deux captures identiques au pixel près
  (le changement est un comportement, pas un dessin), ou une capture qui ne
  montre pas ce dont parle la légende. Mieux vaut huit comparaisons vraies que
  douze dont trois mentent. Un changement sans dessin (un acheminement, une
  règle de synchro) se décrit en deux volets de texte.
- **Pas de données personnelles inutiles** dans les captures : flouter les
  noms, e-mails, téléphones qui ne démontrent rien (filtre CSS `blur` sur les
  sélecteurs concernés avant la capture).
- **Un revirement de MAV se dit dans le document**, pas seulement dans le
  commit : la ligne du relevé porte la mention, et la capture « après » est
  refaite.
- Le document se **met à jour à la même adresse** (republier l'Artifact sur la
  même URL) quand un retour arrive après coup — jamais un second lien.
- Les images partent en **data: URI base64** dans la page : la CSP des
  Artifacts bloque toute image externe.
- Le récap de fin de lot donne : le lien du document, les deux commits, et
  l'état du déploiement Vercel de `main` (« Ready »).

### 4.3 La recette des captures (à reprendre telle quelle)

Dépendances : `puppeteer-core` dans le projet (`npm i -D puppeteer-core`) et
le Chromium préinstallé de l'environnement (`/opt/pw-browsers/chromium`).
Tout ce qui suit se range dans le dossier scratchpad de la session, pas dans
le dépôt.

**1. Les deux versions construites.**

```bash
# L'ancienne : worktree sur le commit d'avant le lot, node_modules partagés
git worktree add /home/user/wt-avant <sha-avant>
cp -al node_modules /home/user/wt-avant/node_modules
(cd /home/user/wt-avant && npm run build)
# La nouvelle : le dépôt courant
npm run build
```

**2. Deux serveurs sur deux ports.** Un serveur démarré dans une commande
lancée « en arrière-plan » meurt avec elle : lancer avec `setsid nohup` dans
une commande ordinaire, et vérifier qu'ils répondent.

```bash
(cd /home/user/wt-avant && setsid nohup npx next start -p 3101 > /tmp/avant.log 2>&1 &)
setsid nohup npx next start -p 3102 > /tmp/apres.log 2>&1 &
sleep 4; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3101/; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3102/
```

Les variables d'environnement (`.env.local`) doivent être présentes dans les
deux dossiers pour que les pages lisent les mêmes données.

**3. Le script de capture** (`cap.mjs`, lancé deux fois :
`node cap.mjs 3101 avant` puis `node cap.mjs 3102 apres`). Squelette :

```js
// Captures sur une version construite. usage: node cap.mjs <port> <prefixe>
import { createRequire } from "node:module";
const require = createRequire("/home/user/<projet>/package.json");
const puppeteer = require("puppeteer-core");
const [port, prefixe] = process.argv.slice(2);
const dir = new URL(".", import.meta.url).pathname;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 1500, height: 1100, deviceScaleFactor: 1.5 });

// Les POST sont coupés : une capture ne doit jamais écrire en base. Mettre
// `laisserPost = true` le temps d'une action serveur en LECTURE seule.
await p.setRequestInterception(true);
let laisserPost = false;
p.on("request", (r) => { if (r.method() === "POST" && !laisserPost) r.abort(); else r.continue(); });

// Cacher ce qui n'est pas l'objet de la capture (barres fixes, bouton de retours).
const cacher = () => p.addStyleTag({ content: ".rv-fab, .rv-chip, .rv-pin, .rv-zone { display: none !important; }" });
// Flouter les données personnelles.
const flou = (sel) => p.addStyleTag({ content: `${sel} { filter: blur(6px) !important; }` });
// Cliquer un bouton par le début de son texte.
const bouton = (t) => p.evaluate((t) => { const e = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith(t)); if (!e) return false; e.click(); return true; }, t);
// Capturer un élément : `el.screenshot()` et non un clip de page — dans un
// conteneur qui défile, le clip de page dérive.
const clip = async (nom, sel) => {
  const el = await p.$(sel);
  if (!el) { console.log("absent", nom, sel); return false; }
  await el.evaluate((e) => e.scrollIntoView({ block: "start" }));
  await wait(500);
  await el.screenshot({ path: `${dir}${prefixe}-${nom}.png` });
  console.log("ok", nom); return true;
};
const go = async (url) => { await p.goto(`http://localhost:${port}${url}`, { waitUntil: "networkidle2", timeout: 300000 }); await wait(2500); await cacher(); };

/* Une scène par comparaison : même URL, mêmes données, même sélecteur. */
await go("/");
await flou(".nom-du-contact, .email");
await clip("dashboard", ".wrap");

await go("/bien/<id>");
await bouton("Propriétaire"); await wait(1500);
await clip("proprietaire", ".pr-cadre");

await b.close();
```

Après coup, **ouvrir chaque image** avec l'outil de lecture pour vérifier
qu'elle montre bien ce que dira la légende ; écarter celles qui ne le montrent
pas.

**4. Le gabarit HTML** (`gabarit.html`) avec `{{img:nom}}` à la place de
chaque image, et l'assembleur `build-doc.mjs` qui remplace par le base64 :

```js
// Assemble un document : gabarit + captures en data: URI. usage: node build-doc.mjs <gabarit.html> <sortie.html>
import { readFileSync, writeFileSync } from "node:fs";
const dir = new URL(".", import.meta.url).pathname;
const [src, out] = process.argv.slice(2);
let html = readFileSync(`${dir}${src}`, "utf8");
html = html.replace(/\{\{img:([a-zA-Z0-9/-]+)\}\}/g, (_, n) => `data:image/png;base64,${readFileSync(`${dir}${n}.png`).toString("base64")}`);
writeFileSync(`${dir}${out}`, html);
console.log(`${out} : ${Math.round(html.length / 1024)} Ko`);
```

Le gabarit, à reprendre tel quel (titre, sous-titre avec les deux commits,
relevé en tableau, paires avant / après en deux colonnes, « Ce qu'il faut
savoir ») :

```html
<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sociétés et propriétaires</title>
<style>
:root{--ink:#2b2f36;--muted:#6c7781;--line:#e3e3e3;--gold:#b6a359;--bg:#fafafa;--card:#fff;--ok:#2f7d4a;--ko:#b3412f}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--ink:#e8e6e1;--muted:#a3a7ad;--line:#3a3d43;--bg:#1d1f23;--card:#26292e;--ok:#7fc795;--ko:#e08a7a}}
:root[data-theme="dark"]{--ink:#e8e6e1;--muted:#a3a7ad;--line:#3a3d43;--bg:#1d1f23;--card:#26292e;--ok:#7fc795;--ko:#e08a7a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 "Lato",-apple-system,"Segoe UI",sans-serif}
main{max-width:1100px;margin:0 auto;padding:32px 16px 60px}
h1{font-family:"Poppins",-apple-system,sans-serif;font-size:26px;margin:0 0 4px;text-wrap:balance}
.sous{color:var(--muted);margin:0 0 22px;font-size:14px;max-width:85ch}
h2{font-family:"Poppins",-apple-system,sans-serif;font-size:17px;margin:36px 0 8px;color:var(--gold)}
h3{font-family:"Poppins",-apple-system,sans-serif;font-size:14.5px;margin:22px 0 8px}
.deux{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:760px){.deux{grid-template-columns:1fr}}
figure{margin:0 0 14px;background:var(--card);border:1px solid var(--line);border-radius:6px;overflow:hidden}
figure img{display:block;width:100%;height:auto}
figcaption{font-family:"Poppins",sans-serif;font-size:11.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);padding:7px 10px;border-bottom:1px solid var(--line)}
figcaption b{color:var(--ink)}
.txt{padding:12px 14px;font-size:14px}.txt p{margin:0 0 8px}.txt p:last-child{margin:0}
.msg{display:block;margin:6px 0;padding:8px 10px;border-left:3px solid var(--ko);background:var(--bg);font-size:13.5px}
.msg.ok{border-left-color:var(--ok)}
ul{padding-left:20px;max-width:90ch}li{margin-bottom:6px}
table{width:100%;border-collapse:collapse;font-size:14px;background:var(--card);border:1px solid var(--line);margin-bottom:10px}
th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}th{font-family:"Poppins",sans-serif;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.ok{color:var(--ok);font-weight:600}.att{color:var(--muted);font-weight:600}
code{font-size:13px;background:var(--card);border:1px solid var(--line);border-radius:3px;padding:1px 5px}
q{font-style:italic}
</style></head><body><main>
<h1>Sociétés et propriétaires</h1>
<p class="sous">Lot du 20/10 — retours #489 à #494 de l'outil de correction, plus le relais e-mail demandé dans la conversation. Captures prises sur les deux versions construites, mêmes écrans, mêmes données : l'ancienne depuis le commit <code>ba3d08a</code>, la nouvelle depuis <code>3383e59</code>.</p>

<h2>Le relevé</h2>
<table>
<tr><th style="width:9em">Retour</th><th>Ce qui est fait</th><th style="width:7em">État</th></tr>
<tr><td>#494 Ombres du dashboard</td><td>Les trois barres portent l'ombre de l'ancien BO : nette au contact, diffuse en dessous.</td><td class="ok">vérifié</td></tr>
<tr><td>#481 Tableau de l'état locatif</td><td>Toujours en attente de votre choix entre les versions A, B et C.</td><td class="att">en attente</td></tr>
</table>

<h2>Avant / après</h2>

<h3>#494 — Le dashboard</h3>
<p class="sous">Même écran, cartes floutées : ce qui change est l'ombre sous chaque barre.</p>
<div class="deux">
<figure><figcaption><b>Avant</b></figcaption><img src="{{img:avant-dashboard}}" alt="Dashboard avant"></figure>
<figure><figcaption><b>Après</b></figcaption><img src="{{img:apres-dashboard}}" alt="Dashboard après"></figure>
</div>

<h3>#489 — La fiche société</h3>
<div class="deux">
<figure><figcaption><b>Avant</b></figcaption><div class="txt"><p>Cet écran n'existait pas. Une société n'était qu'un jeu de cases sur une fiche contact : rien ne disait qui d'autre y était associé.</p></div></figure>
<figure><figcaption><b>Après</b> — identité, associés et fonctions, immeubles détenus, mandats signés</figcaption><img src="{{img:apres-societe}}" alt="Fiche société"></figure>
</div>

<h2>Ce qu'il faut savoir</h2>
<ul>
<li><b>Un arbitrage pris sans vous.</b> …</li>
<li><b>#481 reste ouvert</b> jusqu'à votre choix entre A, B et C.</li>
</ul>
</main></body></html>
```

```bash
node build-doc.mjs gabarit.html document.html
```

**5. Publier** `document.html` avec l'outil Artifact (titre court, deux à
quatre mots, qui nomme le lot ; par exemple « Sociétés et propriétaires »).
Pour une mise à jour après un retour tardif : republier sur la **même URL**.

**6. Nettoyer** : arrêter les deux serveurs (retrouver les processus par
`pgrep -f "^next-server"` et leur dossier dans `/proc/<pid>/cwd`, jamais un
`pkill -f` avec une chaîne qui matcherait le shell), puis
`git worktree remove --force /home/user/wt-avant` (il pèse ~900 Mo).

---

## 5. Le récap de fin de lot (le message à MAV)

Court, en français, et il tient seul :

- ce qui est livré, retour par retour, dans sa numérotation ;
- les questions qui lui reviennent (arbitrages), une ligne chacune ;
- le lien du document avant / après ;
- les commits (avant / après), et « déploiement Vercel de `main` : Ready » ;
- ce que tu as écarté ou laissé en pause, et pourquoi.

Pas de « souhaitez-vous que… » : le lot est fait, le document est publié,
les retours sont passés en `corrige`. S'il manque quelque chose, c'est dit
noir sur blanc, pas suggéré.
