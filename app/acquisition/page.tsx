// Acquisition (MAV, 10/11) : faire venir les vendeurs et les acquéreurs.
// Lot 1 = tout LIRE depuis le BO — Google Ads (campagnes, dépenses, termes de
// recherche, zones, exclusions, pages d'arrivée) et, parce que le BO suit le
// formulaire jusqu'au mandat, le coût d'un formulaire et d'un mandat.
// Les onglets des lots suivants sont posés mais fermés : rien n'y agit encore.
import Link from "next/link";
import { exigerDirection } from "@/lib/auth/comptes";
import { etatAds, lireAds, type LectureAds } from "@/lib/bo/google-ads";
import { CANAUX, TYPES_FORMULAIRE, canalDe, cheminArrivee, periodeDe, type Canal } from "@/lib/bo/acquisition";
import { deconnecterGoogleAds } from "@/lib/bo/google-ads-actions";
import { immeublesSousMandat, originesDepuis, premiereOrigine, type LeadOrigine } from "@/lib/bo/lead-origine";

export const dynamic = "force-dynamic";
export const metadata = { title: "Acquisition · France Immeuble" };

const GUIDE = "https://claude.ai/artifact/EpZw4jEaCS8cjq52JmRNFW";

const ONGLETS: { k: string; l: string; lot?: string }[] = [
  { k: "vue", l: "Vue d'ensemble" },
  { k: "ads", l: "Google Ads" },
  { k: "tests", l: "Tests", lot: "lot 3" },
  { k: "articles", l: "Articles", lot: "lot 4" },
  { k: "reseaux", l: "Réseaux", lot: "lot 4" },
  { k: "valider", l: "À valider", lot: "lot 2" },
];

