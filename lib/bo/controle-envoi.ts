/**
 * Ce qu'il faut savoir AVANT d'appuyer sur le bouton d'envoi (retour #360).
 *
 * MAV : « c'est bien qu'ils mettent effectivement le nombre de clients qui
 * recevront un e-mail et éventuellement dire s'il y a des doublons […], les
 * e-mails qui semblent incorrects etc… pour nous permettre de vérifier les
 * fiches acquéreurs correspondantes. »
 *
 * Règles pures, sans réseau ni React : une salve part chez quelques centaines
 * de personnes, le compte doit être juste et il doit être testable.
 *
 * Principe tenu partout ici : on n'écarte JAMAIS quelqu'un en silence. Chaque
 * ligne mise de côté est rendue avec sa raison et l'identifiant de son contact,
 * pour que l'écran puisse pointer la fiche à corriger.
 */

export type Cible = {
  rechercheId: string;
  contactId?: string;
  nom: string;
  email?: string;
  telephone?: string;
};

export type LigneEcartee = {
  nom: string;
  contactId?: string;
  valeur?: string;
  raison: string;
};

export type ControleEnvoi = {
  /** Ce qui partira vraiment, dédoublonné. */
  adresses: string[];
  /** Nombre de personnes derrière ces adresses. */
  personnes: number;
  /** Même adresse retenue pour plusieurs recherches : une seule part. */
  doublons: { valeur: string; noms: string[] }[];
  /** Adresses qui ne ressemblent pas à des adresses. */
  invalides: LigneEcartee[];
  /** Acquéreurs ciblés sans aucune adresse. */
  sansAdresse: LigneEcartee[];
};

/**
 * Une adresse e-mail plausible ?
 *
 * Volontairement plus sévère que la RFC, qui accepte des choses qu'aucun
 * serveur n'accepte. Ce qu'on cherche, ce sont les fautes de saisie réelles :
 * l'espace, l'arobase manquante ou doublée, le domaine sans point, le
 * « .con » final. Un faux positif se corrige en deux secondes sur la fiche ;
 * une adresse cassée envoyée en salve abîme la réputation du domaine.
 */
export function emailPlausible(v: string): { ok: boolean; raison?: string } {
  const s = v.trim();
  if (!s) return { ok: false, raison: "vide" };
  if (/\s/.test(s)) return { ok: false, raison: "contient une espace" };
  const arobases = (s.match(/@/g) ?? []).length;
  if (arobases === 0) return { ok: false, raison: "pas d'arobase" };
  if (arobases > 1) return { ok: false, raison: "plusieurs arobases" };
  const [avant, apres] = s.split("@");
  if (!avant) return { ok: false, raison: "rien avant l'arobase" };
  if (!apres.includes(".")) return { ok: false, raison: "domaine sans point" };
  if (/^[.-]|[.-]$/.test(avant)) return { ok: false, raison: "commence ou finit par un point" };
  if (/\.\./.test(s)) return { ok: false, raison: "deux points de suite" };
  const ext = apres.split(".").pop() ?? "";
  if (ext.length < 2) return { ok: false, raison: "extension trop courte" };
  if (!/^[a-z]{2,}$/i.test(ext)) return { ok: false, raison: `extension « .${ext} » douteuse` };
  if (!/^[A-Za-z0-9._%+-]+$/.test(avant)) return { ok: false, raison: "caractère interdit avant l'arobase" };
  if (!/^[A-Za-z0-9.-]+$/.test(apres)) return { ok: false, raison: "caractère interdit dans le domaine" };
  return { ok: true };
}

/**
 * Les fautes de frappe les plus fréquentes sur les grands fournisseurs.
 *
 * Elles passent toutes les vérifications de forme — « gmial.com » est une
 * adresse parfaitement valide, elle n'existe simplement pas. Les signaler
 * sans les écarter : c'est un doute, pas une certitude.
 */
const DOMAINES_PROCHES: Record<string, string> = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmail.fr": "gmail.com",
  "gmail.co": "gmail.com", "gmailcom": "gmail.com", "gnail.com": "gmail.com",
  "hotmai.com": "hotmail.com", "hotmail.co": "hotmail.com", "hotmial.com": "hotmail.com",
  "outlok.com": "outlook.com", "outloo.com": "outlook.com",
  "wanadou.fr": "wanadoo.fr", "orang.fr": "orange.fr", "oranges.fr": "orange.fr",
  "yaho.fr": "yahoo.fr", "yahou.fr": "yahoo.fr", "free.f": "free.fr",
};

