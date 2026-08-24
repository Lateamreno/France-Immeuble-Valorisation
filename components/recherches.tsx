"use client";

/* Écran Recherches — reprise du BO (retours #116 et #117).
 *
 * Une carte doit répondre à quatre questions d'un coup d'œil : à qui la
 * recherche appartient, où elle porte, ce qu'elle cherche, et combien
 * d'immeubles on pourrait lui envoyer sans se répéter. Ce dernier chiffre est
 * le seul en rouge : c'est le travail qui reste à faire. */

import { useMemo, useState } from "react";
import Link from "next/link";
import type { RechercheCard } from "@/lib/bubble/server";

const TAILLES = [10, 25, 50, 100];

/* Les quatre destinations du BO, dans son ordre. Un picto éteint dit « pas
   recherché » — l'absence de picto ne dirait rien du tout. */
const DESTINATIONS: { cle: string; titre: string; d: React.ReactNode }[] = [
  { cle: "Logement", titre: "Logement", d: <path d="M4 11 12 4l8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" /> },
  { cle: "Parking", titre: "Parking", d: <path d="M5 11.5 6.4 7.4A2 2 0 0 1 8.3 6h7.4a2 2 0 0 1 1.9 1.4L19 11.5V17h-2.5v-1.6h-9V17H5zM7.4 14a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4zm9.2 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z" /> },
  { cle: "Commerce", titre: "Commerce", d: <path d="M4 7h16l-1 3.2a2.4 2.4 0 0 1-4.6.3 2.4 2.4 0 0 1-4.8 0 2.4 2.4 0 0 1-4.6-.3zM5.5 12.6V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-6.4" /> },
  { cle: "Bureau", titre: "Bureau", d: <path d="M4 20V8.6a1 1 0 0 1 .6-.9l6-2.6a1 1 0 0 1 1.4.9V20M12 20V11h7a1 1 0 0 1 1 1v8M7 10.5h1.6M7 13.6h1.6M7 16.7h1.6M15 14h2M15 17h2" /> },
];

type Vue = "en_cours" | "en_attente" | "archivees";

