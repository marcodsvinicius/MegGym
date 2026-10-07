# MegGym
academia em casa

App web (mobile first) de treino: lista de exercícios por **grupo muscular**, criação de **treinos**, execução marcando cada exercício e **histórico** de atividade. Os exercícios são cadastrados por uma **área de admin** e ficam salvos no próprio repositório (modo GitHub) ou no **Supabase** (modo banco). O site roda no **GitHub Pages**, sem custo.

- **Site:** `https://marcodsvinicius.github.io/MegGym/`
- **Admin:** `https://marcodsvinicius.github.io/MegGym/admin.html`

## Como funciona o app

- **Onboarding:** boas-vindas → nome, idade e sexo → equipamentos que tem em casa (perfis ficam no aparelho).
- **Filtro de equipamentos:** a lista de exercícios e a montagem de treino mostram só o que dá para fazer com os equipamentos do perfil (dá para ver todos).
- **Personalização:** 3 estilos (Suave — padrão, Energia, Esportivo), cada um com modo claro/escuro/automático. Escolhido no onboarding (passo "Deixe a sua cara") e em Configurações; fica salvo no perfil.
- **Configurações** (Atividade → ⚙): estilo e modo, editar perfil, equipamentos e sair.
- **Menu inferior:** Início · Treinos · Exercícios · Atividade.
- **Exercícios:** lista por grupo muscular. Qualquer pessoa pode cadastrar exercícios novos (botão ＋ Novo).
- **Treinos:** nome, descrição e exercícios (com séries × repetições). Os grupos musculares do treino são calculados a partir dos exercícios. Todos os perfis do aparelho veem todos os treinos.
- **Executar:** "Iniciar treino" abre a lista para marcar cada exercício; com todos marcados, "Terminar treino" registra dia, horário e duração.
- **Treino de hoje:** no Início, sugere o próximo treino (da estrutura seguida ou o que vem depois do último feito).
- **Durante o treino:** séries com repetições e peso (mostra o que foi feito da última vez), temporizador de descanso por treino (padrão 60s, continua certo com a tela apagada, bipe e vibração no fim) e menu ⋮ em cada exercício para pular, trocar por outro do mesmo grupo ou mudar a ordem.
- **Atividade:** perfil, evolução das últimas 8 semanas (treinos, tempo ou volume), músculos trabalhados em 30 dias, cargas por exercício e histórico.
- **Evolução por exercício:** gráfico de barras com alternador Peso/Repetições, salvo por usuário.
- **Backup:** Configurações → Exportar/Importar backup (arquivo .json com perfil, histórico, pesos, anotações e data/hora do backup). Na tela de boas-vindas dá para restaurar um backup.

> Por enquanto, perfis, treinos, histórico e exercícios cadastrados no app ficam salvos **só no navegador do aparelho** (localStorage). Os exercícios base vêm de `data/exercises.json`.

## Instalar como app (PWA)

O MegGym pode ser instalado pelo navegador e abre em tela cheia, como um app, inclusive sem internet.

- **Cartão "Instale o MegGym"** no topo da tela inicial (some depois de instalado). O botão instala com um toque quando o navegador permite; senão abre o passo a passo do aparelho (Android, Samsung Internet, iPhone ou computador).
- **iPhone (Safari):** Compartilhar → **Adicionar à Tela de Início**. O app mostra essas instruções.

> **Ao publicar mudanças no app**, aumente `VERSION` em `sw.js` e o `?v=` dos arquivos no `index.html` (e na lista `CORE` do `sw.js`). Assim o celular baixa a versão nova em vez de usar a guardada.

## Ícones

O app usa ícones do **Material Symbols** (Google), guardados em `assets/fonts/` só com os ícones usados (≈50 KB, funciona offline). Para usar um ícone novo: escreva `icon("nome_do_icone")` no código e rode `python3 tools/update-icons.py`. Nomes em https://fonts.google.com/icons.

## Treinos que vêm com o app

`data/workouts.json` traz treinos prontos. Ao subir a `version`, o app aplica a lista **uma vez** em cada aparelho; com `"replaceExisting": true` ele apaga os treinos salvos no aparelho e deixa só os do arquivo (o histórico é mantido).

## Como publicar (uma vez só)

1. Faça o merge deste código na branch `main`.
2. No GitHub, abra o repositório → **Settings → Pages**.
3. Em **Build and deployment → Source**, escolha **Deploy from a branch**, branch **`main`**, pasta **`/ (root)`** e clique em **Save**.
4. Em 1–2 minutos o site fica no ar no endereço acima.

## Onde os dados ficam: GitHub ou Supabase

Em [`assets/js/config.js`](assets/js/config.js), a opção `BACKEND` escolhe o modo:

