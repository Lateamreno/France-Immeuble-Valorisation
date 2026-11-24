/* La mise en forme du rapport de commercialisation (MAV, 19/11/26).
 *
 * Trois sorties d'un même contenu, relu et corrigé par l'agent :
 *   • l'E-MAIL — « l'essentiel » : quatre chiffres, trois paragraphes ;
 *   • le PDF joint — le compte rendu complet et le diagnostic ;
 *   • le texte brut, pour les messageries qui n'affichent pas la mise en forme.
 *
 * Contraintes de MAV pour l'e-mail : « responsive », aussi lisible sur mobile
 * que sur PC, et « que la boîte e-mail des clients ne bloque pas la
 * présentation à cause du blocage d'image ». D'où :
 *   • AUCUNE image, aucune police distante, aucun fichier de style : rien que
 *     la messagerie puisse bloquer. Les « dessins » sont des cases de tableau
 *     colorées ;
 *   • des tableaux et des styles écrits sur chaque balise — Outlook ignore
 *     tout le reste ;
 *   • une seule colonne de 600 px au plus, fluide en dessous : elle se lit
 *     sans zoom sur un téléphone, sans dépendre des « media queries » que
 *     Gmail retire parfois ;
 *   • des couleurs posées en clair sur fond clair, déclarées telles, pour que
 *     le mode sombre des messageries ne les inverse pas à moitié.
 *
 * Pur : ni base, ni réseau. L'aperçu de l'écran et l'envoi appellent les
 * mêmes fonctions — ce que l'agent voit est ce qui part.
 */

export type PointRetour = { point: string; combien?: string };
export type Piste = { titre: string; texte: string; implique?: string };

export type ContenuRapport = {
  objet: string;
  /** « Paris 18ᵉ » : le bien, tel qu'on le nomme au propriétaire. */
  bien: string;
  periode: string;
  salutation: string;
  intro: string;
  /** Les quatre chiffres de tête. */
  chiffres: { valeur: string; libelle: string }[];
  fait: string;
  retient: string;
  /** Le texte libre de l'agent. */
  libre: string;
  signature: string;

  actions: { date: string; libelle: string; mode: string; nombre: string }[];
  /** D'autres chiffres, sous le tableau des actions. */
  chiffresDetail: { valeur: string; libelle: string }[];
  retours: { qui: string; note?: string; texte: string }[];
  retoursNote?: string;
  visites: { date: string; qui: string; note?: string; texte: string }[];
  offres: { date: string; qui: string; note?: string; montant: string; statut: string }[];
  diffusion: { source: string; lignes: { libelle: string; valeur: string }[]; note?: string }[];
  legende: string;

  plait: PointRetour[];
  bloque: PointRetour[];
  barometre?: {
    prixMandat: number;
    offreHaute?: number;
    offreLibelle?: string;
    /** D'autres prix cités par les acquéreurs. */
    reperes: { libelle: string; montant: number }[];
    commentaire: string;
  };
  pistes: Piste[];
  /** Ce qui reste à faire, ce qu'on pense pour la suite. */
  suite: string;
};