export function EcranRecherches({
  rows, agents,
}: {
  rows: RechercheCard[];
  agents: { id: string; name: string; initials: string }[];
}) {
  const [vue, setVue] = useState<Vue>("en_cours");
  const [q, setQ] = useState("");
  const [agent, setAgent] = useState("");
  const [cible, setCible] = useState("");
  const [destination, setDestination] = useState("");
  const [note, setNote] = useState("");
  const [nonSuivies, setNonSuivies] = useState(false);
  const [avecContact, setAvecContact] = useState(false);
  const [aProposerSeul, setAProposerSeul] = useState(false);
  const [tri, setTri] = useState("modif");
  const [page, setPage] = useState(1);
  const [taille, setTaille] = useState(10);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [detail, setDetail] = useState<RechercheCard | null>(null);
  const [choisies, setChoisies] = useState<Set<string>>(new Set());

  const compte = (v: Vue) => rows.filter((r) => r.group === v).length;

  const filtrees = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const gardees = rows.filter((r) => {
      if (r.group !== vue) return false;
      /* La recherche porte sur tout ce qui identifie : le lieu, le type, le
         commentaire, et surtout le nom, l'e-mail ou le téléphone de
         l'acquéreur — c'est comme ça qu'on retrouve quelqu'un qui vient
         d'appeler. */
      if (qq) {
        const foin = [
          r.lieux.join(" "), r.cible, r.commentaire,
          r.contact?.nom, r.contact?.email, r.contact?.tel,
          r.orphelin?.email, r.orphelin?.tel,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!foin.includes(qq)) return false;
      }
      if (agent && r.agent !== agent) return false;
      if (cible && r.cible !== cible) return false;
      if (destination && !r.destinations.includes(destination)) return false;
      if (note && r.contact?.note !== note) return false;
      if (nonSuivies && r.agent !== "FI") return false;
      if (avecContact && !r.contact) return false;
      if (aProposerSeul && r.aProposer === 0) return false;
      return true;
    });
    const d = (r: RechercheCard) => String(r.date ?? "");
    switch (tri) {
      case "modif_ancien": return [...gardees].sort((a, b) => d(a).localeCompare(d(b)));
      case "aproposer": return [...gardees].sort((a, b) => b.aProposer - a.aProposer);
      case "note": return [...gardees].sort((a, b) => (a.contact?.note ?? "Z").localeCompare(b.contact?.note ?? "Z"));
      default: return [...gardees].sort((a, b) => d(b).localeCompare(d(a)));
    }
  }, [rows, vue, q, agent, cible, destination, note, nonSuivies, avecContact, aProposerSeul, tri]);

  const pages = Math.max(1, Math.ceil(filtrees.length / taille));
  const cur = Math.min(page, pages);
  const tranche = filtrees.slice((cur - 1) * taille, cur * taille);

  const cibles = [...new Set(rows.map((r) => r.cible).filter(Boolean) as string[])].sort();
  const raz = () => {
    setAgent(""); setCible(""); setDestination(""); setNote("");
    setNonSuivies(false); setAvecContact(false); setAProposerSeul(false);
    setTri("modif"); setPage(1);
  };
  const filtreActif = !!(agent || cible || destination || note || nonSuivies || avecContact || aProposerSeul || tri !== "modif");

  const cocher = (id: string) =>
    setChoisies((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  return (
    <div className="lstx">
      <div className="lstx-top">
        <h1 className="lstx-titre">Recherches</h1>
        <div className="lst-search">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.5-4.5" /></svg>
          <input
            placeholder="Un mot-clé, une ville, un nom, un e-mail, un téléphone…"
            value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
        </div>
        <div className="lstx-sw" role="group" aria-label="Vue">
          {([["en_cours", "En cours"], ["en_attente", "En attente"], ["archivees", "Archivées"]] as const).map(([k, l]) => (
            <button key={k} type="button" className={vue === k ? "on" : undefined}
              onClick={() => { setVue(k); setPage(1); }}>
              {l}{compte(k) > 0 && <span className="n">{compte(k)}</span>}
            </button>
          ))}
        </div>
        <select className="lstx-agent" value={agent} onChange={(e) => { setAgent(e.target.value); setPage(1); }}>
          <option value="">Toutes les recherches</option>
          {agents.map((a) => (
            <option key={a.id} value={a.initials}>Suivies par {a.name}</option>
          ))}
        </select>
      </div>

      <div className="lst-avec-filtres">
        <aside className="fltr">
          <label className="fltr-l">
            <span><svg viewBox="0 0 24 24"><path d="m12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8z" /></svg> Type d&apos;opération</span>
            <select value={cible} onChange={(e) => { setCible(e.target.value); setPage(1); }}>
              <option value="">Tous</option>
              {cibles.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>

          <label className="fltr-l">
            <span><svg viewBox="0 0 24 24"><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /></svg> Destination</span>
            <select value={destination} onChange={(e) => { setDestination(e.target.value); setPage(1); }}>
              <option value="">Toutes</option>
              {DESTINATIONS.map((d) => <option key={d.cle}>{d.cle}</option>)}
            </select>
          </label>

          <label className="fltr-l">
            <span><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9 14.5s1 1.5 3 1.5 3-1.5 3-1.5M9.2 9.8h.01M14.8 9.8h.01" /></svg> Note</span>
            <select value={note} onChange={(e) => { setNote(e.target.value); setPage(1); }}>
              <option value="">Toutes</option>
              {["A", "B", "C", "D"].map((g) => <option key={g}>{g}</option>)}
            </select>
          </label>

          <label className="fltr-l">
            <span><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="m8 16 8-8" /></svg> Non suivies uniquement</span>
            <select value={nonSuivies ? "oui" : "non"} onChange={(e) => { setNonSuivies(e.target.value === "oui"); setPage(1); }}>
              <option value="non">Non</option><option value="oui">Oui</option>
            </select>
          </label>

          <label className="fltr-l">
            <span><svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.4" /><path d="M5.5 20c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" /></svg> Avec contact uniquement</span>
            <select value={avecContact ? "oui" : "non"} onChange={(e) => { setAvecContact(e.target.value === "oui"); setPage(1); }}>
              <option value="non">Non</option><option value="oui">Oui</option>
            </select>
          </label>

          {/* Absent du BO, mais c'est la question que MAV pose à cet écran :
              « qu'est-ce que j'ai à envoyer aujourd'hui ? ». */}
          <label className="fltr-l">
            <span><svg viewBox="0 0 24 24"><path d="M21.6 3.2 2.9 10.4l4.7 1.7 11-7.3-8.6 8.4v4.8l2.3-3 4.4 3.2z" /></svg> À proposer seulement</span>
            <select value={aProposerSeul ? "oui" : "non"} onChange={(e) => { setAProposerSeul(e.target.value === "oui"); setPage(1); }}>
              <option value="non">Non</option><option value="oui">Oui</option>
            </select>
          </label>

          <label className="fltr-l">
            <span><svg viewBox="0 0 24 24"><path d="M4 7h13M4 12h9M4 17h5M17 11v8M14 16l3 3 3-3" /></svg> Tri</span>
            <select value={tri} onChange={(e) => setTri(e.target.value)}>
              <option value="modif">Date de modification (plus récents en premiers)</option>
              <option value="modif_ancien">Date de modification (plus anciens en premiers)</option>
              <option value="aproposer">Immeubles à proposer (plus nombreux en premiers)</option>
              <option value="note">Note acquéreur (A en premier)</option>
            </select>
          </label>

          <button type="button" className="fltr-raz" disabled={!filtreActif} onClick={raz}>⟲ Réinitialiser</button>
        </aside>

        <div className="lst-col">
          {choisies.size > 0 && (
            <div className="rc-selbar">
              <b>{choisies.size} recherche{choisies.size > 1 ? "s" : ""} sélectionnée{choisies.size > 1 ? "s" : ""}</b>
              <span style={{ flex: 1 }} />
              <button type="button" className="dif-x" onClick={() => setChoisies(new Set())}>Tout décocher</button>
              <button type="button" className="savebar-go" onClick={() => setDetail(null)}>
                <span className="ch">›</span> Écrire à la sélection
              </button>
            </div>
          )}

          {tranche.map((r) => (
            <div className="rc" key={r.id}>
              <label className="rc-cocher">
                <input type="checkbox" checked={choisies.has(r.id)} onChange={() => cocher(r.id)} />
              </label>

              {/* Colonne de gauche : le compteur d'immeubles à proposer, les
                  jumelles, puis le commercial. */}
              <div className="rc-gauche">
                <button
                  type="button"
                  className={`rc-cpt${r.aProposer > 0 ? " chaud" : ""}`}
                  title={r.aProposer > 0
                    ? `${r.aProposer} immeuble(s) en mandat correspondent et ne lui ont jamais été envoyés`
                    : "Rien de nouveau à lui proposer"}
                  onClick={() => setDetail(r)}
                >
                  {r.aProposer}
                </button>
                <span className="rc-jum">
                  <svg viewBox="0 0 24 24"><circle cx="7" cy="14" r="3.6" /><circle cx="17" cy="14" r="3.6" /><path d="M7 10.4V6h3.4M17 10.4V6h-3.4M10.6 14h2.8" /></svg>
                </span>
                <span className="lav" style={r.agentCouleur ? { background: r.agentCouleur } : undefined}>{r.agent}</span>
              </div>

              <div className="rc-corps">
                <div className="rc-ligne1">
                  <span className="rc-lieux">
                    {r.lieux.slice(0, 6).join(", ")}
                    {r.lieux.length > 6 && <i> +{r.lieux.length - 6}</i>}
                  </span>
                  <span style={{ flex: 1 }} />
                  {r.contact ? (
                    <span className="rc-ct-zone">
                      <button type="button" className="rc-ct"
                        onClick={() => setOuvert(ouvert === r.id ? null : r.id)}>
                        <svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.4" /><path d="M5.5 20c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" /></svg>
                        {r.contact.nom}
                        {r.contact.note && <b className={`note n${r.contact.note}`}>{r.contact.note}</b>}
                      </button>
                      {ouvert === r.id && (
                        <>
                          <span className="rc-voile" onClick={() => setOuvert(null)} />
                          <span className="rc-pop">
                            <span className="rc-pop-h">
                              <span className="lav" style={r.agentCouleur ? { background: r.agentCouleur } : undefined}>{r.agent}</span>
                              <span>
                                <b>
                                  {r.contact.note && <i className={`note n${r.contact.note}`}>{r.contact.note}</i>}
                                  {r.contact.nom}
                                </b>
                                <em>{r.contact.qualite}</em>
                                {r.contact.tel && <span>{r.contact.tel}</span>}
                                {r.contact.email && <span>{r.contact.email}</span>}
                                <span className="rc-pop-cpt">
                                  {r.contact.immeubles} immeuble{r.contact.immeubles > 1 ? "s" : ""} ·{" "}
                                  {r.contact.recherches} recherche{r.contact.recherches > 1 ? "s" : ""}
                                </span>
                              </span>
                            </span>
                            <span className="rc-pop-f">
                              {r.contact.tel && <a href={`tel:${r.contact.tel.replace(/[^\d+]/g, "")}`}>☎ Appeler</a>}
                              {r.contact.email && <a href={`mailto:${r.contact.email}`}>✉ E-mail</a>}
                              {/* Deuxième clic : on ouvre la fiche pour la modifier. */}
                              <Link href={`/contact/${r.contact.id}`}>Fiche ↗</Link>
                            </span>
                          </span>
                        </>
                      )}
                    </span>
                  ) : (
                    <span className="rc-orphelin">
                      <em>{[r.orphelin?.email, r.orphelin?.tel].filter(Boolean).join(" · ") || "Sans coordonnées"}</em>
                      <Link className="rc-creer" href="/contacts">⚠ Créer un contact</Link>
                    </span>
                  )}
                </div>

                <div className="rc-ligne2">
                  <span className="rc-dest">
                    {DESTINATIONS.map((d) => (
                      <i key={d.cle} className={r.destinations.includes(d.cle) ? "on" : undefined} title={d.titre}>
                        <svg viewBox="0 0 24 24">{d.d}</svg>
                      </i>
                    ))}
                  </span>
                  {r.commentaire && (
                    <button type="button" className="rc-details" onClick={() => setDetail(r)}>
                      <svg viewBox="0 0 24 24"><path d="M12 3C6.8 3 2.6 6.3 2.6 10.4c0 2.3 1.3 4.4 3.4 5.7-.2 1.3-.9 2.5-1.9 3.4 1.9 0 3.7-.7 5-1.9.9.2 1.8.3 2.9.3 5.2 0 9.4-3.3 9.4-7.5S17.2 3 12 3z" /></svg>
                      Voir les détails
                    </button>
                  )}
                </div>

                <div className="rc-ligne3">
                  <span className="rc-cible">
                    <svg viewBox="0 0 24 24"><path d="M4 18 10 11l4 4 6-8" /><path d="M20 7v5h-5" /></svg>
                    {r.cible ?? "Type non précisé"}
                  </span>
                  <span style={{ flex: 1 }} />
                  <Puce label="Surface" valeur={r.surface} />
                  <Puce label="Occupation" valeur={r.occupation} />
                  <Puce label="Budget" valeur={r.prix} euro />
                  <Puce label="Rendement" valeur={r.renta} />
                </div>
              </div>
            </div>
          ))}

          {tranche.length === 0 && <div className="fempty">Aucune recherche.</div>}

          <div className="lst-pager">
            <span className="lst-res">{filtrees.length} résultat{filtrees.length > 1 ? "s" : ""}</span>
            <span className="sp" style={{ flex: 1 }} />
            <button className="pgb" type="button" disabled={cur <= 1} onClick={() => setPage(1)}>«</button>
            <button className="pgb" type="button" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>‹</button>
            <span className="pgn">Page {cur} / {pages}</span>
            <button className="pgb" type="button" disabled={cur >= pages} onClick={() => setPage(cur + 1)}>›</button>
            <button className="pgb" type="button" disabled={cur >= pages} onClick={() => setPage(pages)}>»</button>
            <span className="sp" style={{ flex: 1 }} />
            <select className="pgs" value={taille} onChange={(e) => { setTaille(Number(e.target.value)); setPage(1); }}>
              {TAILLES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <span className="pgl">éléments par page</span>
          </div>
        </div>
      </div>

      {detail && (
        <div className="modal-ov" onClick={() => setDetail(null)}>
          <div className="modal lieu-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">
              <b>{detail.contact?.nom ?? "Recherche"} — {detail.cible ?? "Recherche"}</b>
              <button type="button" onClick={() => setDetail(null)}>✕</button>
            </div>
            <div className="modal-b">
              <div className="rc-det">
                <b>Où</b><span>{detail.lieux.join(", ")}</span>
                <b>Destinations</b><span>{detail.destinations.join(", ") || "Toutes"}</span>
                <b>Surface</b><span>{detail.surface ?? "Non précisée"}</span>
                <b>Occupation</b><span>{detail.occupation ?? "Non précisée"}</span>
                <b>Budget</b><span>{detail.prix ?? "Non précisé"}</span>
                <b>Rendement</b><span>{detail.renta ?? "Non précisé"}</span>
                <b>À proposer</b>
                <span>
                  {detail.aProposer > 0
                    ? `${detail.aProposer} immeuble(s) en mandat correspondent et ne lui ont jamais été envoyés.`
                    : "Rien de nouveau : tout ce qui correspond lui a déjà été envoyé."}
                </span>
              </div>
              {detail.commentaire && <p className="rc-com">{detail.commentaire}</p>}
            </div>
            <div className="modal-f">
              <span style={{ flex: 1 }} />
              {detail.aProposer > 0 && detail.contact && (
                <Link className="savebar-go" href={`/acheteurs?recherche=${detail.id}`}>
                  <span className="ch">›</span> Voir les immeubles à proposer
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Une puce de critère : grisée avec son intitulé quand rien n'est renseigné. */
function Puce({ label, valeur, euro }: { label: string; valeur?: string; euro?: boolean }) {
  return (
    <span className={`rc-puce${valeur ? " on" : ""}`}>
      {euro && <b>€</b>}
      {valeur ?? label}
    </span>
  );
}
