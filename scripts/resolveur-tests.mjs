/**
 * Le résolveur des tests : « ./machin » retrouve « ./machin.ts ».
 *
 * Node 22.22 ne devine plus l'extension d'un import relatif. Les fichiers de
 * l'application, eux, importent sans extension — c'est ce que le bundler Next
 * attend, et y ajouter « .ts » casserait le build. Le problème n'est donc pas
 * dans le code : il est dans la façon de le lancer hors de Next.
 *
 * D'où ce crochet, branché par `npm run test` et par lui seul. Il ne tente
 * l'ajout d'extension QUE si la résolution normale a échoué : un import qui
 * marche déjà n'est jamais réinterprété.
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (!specifier.startsWith(".") || /\.[mc]?[jt]sx?$/.test(specifier)) throw err;
    for (const ext of [".ts", ".tsx", ".mts"]) {
      try {
        return await nextResolve(specifier + ext, context);
      } catch {
        /* on essaie l'extension suivante */
      }
    }
    throw err;
  }
}