const ENCRE = "#21262d";
const GRIS = "#626973";
const TRAIT = "#e1ded5";
const OR = "#8f7326";
const OR_FOND = "#f5efdc";
const FOND = "#f6f5f1";
const VERT = "#2c7443";
const ROUGE = "#a8432a";
const POLICE = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const ech = (v: unknown) => String(v ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Un texte de l'agent : ses retours à la ligne deviennent des paragraphes. */
const paras = (t: string, style: string) => t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  .map((p) => `<p style="${style}">${ech(p).replace(/\n/g, "<br>")}</p>`).join("");
export const euros = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ")} €`;
const plein = (s?: string) => !!s && s.trim().length > 0;

/* ------------------------------------------------------------------ e-mail */

const P = `margin:0 0 14px;font:15px/1.55 ${POLICE};color:${ENCRE}`;

/** Les quatre chiffres : deux par ligne, lisibles à 320 px de large. */
function tuilesMail(chiffres: ContenuRapport["chiffres"]): string {
  const c = chiffres.slice(0, 4);
  if (!c.length) return "";
  const cellule = (x?: { valeur: string; libelle: string }) => x
    ? `<td width="50%" valign="top" style="padding:5px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${TRAIT};border-radius:6px;background:#ffffff"><tr><td style="padding:10px 12px;font:15px/1.3 ${POLICE};color:${ENCRE}"><span style="font-size:22px;font-weight:700;color:${ENCRE}">${ech(x.valeur)}</span><br><span style="font-size:12px;color:${GRIS}">${ech(x.libelle)}</span></td></tr></table></td>`
    : `<td width="50%" style="padding:5px">&nbsp;</td>`;
  const lignes: string[] = [];
  for (let i = 0; i < c.length; i += 2) lignes.push(`<tr>${cellule(c[i])}${cellule(c[i + 1])}</tr>`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px -5px 12px">${lignes.join("")}</table>`;
}

/** L'e-mail : l'essentiel, sans aucune image. */
export function htmlMail(c: ContenuRapport, avecPdf = true): string {
  const bloc = (titre: string, texte: string) => plein(texte)
    ? `<p style="${P}"><b>${ech(titre)}</b> ${ech(texte.trim()).replace(/\n/g, "<br>")}</p>` : "";
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${ech(c.objet)}</title></head>
<body style="margin:0;padding:0;background:${FOND};color:${ENCRE}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${FOND}" style="background:${FOND}"><tr><td align="center" style="padding:16px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid ${TRAIT};border-radius:8px">
<tr><td style="padding:18px 20px 6px;font:12px/1.4 ${POLICE};color:${OR};letter-spacing:1px;text-transform:uppercase;font-weight:700">Point de commercialisation</td></tr>
<tr><td style="padding:0 20px 12px;font:20px/1.25 ${POLICE};color:${ENCRE};font-weight:700">${ech(c.bien)}<br><span style="font-size:13px;font-weight:400;color:${GRIS}">${ech(c.periode)}</span></td></tr>
<tr><td style="padding:6px 20px 20px">
${paras(c.salutation, P)}
${paras(c.intro, P)}
${tuilesMail(c.chiffres)}
${bloc("Ce qui a été fait.", c.fait)}
${bloc("Ce qu'on retient.", c.retient)}
${plein(c.libre) ? paras(c.libre, P) : ""}
${avecPdf ? `<p style="${P}">Le compte rendu détaillé est joint à ce message, en PDF.</p>` : ""}
${paras(c.signature, `${P};margin-bottom:0`)}
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/** Le même message en texte brut, pour les messageries sans mise en forme. */
export function texteMail(c: ContenuRapport, avecPdf = true): string {
  const l: string[] = [c.salutation.trim(), "", c.intro.trim(), ""];
  for (const x of c.chiffres.slice(0, 4)) l.push(`• ${x.valeur} ${x.libelle}`);
  l.push("");
  if (plein(c.fait)) l.push(`Ce qui a été fait. ${c.fait.trim()}`, "");
  if (plein(c.retient)) l.push(`Ce qu'on retient. ${c.retient.trim()}`, "");
  if (plein(c.libre)) l.push(c.libre.trim(), "");
  if (avecPdf) l.push("Le compte rendu détaillé est joint à ce message, en PDF.", "");
  l.push(c.signature.trim());
  return l.join("\n").replace(/\n{3,}/g, "\n\n");
}

/* --------------------------------------------------------------------- PDF */

const note = (n?: string) => (n ? `<span class="g">${ech(n)}</span>` : `<span class="gv">—</span>`);

function barometrePdf(b: NonNullable<ContenuRapport["barometre"]>): string {
  const max = b.prixMandat;
  const reperes = [
    ...(b.offreHaute ? [{ libelle: b.offreLibelle || "Offre la plus haute", montant: b.offreHaute, fort: true }] : []),
    ...b.reperes.filter((r) => r.montant > 0 && plein(r.libelle)).map((r) => ({ ...r, fort: false })),
  ].sort((x, y) => x.montant - y.montant);
  const pct = (m: number) => Math.max(0, Math.min(100, (m / max) * 100));
  /* Les étiquettes alternent au-dessus et au-dessous de la règle : deux prix
     proches ne se recouvrent pas. Passé 78 %, l'étiquette s'aligne à droite
     pour rester dans la page. */
  const marques = reperes.map((r, i) => {
    const x = pct(r.montant);
    const cote = i % 2 === 0 ? "haut" : "bas";
    const cale = x > 78 ? "dr" : "";
    return `<div class="rep ${cote} ${cale}" style="left:${x.toFixed(1)}%"><span>${ech(r.libelle)}<br><b>${ech(euros(r.montant))}</b></span></div>`;
  }).join("");
  return `<div class="baro"><div class="rail"></div>${marques}<div class="rep fin ${reperes.length % 2 === 0 ? "haut" : "bas"}" style="left:100%"><span>Prix du mandat<br><b>${ech(euros(max))}</b></span></div></div>`;
}

/** Le PDF : compte rendu complet, puis diagnostic et plan d'action. */
export function htmlPdf(c: ContenuRapport): string {
  const points = (l: PointRetour[]) => l.filter((p) => plein(p.point))
    .map((p) => `<li>${ech(p.point)}${plein(p.combien) ? ` <span class="cpt">· ${ech(p.combien)}</span>` : ""}</li>`).join("");
  const tuiles = (l: ContenuRapport["chiffres"]) => l.length
    ? `<div class="tuiles">${l.map((x) => `<div class="tuile"><b>${ech(x.valeur)}</b><span>${ech(x.libelle)}</span></div>`).join("")}</div>` : "";
  const pistes = c.pistes.filter((p) => plein(p.titre) || plein(p.texte));
  const aDiagnostic = points(c.plait) || points(c.bloque) || c.barometre || pistes.length || plein(c.suite);

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${ech(c.objet)}</title>
<style>
@page{size:A4;margin:16mm 15mm}
*{box-sizing:border-box}
body{margin:0;color:${ENCRE};font:10.5pt/1.5 ${POLICE};-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sur{font-size:8pt;letter-spacing:.08em;text-transform:uppercase;color:${OR};font-weight:700}
h1{font-size:20pt;line-height:1.15;margin:2pt 0 2pt}
.per{color:${GRIS};margin:0 0 14pt}
h2{font-size:13pt;margin:20pt 0 6pt;padding-bottom:4pt;border-bottom:1px solid ${TRAIT};break-after:avoid}
h3{font-size:10.5pt;margin:12pt 0 4pt;break-after:avoid}
p{margin:0 0 7pt}
table{border-collapse:collapse;width:100%;font-size:9.5pt}
th{text-align:left;font-size:7.5pt;letter-spacing:.06em;text-transform:uppercase;color:${GRIS};border-bottom:1px solid ${TRAIT};padding:5pt 6pt}
td{border-bottom:1px solid ${TRAIT};padding:6pt;vertical-align:top}
tr{break-inside:avoid}
td.n{white-space:nowrap;font-variant-numeric:tabular-nums}
.g{display:inline-block;min-width:15pt;text-align:center;border-radius:3pt;font-size:8.5pt;font-weight:700;padding:0 4pt;background:${OR_FOND};color:${OR}}
.gv{color:${GRIS}}
.tuiles{display:grid;grid-template-columns:repeat(4,1fr);gap:6pt;margin:8pt 0 10pt}
.tuile{border:1px solid ${TRAIT};border-radius:5pt;padding:7pt 9pt;break-inside:avoid}
.tuile b{display:block;font-size:16pt;line-height:1.2}
.tuile span{font-size:8pt;color:${GRIS}}
.duo{display:flex;gap:10pt;margin:6pt 0 4pt}
.duo>div{flex:1;border:1px solid ${TRAIT};border-radius:5pt;padding:8pt 10pt;break-inside:avoid}
.duo h3{margin-top:0}
.plait h3{color:${VERT}} .bloque h3{color:${ROUGE}}
ul{margin:0;padding-left:14pt} li{margin:3pt 0}
.cpt{color:${GRIS};font-size:9pt}
.baro{position:relative;height:96pt;margin:6pt 60pt 2pt 4pt;break-inside:avoid}
.baro .rail{position:absolute;left:0;right:0;top:44pt;height:7pt;border-radius:4pt;border:1px solid ${TRAIT};background:linear-gradient(90deg,#f8e6e0,#fbeedd 55%,#e6f2e9)}
.rep{position:absolute;top:38pt;width:1.5pt;height:19pt;background:${ENCRE}}
.rep span{position:absolute;white-space:nowrap;font-size:8.5pt;line-height:1.3;left:-3pt}
.rep.haut span{bottom:22pt} .rep.bas span{top:22pt}
.rep.dr span,.rep.fin span{left:auto;right:-3pt;text-align:right}
.rep.fin span{right:-56pt;left:auto;text-align:right}
.pistes{display:flex;gap:8pt;margin:6pt 0}
.piste{flex:1;border:1px solid ${TRAIT};border-radius:5pt;padding:8pt 10pt;break-inside:avoid;font-size:9.5pt}
.piste b{display:block;margin-bottom:3pt;font-size:10pt}
.piste small{display:block;color:${GRIS};margin-top:5pt;font-size:8.5pt}
.leg{font-size:8.5pt;color:${GRIS};margin-top:5pt}
.sig{margin-top:18pt;color:${GRIS};font-size:9.5pt;white-space:pre-line}
.vide{color:${GRIS};font-style:italic}
</style></head><body>
<div class="sur">Compte rendu de commercialisation</div>
<h1>${ech(c.bien)}</h1>
<p class="per">${ech(c.periode)}</p>

<h2>Les actions menées</h2>
${c.actions.length ? `<table><thead><tr><th>Date</th><th>Action</th><th>Mode de contact</th><th>Acquéreurs</th></tr></thead><tbody>${c.actions.map((a) =>
    `<tr><td class="n">${ech(a.date)}</td><td>${ech(a.libelle)}</td><td>${ech(a.mode)}</td><td class="n">${ech(a.nombre)}</td></tr>`).join("")}</tbody></table>`
    : `<p class="vide">Aucun envoi n'est enregistré sur la période.</p>`}
${tuiles(c.chiffresDetail)}

${c.diffusion.length ? `<h2>La diffusion de l'annonce</h2>${c.diffusion.map((d) =>
    `<h3>${ech(d.source)}</h3>${tuiles(d.lignes.map((l) => ({ valeur: l.valeur, libelle: l.libelle })))}${plein(d.note) ? `<p class="leg">${ech(d.note)}</p>` : ""}`).join("")}` : ""}

<h2>Les retours des acquéreurs</h2>
${c.retours.length ? `<table><thead><tr><th>Acquéreur</th><th>Note</th><th>Retour</th></tr></thead><tbody>${c.retours.map((r) =>
    `<tr><td>${ech(r.qui)}</td><td>${note(r.note)}</td><td>${ech(r.texte)}</td></tr>`).join("")}</tbody></table>`
    : `<p class="vide">Aucun retour motivé pour l'instant.</p>`}
${plein(c.retoursNote) ? `<p class="leg">${ech(c.retoursNote)}</p>` : ""}

<h2>Les visites</h2>
${c.visites.length ? `<table><thead><tr><th>Date</th><th>Visiteur</th><th>Note</th><th>Retour de visite</th></tr></thead><tbody>${c.visites.map((v) =>
    `<tr><td class="n">${ech(v.date)}</td><td>${ech(v.qui)}</td><td>${note(v.note)}</td><td>${ech(v.texte)}</td></tr>`).join("")}</tbody></table>`
    : `<p class="vide">Aucune visite effectuée pour l'instant.</p>`}

${c.offres.length ? `<h2>Les offres</h2><table><thead><tr><th>Date</th><th>Acquéreur</th><th>Note</th><th>Montant</th><th>Suite</th></tr></thead><tbody>${c.offres.map((o) =>
    `<tr><td class="n">${ech(o.date)}</td><td>${ech(o.qui)}</td><td>${note(o.note)}</td><td class="n">${ech(o.montant)}</td><td>${ech(o.statut)}</td></tr>`).join("")}</tbody></table>` : ""}
${plein(c.legende) ? `<p class="leg">${ech(c.legende).replace(/\n/g, "<br>")}</p>` : ""}

${aDiagnostic ? `<h2>Où en est la vente</h2>
${points(c.plait) || points(c.bloque) ? `<div class="duo">
<div class="plait"><h3>Ce qui plaît</h3>${points(c.plait) ? `<ul>${points(c.plait)}</ul>` : `<p class="vide">Rien de marquant dans les retours.</p>`}</div>
<div class="bloque"><h3>Ce qui bloque</h3>${points(c.bloque) ? `<ul>${points(c.bloque)}</ul>` : `<p class="vide">Rien de marquant dans les retours.</p>`}</div>
</div>` : ""}
${c.barometre ? `<h3>Le baromètre de prix</h3>${barometrePdf(c.barometre)}${plein(c.barometre.commentaire) ? `<p class="leg">${ech(c.barometre.commentaire)}</p>` : ""}` : ""}
${pistes.length ? `<h3>${pistes.length > 1 ? `${pistes.length} pistes pour vendre` : "Une piste pour vendre"}</h3><div class="pistes">${pistes.map((p) =>
    `<div class="piste"><b>${ech(p.titre)}</b>${ech(p.texte)}${plein(p.implique) ? `<small>Ce que ça implique : ${ech(p.implique)}</small>` : ""}</div>`).join("")}</div>` : ""}
${plein(c.suite) ? `<h3>La suite</h3>${paras(c.suite, "")}` : ""}` : ""}

${plein(c.libre) ? `<h2>Notre analyse</h2>${paras(c.libre, "")}` : ""}
<div class="sig">${ech(c.signature)}</div>
</body></html>`;
}