| `BACKEND` | Dados | Admin |
|---|---|---|
| `"github"` (atual) | `data/exercises.json` no repositório | token pessoal do GitHub; cada salvamento vira um commit (site atualiza em ~1 min) |
| `"supabase"` | banco Supabase | login com e-mail/senha, cadastro por convite, aba Acesso |

Para trocar, edite essa linha e faça commit. Toda a configuração do Supabase (URL, chave pública e os arquivos `supabase/*.sql`) continua guardada no repositório.

### Modo GitHub: criar o token
1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token** (atalho: https://github.com/settings/personal-access-tokens/new).
2. **Repository access:** *Only select repositories* → `MegGym`.
3. **Permissions → Contents:** *Read and write*.
4. Abra `admin.html`, cole o token e clique em **Conectar**.

### Voltar para o Supabase depois
1. Se o projeto ficou parado, abra o painel do Supabase e clique em **Restore project** (projetos gratuitos pausam após ~7 dias sem uso).
2. Se você cadastrou exercícios no modo GitHub e quer levá-los para o banco, peça para gerar um SQL a partir do `data/exercises.json`.
3. Troque `BACKEND` para `"supabase"` em `assets/js/config.js`.

## Banco de dados (Supabase)

Os exercícios ficam num banco **Supabase** (plano gratuito). O site lê direto do banco, então o que você cadastra aparece na hora. Se o Supabase estiver fora do ar, o site usa o `data/exercises.json` como reserva.

### Configuração (uma vez só)
1. No painel do Supabase, abra **SQL Editor → New query**.
2. Cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) (o e-mail de admin já está nele).
3. Clique em **Run**. Isso cria as tabelas, as regras de segurança, o espaço para imagens e os exercícios iniciais.
4. Em **Authentication → Users → Add user → Create new user**, crie seu usuário com o **mesmo e-mail**, uma senha e marque **Auto Confirm User**.

### Convites (criar conta pelo site)
1. Rode também [`supabase/convites.sql`](supabase/convites.sql) no SQL Editor.
2. Em **Authentication → Sign In / Providers**, deixe **Allow new users to sign up** ligado. Sem um código válido o banco recusa o cadastro.
3. Em **Authentication → URL Configuration**, coloque em **Site URL** `https://marcodsvinicius.github.io/MegGym/admin.html` (para os links de confirmação e de nova senha voltarem ao admin).
4. No admin, aba **Acesso**: gere códigos (aleatórios ou personalizados, com limite de usos e validade), veja quem entrou e remova acessos.

### Usar o admin
Abra `admin.html`, entre com e-mail e senha e cadastre. Só os e-mails da tabela `admins` conseguem salvar. Para dar acesso a outra pessoa, crie o usuário dela e rode:

```sql
insert into public.admins (email) values ('email@dela.com');
```

> A chave que fica em `assets/js/config.js` é a **publishable** (pública). Nunca coloque a chave **secret** no código.

## Estrutura

```
index.html            app (login, treinos, exercícios, atividade)
assets/js/store.js    dados salvos no aparelho (perfis, treinos, histórico)
assets/js/pwa.js      instalação do app e registro do service worker
assets/js/theme.js    estilo (suave/energia/esportivo) e modo claro/escuro, aplicados antes de desenhar
sw.js                 service worker (cache/offline)
manifest.webmanifest  nome, ícones e cores do app instalado
assets/icons/         ícones do app (instalação)
assets/fonts/         ícones Material Symbols + fontes de cada estilo (só baixa a do estilo em uso)
data/workouts.json    treinos que vêm com o app
tools/update-icons.py gera a fonte de ícones
admin.html            área de cadastro
supabase/schema.sql   tabelas, segurança e dados iniciais do banco
data/exercises.json   cópia de reserva dos dados (usada se o Supabase falhar)
assets/css/style.css  estilos (responsivo, tema claro/escuro)
assets/js/config.js   modo (BACKEND), URL e chave pública do Supabase
assets/js/supabase.js cliente da API do Supabase (banco, login, imagens)
assets/js/common.js   funções compartilhadas
assets/js/app.js      telas e navegação do app
assets/js/admin.js    lógica do admin (modo Supabase)
assets/js/admin-github.js  lógica do admin (modo GitHub)
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

## Testes automáticos

`tests/` tem testes com Playwright: dados (`exercises.json`, `workouts.json`, versão de cache) e os fluxos do app (onboarding, treino com séries/descanso/pular/trocar, gráficos, backup e todas as telas abrindo sem erro). Rodam sozinhos no GitHub a cada envio (aba **Actions**).

```bash
npm install
npx playwright install chromium
npm test            # MOTION=1 npm test roda com as animações ligadas
```
