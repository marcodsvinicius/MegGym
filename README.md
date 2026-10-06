# MegGym
academia em casa

Site responsivo para escolher um **grupo muscular** e ver os exercícios sugeridos (nome, descrição, séries, repetições, descanso, dificuldade, imagem/GIF e vídeo). Os exercícios são cadastrados por uma **área de admin** com login e ficam salvos no **Supabase**. O site roda no **GitHub Pages**, sem custo.

- **Site:** `https://marcodsvinicius.github.io/MegGym/`
- **Admin:** `https://marcodsvinicius.github.io/MegGym/admin.html`

## Como publicar (uma vez só)

1. Faça o merge deste código na branch `main`.
2. No GitHub, abra o repositório → **Settings → Pages**.
3. Em **Build and deployment → Source**, escolha **Deploy from a branch**, branch **`main`**, pasta **`/ (root)`** e clique em **Save**.
4. Em 1–2 minutos o site fica no ar no endereço acima.

## Banco de dados (Supabase)

Os exercícios ficam num banco **Supabase** (plano gratuito). O site lê direto do banco, então o que você cadastra aparece na hora. Se o Supabase estiver fora do ar, o site usa o `data/exercises.json` como reserva.

### Configuração (uma vez só)
1. No painel do Supabase, abra **SQL Editor → New query**.
2. Cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e **troque `SEU_EMAIL_AQUI@exemplo.com` pelo seu e-mail** (linha do `insert into public.admins`).
3. Clique em **Run**. Isso cria as tabelas, as regras de segurança, o espaço para imagens e os exercícios iniciais.
4. Em **Authentication → Users → Add user → Create new user**, crie seu usuário com o **mesmo e-mail**, uma senha e marque **Auto Confirm User**.
5. (Recomendado) Em **Authentication → Sign In / Providers**, desligue **Allow new users to sign up**.

### Usar o admin
Abra `admin.html`, entre com e-mail e senha e cadastre. Só os e-mails da tabela `admins` conseguem salvar. Para dar acesso a outra pessoa, crie o usuário dela e rode:

```sql
insert into public.admins (email) values ('email@dela.com');
```

> A chave que fica em `assets/js/config.js` é a **publishable** (pública). Nunca coloque a chave **secret** no código.

## Estrutura

```
index.html            site público (cards de grupos → exercícios)
admin.html            área de cadastro
supabase/schema.sql   tabelas, segurança e dados iniciais do banco
data/exercises.json   cópia de reserva dos dados (usada se o Supabase falhar)
assets/css/style.css  estilos (responsivo, tema claro/escuro)
assets/js/config.js   URL e chave pública do Supabase
assets/js/supabase.js cliente da API do Supabase (banco, login, imagens)
assets/js/common.js   funções compartilhadas
assets/js/app.js      lógica do site
assets/js/admin.js    lógica do admin
```

### Formato de um exercício

```json
{
  "id": "supino-halteres",
  "group": "peito",
  "name": "Supino com halteres",
  "description": "Como executar…",
  "sets": "4",
  "reps": "8-12",
  "rest": "60-90s",
  "difficulty": "intermediario",
  "image": "https://…",
  "video": "https://youtube.com/watch?v=…"
}
```

`difficulty` aceita `iniciante`, `intermediario` ou `avancado`. No banco, o campo `group` se chama `group_id`.

## Rodar localmente

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

(Abrir o `index.html` direto com duplo clique não funciona, porque o navegador bloqueia o carregamento do JSON em `file://`.)
