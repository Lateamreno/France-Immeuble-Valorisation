"use client";

// Les gestes d'écriture de la page Acquisition (lot 2). Chaque geste demande
// confirmation, passe par la même porte que Claude (appliquerAds → garde-fous
// → Google → journal), puis relit la page.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQuestion } from "@/components/modale";
import { annulerAds, appliquerAds, chercherZonesAds, poserPlafondAds } from "@/lib/bo/google-ads-actions";
import type { Changement, Correspondance } from "@/lib/bo/google-ads-changements";

function useAds() {
  const router = useRouter();
  const { confirmer, saisir, question } = useQuestion();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texte: string } | null>(null);
  const lancer = (changements: Changement[]) =>
    start(async () => {
      const r = await appliquerAds(changements);
      const echec = r.resultats.find((x) => !x.ok);
      setMsg(r.ok ? { ok: true, texte: r.resultats.length > 1 ? `${r.resultats.length} changements appliqués.` : "Appliqué chez Google." } : { ok: false, texte: echec?.message ?? r.message ?? "Échec." });
      router.refresh();
    });
  const retour = msg ? <span className={`acq-msg ${msg.ok ? "ok" : "ko"}`} role="status">{msg.texte}</span> : null;
  return { confirmer, saisir, question, pending, lancer, retour, setMsg, router, start };
}

/** Un bouton qui applique des changements après confirmation. */
export function BoutonAds({ changements, children, confirmation, danger, titre }: {
  changements: Changement[]; children: React.ReactNode; confirmation: string; danger?: boolean; titre?: string;
}) {
  const a = useAds();
  return (
    <>
      <button type="button" className={`acq-btn${danger ? " danger" : ""}`} disabled={a.pending} title={titre}
        onClick={async () => { if (await a.confirmer(confirmation, { titre: "Google Ads", oui: "Appliquer", danger })) a.lancer(changements); }}>
        {a.pending ? "…" : children}
      </button>
      {a.retour}
      {a.question}
    </>
  );
}

/** Saisir un nombre puis appliquer : budget, modulation. */
export function SaisieAds({ libelle, question, initial, suffixe, fabrique }: {
  libelle: string; question: string; initial: string; suffixe: string;
  fabrique: (n: number) => Changement;
}) {
  const a = useAds();
  return (
    <>
      <button type="button" className="acq-btn" disabled={a.pending} onClick={async () => {
        const v = await a.saisir(question, { titre: "Google Ads", initial, oui: "Appliquer", placeholder: suffixe, obligatoire: true });
        if (v === null) return;
        const n = Number(v.replace(",", ".").replace(/[^\d.+-]/g, ""));
        if (!Number.isFinite(n)) { a.setMsg({ ok: false, texte: "Nombre illisible." }); return; }
        a.lancer([fabrique(n)]);
      }}>{a.pending ? "…" : libelle}</button>
      {a.retour}
      {a.question}
    </>
  );
}

/** Changer la page d'arrivée d'une annonce. */
export function UrlAds({ ressource, url }: { ressource: string; url: string }) {
  const a = useAds();
  return (
    <>
      <button type="button" className="acq-btn" disabled={a.pending} onClick={async () => {
        const v = await a.saisir("Nouvelle page d'arrivée (https://…france-immeuble.fr/…)", { titre: "Google Ads", initial: url, oui: "Appliquer", obligatoire: true });
        if (v && v.trim() !== url) a.lancer([{ type: "annonce_url", ressource, url: v.trim() }]);
      }}>{a.pending ? "…" : "Changer"}</button>
      {a.retour}
      {a.question}
    </>
  );
}

const CORR: [Correspondance, string][] = [["exact", "Exact [ ]"], ["expression", "Expression \" \""], ["large", "Large"]];

