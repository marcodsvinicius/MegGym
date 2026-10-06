/* Configuração do site.

   BACKEND escolhe onde os exercícios ficam salvos:
     "github"   → arquivo data/exercises.json do repositório (admin usa token do GitHub)
     "supabase" → banco Supabase (admin com login, convites; ver supabase/*.sql)

   A chave "publishable" do Supabase pode ficar no código: quem protege os dados são as
   regras (RLS) definidas em supabase/schema.sql. NUNCA coloque aqui a chave "secret". */
window.MEGGYM_CONFIG = {
  BACKEND: "github",

  SUPABASE_URL: "https://qhfggcorskpfpbvlqadx.supabase.co",
  SUPABASE_KEY: "sb_publishable_RnRLvXlp2uNB1qco6nyJVA_-CGbBFQx",
  IMAGE_BUCKET: "exercise-images",
};
