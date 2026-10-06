# MegGym
academia em casa

Site responsivo para escolher um **grupo muscular** e ver os exercícios sugeridos (nome, descrição, séries, repetições, descanso, dificuldade, imagem/GIF e vídeo). Os exercícios são cadastrados por uma **área de admin** que salva tudo direto neste repositório. Roda 100% no **GitHub Pages**, sem servidor e sem custo.

- **Site:** `https://marcodsvinicius.github.io/MegGym/`
- **Admin:** `https://marcodsvinicius.github.io/MegGym/admin.html`

## Como publicar (uma vez só)

1. Faça o merge deste código na branch `main`.
2. No GitHub, abra o repositório → **Settings → Pages**.
3. Em **Build and deployment → Source**, escolha **Deploy from a branch**, branch **`main`**, pasta **`/ (root)`** e clique em **Save**.
4. Em 1–2 minutos o site fica no ar no endereço acima.

## Como cadastrar exercícios

### 1. Crie um token (uma vez por dispositivo)
1. GitHub → foto do perfil → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Repository access:** *Only select repositories* → `MegGym`.
3. **Permissions → Repository permissions → Contents:** *Read and write*.
4. Gere e copie o token (`github_pat_…`).

### 2. Use o admin
1. Abra `admin.html`, cole o token e clique em **Conectar** (usuário, repositório e branch já vêm preenchidos).
2. Na aba **Exercícios**, preencha o formulário e clique em **Salvar**. Para editar ou excluir, use os botões da lista.
3. Na aba **Grupos musculares**, você pode criar, renomear, trocar ícone/cor, reordenar e excluir grupos.

Cada vez que você salva, o admin faz um commit no arquivo `data/exercises.json` (e as imagens enviadas vão para a pasta `images/`). O GitHub Pages republica o site sozinho em cerca de 1 minuto.

> O token fica salvo **apenas no navegador** em que você o colou. Quem não tem um token com acesso ao repositório consegue abrir a página de admin, mas não consegue salvar nada. Use **Esquecer token** em computadores compartilhados.

## Estrutura

```
index.html            site público (cards de grupos → exercícios)
admin.html            área de cadastro
data/exercises.json   grupos e exercícios (fonte de dados)
images/               imagens enviadas pelo admin
assets/css/style.css  estilos (responsivo, tema claro/escuro)
assets/js/common.js   funções compartilhadas
assets/js/app.js      lógica do site
assets/js/admin.js    lógica do admin (API do GitHub)
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
  "image": "https://… ou images/arquivo.gif",
  "video": "https://youtube.com/watch?v=…"
}
```

`difficulty` aceita `iniciante`, `intermediario` ou `avancado`. Também dá para editar esse arquivo direto pelo GitHub, se preferir.

## Rodar localmente

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

(Abrir o `index.html` direto com duplo clique não funciona, porque o navegador bloqueia o carregamento do JSON em `file://`.)