const eur = (v: number, d = 0) => `${v.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
const nb = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const ratio = (cout: number, n: number) => (n > 0 ? eur(cout / n) : "—");
const jourFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });

const STATUT_CAMPAGNE: Record<string, [string, string]> = {
  ENABLED: ["Active", "ok"], PAUSED: ["En pause", "off"], REMOVED: ["Supprimée", "off"],
};
const STATUT_TERME: Record<string, string> = {
  ADDED: "mot-clé", EXCLUDED: "exclu", ADDED_EXCLUDED: "mot-clé exclu", NONE: "",
};

/** Le formulaire est-il rattaché à cette campagne (UTM = son id ou son nom) ? */
const deLaCampagne = (o: LeadOrigine, c: { id: string; nom: string }) => {
  const u = (o.utm_campaign ?? "").trim().toLowerCase();
  return !!u && (u === c.id || u === c.nom.trim().toLowerCase());
};

export default async function AcquisitionPage({ searchParams }: {
  searchParams: Promise<{ onglet?: string; jours?: string; frais?: string; ads?: string }>;
}) {
  await exigerDirection();
  const sp = await searchParams;
  const onglet = ONGLETS.some((o) => o.k === sp.onglet && !o.lot) ? sp.onglet! : "vue";
  const periode = periodeDe(Number(sp.jours) || 30);
  const etat = await etatAds();
  const retour = sp.ads ? RETOURS[sp.ads] : undefined;

  const [ads, origines, depuis] = await Promise.all([
    etat.pret ? lireAds(periode, sp.frais === "1").catch((e): LectureAds | string => (e instanceof Error ? e.message : String(e))) : null,
    originesDepuis(periode.du).catch(() => [] as LeadOrigine[]),
    premiereOrigine(),
  ]);
  const lecture = ads && typeof ads === "object" ? ads : null;
  const erreurGlobale = typeof ads === "string" ? ads : null;
  const leads = origines.filter((o) => o.recu_le.slice(0, 10) <= periode.au);

  /* Formulaires → canal → mandat. */
  const sousMandat = await immeublesSousMandat(leads.filter((o) => o.type === "estimation").map((o) => o.doc_id ?? "")).catch(() => new Set<string>());
  const parCanal = new Map<Canal, { n: number; estimations: number; mandats: number }>();
  for (const c of CANAUX) parCanal.set(c, { n: 0, estimations: 0, mandats: 0 });
  for (const o of leads) {
    const x = parCanal.get(canalDe(o))!;
    x.n++;
    if (o.type === "estimation") x.estimations++;
    if (o.doc_id && sousMandat.has(o.doc_id)) x.mandats++;
  }
  const leadsAds = leads.filter((o) => canalDe(o) === "Google Ads");
  const mandatsAds = parCanal.get("Google Ads")!.mandats;
  const avecOrigine = leads.some((o) => o.gclid || o.utm_source || o.referrer || o.landing);

  const depense = lecture?.campagnes.reduce((s, c) => s + c.cout, 0) ?? 0;
  const clics = lecture?.campagnes.reduce((s, c) => s + c.clics, 0) ?? 0;
  const convGoogle = lecture?.campagnes.reduce((s, c) => s + c.conversions, 0) ?? 0;
  const lien = (o: Record<string, string | undefined>) => {
    const q = new URLSearchParams({ onglet, jours: String(periode.jours), ...o });
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k);
    return `/acquisition?${q}`;
  };

  return (
    <div className="lst-page acq">
      <div className="acq-tete">
        <div>
          <h1 className="lst-title">Acquisition</h1>
          <p className="acq-sous">Faire venir les vendeurs et les acquéreurs : ce que coûte un formulaire, puis un mandat. Lecture seule — rien ne change chez Google depuis cette page.</p>
        </div>
        <div className="acq-outils">
          <div className="acq-per" role="group" aria-label="Période">
            {[7, 30, 90].map((j) => (
              <Link key={j} href={lien({ jours: String(j) })} className={periode.jours === j ? "on" : undefined}>{j} j</Link>
            ))}
          </div>
          {etat.pret ? (
            <span className={`acq-etat ${erreurGlobale || lecture?.erreurs.compte ? "ko" : "ok"}`}>
              {erreurGlobale || lecture?.erreurs.compte ? "Google Ads : erreur de lecture" : `Google Ads connecté · ${lecture?.compte?.nom || etat.compte}`}
            </span>
          ) : (
            <span className="acq-etat off">Google Ads pas encore branché</span>
          )}
          {etat.pret && <Link className="acq-actu" href={lien({ frais: "1" })}>Actualiser</Link>}
          {etat.pret && etat.mode === "oauth" && (
            <form action={deconnecterGoogleAds}>
              <button type="submit" className="acq-lien" title={`Connecté avec ${etat.identite}`}>Déconnecter</button>
            </form>
          )}
        </div>
      </div>
      <div className="acq-per-txt">
        Du {jourFr(periode.du)} au {jourFr(periode.au)} inclus
        {lecture && <> · lu à {new Date(lecture.lu).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}</>}
      </div>

      <nav className="ftabs acq-tabs">
        {ONGLETS.map((o) => o.lot ? (
          <span key={o.k} className="ftab acq-ferme" title={`Arrive au ${o.lot}`}>{o.l}<span className="n">{o.lot}</span></span>
        ) : (
          <Link key={o.k} href={lien({ onglet: o.k })} className={`ftab${onglet === o.k ? " on" : ""}`}>{o.l}</Link>
        ))}
      </nav>

      {retour && <div className={retour[0] === "ok" ? "acq-ok" : "acq-err"}>{retour[1]}</div>}
      {!etat.pret && <Branchement manque={etat.manque} erreur={etat.erreur} connectable={etat.connectable} />}
      {lecture?.erreurs.compte && etat.pret && etat.mode === "oauth" && (
        <a className="acq-guide" href="/api/google-ads/connexion">Reconnecter Google Ads</a>
      )}
      {erreurGlobale && <div className="acq-err"><b>Google n&apos;a pas répondu.</b> {erreurGlobale}</div>}
      {lecture?.erreurs.compte && <div className="acq-err"><b>Lecture du compte impossible.</b> {lecture.erreurs.compte}</div>}

      {onglet === "vue" && (
        <>
          <div className="acq-kpis">
            <Kpi l="Dépense Google Ads" v={lecture ? eur(depense) : "—"} d={lecture ? `${nb(clics)} clics · ${ratio(depense, clics).replace(" €", " €/clic")}` : "à brancher"} />
            <Kpi l="Formulaires reçus" v={nb(leads.length)} d={resumeTypes(leads)} />
            <Kpi l="Venus de Google Ads" v={nb(leadsAds.length)} d={lecture ? `Google en compte ${nb(convGoogle)}` : undefined} />
            <Kpi l="Coût par formulaire" v={lecture ? ratio(depense, leadsAds.length) : "—"} d="dépense ÷ formulaires venus des annonces" fort />
            <Kpi l="Mandats signés issus des annonces" v={nb(mandatsAds)} d="estimations du site devenues mandat" />
            <Kpi l="Coût par mandat" v={lecture ? ratio(depense, mandatsAds) : "—"} d="dépense ÷ mandats issus des annonces" fort />
          </div>

          {!avecOrigine && (
            <div className="acq-note">
              <b>Le site ne transmet pas encore l&apos;origine des formulaires.</b>{" "}
              {depuis ? <>Le BO les compte depuis le {jourFr(depuis)}, </> : <>Le BO est prêt à les compter, </>}
              mais sans l&apos;identifiant du clic Google ni les UTM il les range tous en « Direct ou inconnu ». La demande est faite à la session du site (contrat §18) ; le coût par formulaire et par mandat se remplit dès qu&apos;elle est livrée.
            </div>
          )}

          <h2 className="dt-h2">Formulaires par canal</h2>
          <div className="eqp-table">
            <table>
              <thead><tr><th>Canal</th><th className="num">Formulaires</th><th className="num">dont estimations</th><th className="num">Mandats signés</th></tr></thead>
              <tbody>
                {CANAUX.map((c) => {
                  const x = parCanal.get(c)!;
                  return (
                    <tr key={c} className={x.n ? undefined : "acq-vide"}>
                      <td>{c}</td><td className="num">{nb(x.n)}</td><td className="num">{nb(x.estimations)}</td><td className="num">{nb(x.mandats)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {lecture && (
            <>
              <h2 className="dt-h2">Dépense par jour</h2>
              <Barres jours={lecture.jours} />
              <h2 className="dt-h2">Campagnes</h2>
              <Campagnes lecture={lecture} leads={leadsAds} />
            </>
          )}
        </>
      )}

      {onglet === "ads" && !lecture && etat.pret && !erreurGlobale && <div className="fempty">Aucune donnée.</div>}
      {onglet === "ads" && lecture && <OngletAds lecture={lecture} leads={leads} />}
    </div>
  );
}

function resumeTypes(leads: LeadOrigine[]): string {
  const c = new Map<string, number>();
  for (const o of leads) c.set(o.type, (c.get(o.type) ?? 0) + 1);
  const parts = [...c.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${(TYPES_FORMULAIRE[t] ?? t).toLowerCase()} ${n}`);
  return parts.length ? parts.join(" · ") : "aucun sur la période";
}

