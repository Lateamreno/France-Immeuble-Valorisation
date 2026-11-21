/* La formation des nouveaux arrivants. Le cours est un document autonome,
   servi derrière la connexion comme le reste du BO, et affiché dans un cadre
   pour garder son propre style sans peser sur la feuille de style du BO. */
export const metadata = { title: "Formation" };

export default function FormationPage() {
  return (
    <iframe
      className="formation-cadre"
      src="/formation-cours.html"
      title="Formation France Immeuble"
    />
  );
}
