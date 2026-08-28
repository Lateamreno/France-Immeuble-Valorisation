// Résolveur d'extensions pour les scripts de test lancés hors Next.
// Le dépôt importe sans extension (`./format`), ce que le strip-types de
// node ne sait pas résoudre seul.
import { existsSync } from "node:fs";
export async function resolve(spec, ctx, next) {
  if (spec.startsWith(".") && !/\.[a-z]+$/.test(spec)) {
    const base = new URL(spec, ctx.parentURL);
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      const u = new URL(base.href + ext);
      if (existsSync(u)) return next(spec + ext, ctx);
    }
  }
  return next(spec, ctx);
}