function Kpi({ l, v, d, fort }: { l: string; v: string; d?: string; fort?: boolean }) {
  return (
    <div className={`acq-kpi${fort ? " fort" : ""}`}>
      <span className="l">{l}</span>
      <span className="v">{v}</span>
      {d && <span className="d">{d}</span>}
    </div>
  );
}

/** Ce que dit la page au retour de chez Google (`?ads=`). */
const RETOURS: Record<string, ["ok" | "ko", string]> = {
  connecte: ["ok", "Google Ads est connecté. Le BO lit le compte en lecture seule."],
  refuse: ["ko", "Autorisation refusée chez Google : rien n'a été connecté."],
  etat: ["ko", "La demande a expiré ou ne venait pas de ce BO. Cliquez à nouveau « Connecter Google Ads »."],
  portee: ["ko", "Google n'a pas donné l'accès à Google Ads : cochez la case Google Ads sur l'écran d'autorisation."],
  sans_renouvellement: ["ko", "Google n'a pas remis de jeton durable. Retirez l'accès du BO dans votre compte Google (Sécurité › Applications tierces), puis reconnectez."],
  enregistrement: ["ko", "Connexion reçue mais pas enregistrée (MAIL_CRYPTO_KEY absente ?)."],
  erreur_google: ["ko", "Google a refusé la connexion. Vérifiez que l'adresse de retour du client OAuth est exactement celle indiquée dans le guide."],
  client_absent: ["ko", "Le client OAuth n'est pas posé dans Vercel (GOOGLE_ADS_OAUTH_CLIENT_ID et _SECRET)."],
};

function Branchement({ manque, erreur, connectable }: { manque: string[]; erreur?: string; connectable: boolean }) {
  return (
    <div className="acq-branche">
      <b>Google Ads n&apos;est pas encore branché.</b>
      {connectable ? (
        <p>Tout est prêt côté BO : connectez-vous avec le compte Google qui gère les annonces. Le BO ne demande que la lecture.</p>
      ) : (
        <p>Il faut d&apos;abord créer le client OAuth dans le projet Google Cloud et le poser dans Vercel : le guide pas à pas prend une dizaine de minutes.</p>
      )}
      {erreur && <p className="acq-err-l">{erreur}</p>}
      {manque.length > 0 && <p>Variables attendues dans Vercel : {manque.map((m, i) => <span key={m}>{i ? ", " : ""}<code>{m}</code></span>)}.</p>}
      {connectable && !manque.length ? (
        <a className="acq-guide" href="/api/google-ads/connexion">Connecter Google Ads</a>
      ) : (
        <a className="acq-guide" href={GUIDE} target="_blank" rel="noreferrer">Ouvrir le guide de branchement</a>
      )}
    </div>
  );
}

