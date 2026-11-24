import "server-only";

/**
 * Le capital social d'une société, au registre national des entreprises.
 *
 * Retour #208 : « il manque l'info du RCS et du capital social cherché
 * automatiquement, tu peux le faire ? » Le greffe se déduit du siège (voir
 * lib/bo/greffes.ts). Le capital, lui, ne figure dans aucune base publique
 * ouverte : l'annuaire des entreprises de la DINUM s'arrête au SIREN, à la
 * raison sociale et au siège. Il faut le registre lui-même, dont l'API demande
 * un compte data.inpi.fr — gratuit, mais nominatif.
 *
 * D'où ce module, qui ne fait rien tant que les identifiants ne sont pas
 * posés : sans eux, le capital reste à saisir à la main, comme avant. Aucun
 * écran ne casse, aucune erreur ne remonte à l'agent.
 *
 * Les identifiants vivent en variables d'environnement du serveur, jamais dans
 * le dépôt ni dans une page : ils valent lecture sur tout le registre.
 */

const BASE = "https://registre-national-entreprises.inpi.fr/api";

/* Le jeton vaut une heure. On le garde en mémoire du processus plutôt que de
   se reconnecter à chaque société cherchée — l'INPI compte les connexions. */
let jeton: { valeur: string; expire: number } | null = null;

async function connexion(): Promise<string | null> {
  const username = process.env.INPI_USER;
  const password = process.env.INPI_PASS;
  if (!username || !password) return null;
  if (jeton && jeton.expire > Date.now()) return jeton.valeur;

  const r = await fetch(`${BASE}/sso/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    cache: "no-store",
  }).catch(() => null);
  if (!r?.ok) {
    console.error("[inpi] connexion refusée", r?.status);
    return null;
  }
  const d = (await r.json().catch(() => null)) as { token?: string } | null;
  if (!d?.token) return null;
  // Une marge de cinq minutes : mieux vaut se reconnecter un peu tôt que de
  // buter sur un jeton périmé au milieu d'une recherche.
  jeton = { valeur: d.token, expire: Date.now() + 55 * 60 * 1000 };
  return d.token;
}

/** Là où le registre range le capital d'une personne morale. */
type Fiche = {
  formality?: {
    content?: {
      personneMorale?: {
        identite?: {
          description?: { montantCapital?: number; deviseCapital?: string };
        };
      };
    };
  };
};

/**
 * Le capital social en euros, ou `undefined` si le registre ne le donne pas —
 * société non immatriculée, entrepreneur individuel, capital en devise, ou
 * simplement pas d'identifiants configurés.
 */
export async function capitalSocial(siren: string): Promise<number | undefined> {
  const s = (siren ?? "").replace(/\D/g, "");
  if (s.length !== 9) return undefined;
  const token = await connexion();
  if (!token) return undefined;

  const r = await fetch(`${BASE}/companies/${s}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 86400 },
  }).catch(() => null);
  if (!r?.ok) {
    /* 401 : le jeton a été invalidé plus tôt que prévu. On l'oublie pour que
       la recherche suivante se reconnecte au lieu de rejouer un jeton mort. */
    if (r?.status === 401) jeton = null;
    return undefined;
  }
  const d = (await r.json().catch(() => null)) as Fiche | null;
  const desc = d?.formality?.content?.personneMorale?.identite?.description;
  // Une SCI au capital en francs suisses existe : on ne l'écrira pas en euros.
  if (desc?.deviseCapital && !/^eur/i.test(desc.deviseCapital)) return undefined;
  const v = desc?.montantCapital;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}