/** Le domaine ressemble-t-il à un grand fournisseur mal tapé ? */
export const domaineSuspect = (email: string): string | undefined =>
  DOMAINES_PROCHES[(email.split("@")[1] ?? "").toLowerCase()];

/** Comparaison d'adresses : la casse et les espaces ne font pas deux personnes. */
const clefEmail = (v: string) => v.trim().toLowerCase();

/**
 * Le contrôle complet, avant envoi.
 *
 * `dejaVus` sert aux désinscrits et aux adresses déjà écartées ailleurs :
 * l'appelant décide de ce qu'il y met, la fonction se contente de les compter
 * comme écartés avec la raison donnée.
 */
export function controlerEnvoi(
  cibles: Cible[],
  options: { exclues?: Map<string, string> } = {},
): ControleEnvoi {
  const exclues = options.exclues ?? new Map<string, string>();
  const retenues = new Map<string, string[]>();
  const invalides: LigneEcartee[] = [];
  const sansAdresse: LigneEcartee[] = [];

  for (const c of cibles) {
    const brut = (c.email ?? "").trim();
    if (!brut) {
      sansAdresse.push({ nom: c.nom, contactId: c.contactId, raison: "aucune adresse e-mail sur la fiche" });
      continue;
    }
    const v = emailPlausible(brut);
    if (!v.ok) {
      invalides.push({ nom: c.nom, contactId: c.contactId, valeur: brut, raison: v.raison! });
      continue;
    }
    const cle = clefEmail(brut);
    const exclue = exclues.get(cle);
    if (exclue) {
      invalides.push({ nom: c.nom, contactId: c.contactId, valeur: brut, raison: exclue });
      continue;
    }
    const vu = retenues.get(cle);
    if (vu) vu.push(c.nom);
    else retenues.set(cle, [c.nom]);
  }

  const doublons = [...retenues.entries()]
    .filter(([, noms]) => noms.length > 1)
    .map(([valeur, noms]) => ({ valeur, noms }));

  return {
    adresses: [...retenues.keys()],
    /* Une adresse = une personne. Deux recherches du même client ne font pas
       deux destinataires — c'est tout l'intérêt du dédoublonnage, et c'est ce
       que MAV veut voir affiché. */
    personnes: retenues.size,
    doublons,
    invalides,
    sansAdresse,
  };
}

/**
 * Le poids total des pièces jointes, et ce qu'il vaut (retour #359).
 *
 * MAV : « la limite de poids serait 2 Mo ou 3 Mo max de PJ total y compris le
 * dossier pour assurer une meilleure délivrabilité ».
 *
 * Deux plafonds distincts, à ne pas confondre :
 *   • 3 Mo — le nôtre, pour la délivrabilité. Au-delà, les filtres deviennent
 *     sévères et le message se fait jeter avant d'être lu ;
 *   • 5 Mo par fichier — celui de MailingVox, qui refuse simplement l'import.
 *     Il ne sert pas ici (les e-mails partent par SendGrid) mais s'appliquera
 *     si un jour une pièce jointe passe par eux.
 */
export const PLAFOND_PJ_OCTETS = 3 * 1024 * 1024;

export type VerdictPieces = {
  octets: number;
  mo: number;
  depasse: boolean;
  message: string;
};

export function peserPiecesJointes(tailles: (number | undefined)[]): VerdictPieces {
  const connues = tailles.filter((t): t is number => typeof t === "number" && t > 0);
  const inconnues = tailles.length - connues.length;
  const octets = connues.reduce((s, t) => s + t, 0);
  const mo = octets / 1_048_576;
  const depasse = octets > PLAFOND_PJ_OCTETS;

  if (tailles.length === 0) return { octets: 0, mo: 0, depasse: false, message: "Aucune pièce jointe." };
  const mof = mo.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const debut = `${mof} Mo de pièces jointes`;
  if (inconnues > 0) {
    /* Aucun poids connu : annoncer « 0,0 Mo » ferait croire à des pièces
       vides. On dit ce qu'on sait — leur nombre — et rien de plus. */
    const pluriel = inconnues > 1 ? "s" : "";
    if (connues.length === 0) {
      return {
        octets, mo, depasse,
        message: `${inconnues} pièce${pluriel} jointe${pluriel} dont l'hébergeur ne donne pas le poids.`,
      };
    }
    return {
      octets, mo, depasse,
      message: `${debut}, plus ${inconnues} fichier${pluriel} dont l'hébergeur ne donne pas le poids.`,
    };
  }
  return {
    octets, mo, depasse,
    message: depasse
      ? `${debut} — au-delà de 3 Mo la délivrabilité chute. Retirez une pièce ou passez par le lien de partage.`
      : debut + ".",
  };
}