/** Ajouter un mot-clé (dans un groupe) ou une exclusion (sur une campagne). */
export function AjoutMotAds({ genre, cibles }: { genre: "mot_cle" | "exclusion"; cibles: { ressource: string; nom: string }[] }) {
  const a = useAds();
  const [cible, setCible] = useState(cibles[0]?.ressource ?? "");
  const [texte, setTexte] = useState("");
  const [corr, setCorr] = useState<Correspondance>("exact");
  if (!cibles.length) return null;
  const choix = genre === "mot_cle" ? CORR.filter(([c]) => c !== "large") : CORR;
  return (
    <form className="acq-ajout" onSubmit={(ev) => {
      ev.preventDefault();
      const t = texte.trim();
      if (!t) return;
      a.lancer([genre === "mot_cle"
        ? { type: "mot_cle_ajouter", groupe: cible, texte: t, correspondance: corr }
        : { type: "exclure", campagne: cible, texte: t, correspondance: corr }]);
      setTexte("");
    }}>
      <select value={cible} onChange={(e) => setCible(e.target.value)} aria-label={genre === "mot_cle" ? "Groupe d'annonces" : "Campagne"}>
        {cibles.map((c) => <option key={c.ressource} value={c.ressource}>{c.nom}</option>)}
      </select>
      <input value={texte} onChange={(e) => setTexte(e.target.value)} placeholder={genre === "mot_cle" ? "vendre immeuble paris" : "location"} aria-label="Texte" />
      <select value={corr} onChange={(e) => setCorr(e.target.value as Correspondance)} aria-label="Correspondance">
        {choix.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
      </select>
      <button type="submit" className="acq-btn plein" disabled={a.pending || !texte.trim()}>{a.pending ? "…" : genre === "mot_cle" ? "Ajouter le mot-clé" : "Exclure"}</button>
      {a.retour}
    </form>
  );
}

/** Chercher une zone Google puis la cibler ou l'exclure sur une campagne. */
export function AjoutZoneAds({ campagnes }: { campagnes: { ressource: string; nom: string }[] }) {
  const a = useAds();
  const [camp, setCamp] = useState(campagnes[0]?.ressource ?? "");
  const [q, setQ] = useState("");
  const [zones, setZones] = useState<{ ressource: string; nom: string; type: string }[] | null>(null);
  if (!campagnes.length) return null;
  return (
    <div className="acq-zone-aj">
      <form className="acq-ajout" onSubmit={(ev) => {
        ev.preventDefault();
        a.start(async () => setZones(await chercherZonesAds(q)));
      }}>
        <select value={camp} onChange={(e) => setCamp(e.target.value)} aria-label="Campagne">
          {campagnes.map((c) => <option key={c.ressource} value={c.ressource}>{c.nom}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Paris, Hauts-de-Seine, 92…" aria-label="Zone" />
        <button type="submit" className="acq-btn plein" disabled={a.pending || q.trim().length < 2}>{a.pending ? "…" : "Chercher"}</button>
        {a.retour}
      </form>
      {zones && (
        <ul className="acq-zones">
          {zones.length === 0 && <li className="acq-gris">Aucune zone trouvée.</li>}
          {zones.map((z) => (
            <li key={z.ressource}>
              <span>{z.nom} <span className="acq-gris">· {z.type.toLowerCase()}</span></span>
              <button type="button" className="acq-btn" disabled={a.pending} onClick={() => a.lancer([{ type: "zone_ajouter", campagne: camp, zone: z.ressource, nom: z.nom }])}>Cibler</button>
              <button type="button" className="acq-btn danger" disabled={a.pending} onClick={() => a.lancer([{ type: "zone_ajouter", campagne: camp, zone: z.ressource, nom: z.nom, exclue: true }])}>Exclure</button>
            </li>
          ))}
        </ul>
      )}
      {a.question}
    </div>
  );
}

export function PlafondAds({ plafond }: { plafond: number | null }) {
  const a = useAds();
  return (
    <>
      <button type="button" className="acq-btn" disabled={a.pending} onClick={async () => {
        const v = await a.saisir("Plafond de dépense par jour, en euros : la somme des budgets des campagnes actives ne pourra jamais le dépasser, ni depuis le BO, ni par Claude. Laissez vide pour le retirer (plus aucune hausse possible).", { titre: "Plafond Google Ads", initial: plafond ? String(plafond) : "", oui: "Enregistrer" });
        if (v === null) return;
        const n = v.trim() ? Number(v.replace(",", ".").replace(/[^\d.]/g, "")) : null;
        a.start(async () => {
          const r = await poserPlafondAds(n);
          a.setMsg(r.ok ? { ok: true, texte: "Plafond enregistré." } : { ok: false, texte: r.message ?? "Échec." });
          a.router.refresh();
        });
      }}>{plafond ? "Modifier" : "Poser le plafond"}</button>
      {a.retour}
      {a.question}
    </>
  );
}

export function AnnulerAds({ id, libelle }: { id: number; libelle: string }) {
  const a = useAds();
  return (
    <>
      <button type="button" className="acq-btn" disabled={a.pending} onClick={async () => {
        if (!(await a.confirmer(`Défaire : ${libelle} ?`, { titre: "Google Ads", oui: "Annuler ce changement" }))) return;
        a.start(async () => {
          const r = await annulerAds(id);
          a.setMsg(r.ok ? { ok: true, texte: "Annulé." } : { ok: false, texte: r.message ?? "Échec." });
          a.router.refresh();
        });
      }}>{a.pending ? "…" : "Annuler"}</button>
      {a.retour}
      {a.question}
    </>
  );
}