function Barres({ jours }: { jours: LectureAds["jours"] }) {
  if (!jours.length) return <div className="fempty">Pas de dépense sur la période.</div>;
  const max = Math.max(...jours.map((j) => j.cout), 1);
  const total = jours.reduce((s, j) => s + j.cout, 0);
  return (
    <div className="acq-barres" role="img" aria-label={`Dépense quotidienne, ${eur(total)} au total`}>
      {jours.map((j) => (
        <span key={j.date} title={`${j.date.split("-").reverse().join("/")} : ${eur(j.cout, 2)} · ${j.clics} clics`} style={{ height: `${Math.max(2, (j.cout / max) * 100)}%` }} />
      ))}
      <i className="acq-bmax">{eur(max)}</i>
    </div>
  );
}

function Campagnes({ lecture, leads }: { lecture: LectureAds; leads: LeadOrigine[] }) {
  if (lecture.erreurs.campagnes) return <div className="acq-err">{lecture.erreurs.campagnes}</div>;
  if (!lecture.campagnes.length) return <div className="fempty">Aucune campagne sur la période.</div>;
  return (
    <div className="eqp-table">
      <table>
        <thead>
          <tr><th>Campagne</th><th>Statut</th><th className="num">Budget / j</th><th className="num">Dépense</th><th className="num">Clics</th><th className="num">€ / clic</th><th className="num">Conv. Google</th><th className="num">Formulaires</th><th className="num">€ / formulaire</th></tr>
        </thead>
        <tbody>
          {lecture.campagnes.map((c) => {
            const f = leads.filter((o) => deLaCampagne(o, c)).length;
            const [st, ton] = STATUT_CAMPAGNE[c.statut] ?? [c.statut, ""];
            return (
              <tr key={c.id}>
                <td>{c.nom}</td>
                <td><span className={`acq-pill ${ton}`}>{st}</span></td>
                <td className="num">{c.budgetJour ? eur(c.budgetJour) : "—"}</td>
                <td className="num">{eur(c.cout)}</td>
                <td className="num">{nb(c.clics)}</td>
                <td className="num">{c.clics ? eur(c.cout / c.clics, 2) : "—"}</td>
                <td className="num">{nb(c.conversions)}</td>
                <td className="num">{f || "—"}</td>
                <td className="num">{ratio(c.cout, f)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Section({ titre, erreur, vide, children, sous }: { titre: string; erreur?: string; vide: boolean; children: React.ReactNode; sous?: string }) {
  return (
    <section className="acq-sec">
      <h2 className="dt-h2">{titre}</h2>
      {sous && <p className="acq-sous petit">{sous}</p>}
      {erreur ? <div className="acq-err">{erreur}</div> : vide ? <div className="fempty">Rien sur la période.</div> : children}
    </section>
  );
}

function OngletAds({ lecture, leads }: { lecture: LectureAds; leads: LeadOrigine[] }) {
  const e = lecture.erreurs;
  /* Un terme qui coûte sans rien rapporter : le candidat naturel à l'exclusion (lot 2). */
  const coutMoyenConv = (() => {
    const c = lecture.termes.reduce((s, t) => s + t.cout, 0);
    const n = lecture.termes.reduce((s, t) => s + t.conversions, 0);
    return n > 0 ? c / n : 50;
  })();
  const formulairesParPage = new Map<string, number>();
  for (const o of leads) {
    const p = cheminArrivee(o.landing);
    if (p) formulairesParPage.set(p, (formulairesParPage.get(p) ?? 0) + 1);
  }
  const exclParPortee = new Map<string, LectureAds["exclusions"]>();
  for (const x of lecture.exclusions) exclParPortee.set(x.portee, [...(exclParPortee.get(x.portee) ?? []), x]);

  return (
    <>
      <Section titre="Campagnes" vide={false}><Campagnes lecture={lecture} leads={leads.filter((o) => canalDe(o) === "Google Ads")} /></Section>

      <Section titre="Termes de recherche" erreur={e.termes} vide={!lecture.termes.length}
        sous={`Ce que les gens ont réellement tapé, par dépense. Surligné : plus de ${eur(Math.round(coutMoyenConv / 2))} dépensés sans aucune conversion.`}>
        <div className="eqp-table acq-haut">
          <table>
            <thead><tr><th>Terme</th><th>Campagne</th><th className="num">Impr.</th><th className="num">Clics</th><th className="num">Dépense</th><th className="num">Conv.</th><th /></tr></thead>
            <tbody>
              {lecture.termes.map((t, i) => (
                <tr key={`${t.terme}-${t.campagne}-${i}`} className={t.conversions === 0 && t.cout > coutMoyenConv / 2 ? "acq-alerte" : undefined}>
                  <td>{t.terme}</td><td className="acq-gris">{t.campagne}</td>
                  <td className="num">{nb(t.impressions)}</td><td className="num">{nb(t.clics)}</td>
                  <td className="num">{eur(t.cout, 2)}</td><td className="num">{nb(t.conversions)}</td>
                  <td className="acq-gris">{STATUT_TERME[t.statut] ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section titre="Mots-clés" erreur={e.motsCles} vide={!lecture.motsCles.length}>
        <div className="eqp-table acq-haut">
          <table>
            <thead><tr><th>Mot-clé</th><th>Correspondance</th><th>Campagne › groupe</th><th className="num">Qualité</th><th className="num">Clics</th><th className="num">Dépense</th><th className="num">Conv.</th></tr></thead>
            <tbody>
              {lecture.motsCles.map((k, i) => (
                <tr key={`${k.texte}-${k.groupe}-${i}`}>
                  <td>{k.texte}</td><td className="acq-gris">{k.correspondance}</td>
                  <td className="acq-gris">{k.campagne} › {k.groupe}</td>
                  <td className="num">{k.qualite == null ? "—" : `${k.qualite}/10`}</td>
                  <td className="num">{nb(k.clics)}</td><td className="num">{eur(k.cout, 2)}</td><td className="num">{nb(k.conversions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="acq-2col">
        <Section titre="Maillage géographique" erreur={e.zones} vide={!lecture.zones.length} sous="Zones ciblées ou exclues, et leur modulation d'enchère.">
          <div className="eqp-table acq-haut">
            <table>
              <thead><tr><th>Zone</th><th>Campagne</th><th className="num">Enchère</th></tr></thead>
              <tbody>
                {lecture.zones.map((z, i) => (
                  <tr key={`${z.nom}-${z.campagne}-${i}`} className={z.exclue ? "acq-exclue" : undefined}>
                    <td>{z.nom}{z.type && <span className="acq-gris"> · {z.type.toLowerCase()}</span>}</td>
                    <td className="acq-gris">{z.campagne}</td>
                    <td className="num">{z.exclue ? "exclue" : z.modulation == null || z.modulation === 1 ? "0 %" : `${z.modulation > 1 ? "+" : "−"}${Math.round(Math.abs(z.modulation - 1) * 100)} %`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
        <Section titre="Résultats par département" erreur={e.zonesPerf} vide={!lecture.zonesPerf.length} sous="Où sont les gens qui ont cliqué.">
          <div className="eqp-table acq-haut">
            <table>
              <thead><tr><th>Département</th><th className="num">Clics</th><th className="num">Dépense</th><th className="num">Conv.</th></tr></thead>
              <tbody>
                {lecture.zonesPerf.map((z) => (
                  <tr key={z.nom}><td>{z.nom}</td><td className="num">{nb(z.clics)}</td><td className="num">{eur(z.cout)}</td><td className="num">{nb(z.conversions)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      <Section titre="Exclusions" erreur={e.exclusions} vide={!lecture.exclusions.length} sous="Mots-clés négatifs : ce pour quoi les annonces ne doivent jamais sortir.">
        <div className="acq-excl">
          {[...exclParPortee.entries()].map(([portee, xs]) => (
            <div key={portee} className="acq-excl-g">
              <span className="acq-gris">{portee}</span>
              <div>{xs.map((x, i) => <span key={`${x.texte}-${i}`} className="acq-chip" title={x.correspondance}>{x.correspondance === "exact" ? `[${x.texte}]` : x.correspondance === "expression" ? `"${x.texte}"` : x.texte}</span>)}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section titre="Pages d'arrivée" erreur={e.pages} vide={!lecture.pages.length} sous="La page du site où chaque annonce envoie, et les formulaires partis de cette page.">
        <div className="eqp-table">
          <table>
            <thead><tr><th>Page</th><th className="num">Clics</th><th className="num">Dépense</th><th className="num">Conv. Google</th><th className="num">Formulaires</th></tr></thead>
            <tbody>
              {lecture.pages.map((p) => {
                const f = formulairesParPage.get(cheminArrivee(p.url)) ?? 0;
                return (
                  <tr key={p.url}>
                    <td className="acq-url"><a href={p.url} target="_blank" rel="noreferrer">{p.url.replace(/^https?:\/\/(www\.)?/, "")}</a></td>
                    <td className="num">{nb(p.clics)}</td><td className="num">{eur(p.cout)}</td><td className="num">{nb(p.conversions)}</td><td className="num">{f || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
