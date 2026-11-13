/* Chiffrement des mots de passe de boîte e-mail.
 *
 * Un mot de passe de messagerie ouvre TOUTE la boîte : la correspondance
 * professionnelle, mais aussi ce qui ne l'est pas. Il n'a donc rien à faire en
 * clair dans une base de données, même privée.
 *
 * AES-256-GCM : chiffrement authentifié — une valeur modifiée ne se déchiffre
 * pas, elle échoue. La clé vit dans MAIL_CRYPTO_KEY et ne quitte jamais le
 * serveur ; sans elle, la table ne dit rien à personne.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const MARQUE = "v1";

/** Clé de 32 octets dérivée du secret. Absente = on refuse de stocker. */
function cle(): Buffer | null {
  const brut = process.env.MAIL_CRYPTO_KEY?.trim();
  if (!brut || brut.length < 16) return null;
  /* Un secret lisible par un humain n'a pas 32 octets : on le passe au SHA-256
     pour obtenir une clé de la bonne taille sans imposer un format. */
  return createHash("sha256").update(brut).digest();
}

export const chiffrementDisponible = () => cle() !== null;

/** `v1.<iv>.<tag>.<chiffré>`, tout en base64url. */
export function chiffrer(clair: string): string {
  const k = cle();
  if (!k) throw new Error("MAIL_CRYPTO_KEY absente : impossible d'enregistrer un mot de passe.");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const chiffre = Buffer.concat([c.update(clair, "utf8"), c.final()]);
  return [MARQUE, iv.toString("base64url"), c.getAuthTag().toString("base64url"), chiffre.toString("base64url")].join(".");
}

/** Rend le mot de passe, ou `undefined` si la valeur n'est pas déchiffrable. */
export function dechiffrer(cache: string): string | undefined {
  const k = cle();
  if (!k) return undefined;
  const [marque, iv, tag, corps] = (cache ?? "").split(".");
  if (marque !== MARQUE || !iv || !tag || !corps) return undefined;
  try {
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(corps, "base64url")), d.final()]).toString("utf8");
  } catch {
    /* Clé changée, ou valeur abîmée. On ne devine pas : la boîte est à
       reconfigurer, et c'est ce que l'écran dira. */
    return undefined;
  }
}

/** Ce qu'on montre à l'écran d'un mot de passe : sa présence, rien d'autre. */
export const masque = (v?: string) => (v ? "••••••••" : "");
