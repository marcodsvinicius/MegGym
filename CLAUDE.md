# MegGym: contexto do projeto

Este é o resumo das conversas de desenvolvimento, feito para dar contexto a novas sessões.

## O que é
- PWA mobile-first para treinar em casa, todo em português do Brasil.
- Publicado no GitHub Pages: https://marcodsvinicius.github.io/MegGym/ (a página de administração fica em `/admin.html`).
- Hoje os dados ficam no `localStorage`. O Supabase ainda não foi ativado (veja "Pendências").

## Regras do dono (seguir sempre)
- **Não pôr no repositório (que é público) a chave secreta do Supabase nem o código de convite.**
- Não testar contra o Supabase real sem permissão.
- **Não ativar o Supabase** até o dono pedir.
- Sem emojis na interface. A única exceção é "Olá 👋".
- Nomes de exercícios como são chamados no Brasil. Termos em inglês que todo mundo reconhece podem ficar (Leg press, Stiff, Hip thrust…).
- Ícones dos grupos musculares: o dono rejeitou SVGs desenhados à mão. Hoje são usadas as ilustrações do react-native-body-highlighter (licença MIT), recortadas por grupo.
- Fluxo de publicação: commit na branch `claude/exercise-site-muscle-groups-i8queb` e push nela **e** na `main`.

## Stack
- JavaScript puro, sem etapa de build, com rotas por hash (`#/...`).
- `assets/js/store.js` (`window.MegStore`): dados, backup, sessão, histórico de cargas, dono e visibilidade, salvos.
- `assets/js/common.js` (`window.MegGym`): `EQUIPMENT`, `EXERCISE_TYPES`, `escapeHtml`, ícones de grupo (`bodyIcon`).
- `assets/js/app.js`: todas as telas.
- `assets/js/pwa.js`: instalação e aviso de nova versão.
- `assets/js/bodymap.js`: arquivo gerado (MIT).
- `assets/js/admin-github.js`: admin que salva o `data/exercises.json` via API do GitHub. `admin.js` é o admin do Supabase, ainda desativado.
- `data/exercises.json`: grupos e exercícios, com os campos `type` (reps/unilateral/tempo), `equipment`, `equipmentAny` e `video`.
- `sw.js`: service worker. Não ativa sozinho (sem skipWaiting automático): o app mostra a barra "nova versão disponível".

## A cada publicação (obrigatório)
- Aumente o `?v=N` em `index.html`, `admin.html`, `sw.js` e `assets/css/style.css` (a URL da fonte também é versionada).
- Aumente também o `VERSION` no `sw.js`.
- Versão atual: **v48**.

Outros cuidados:
- Ícones: a fonte Material Symbols é um subconjunto. Ao usar um ícone novo, rode `python3 tools/update-icons.py`. Ícones que o script não detecta sozinho vão na lista `EXTRA`.
- Design system: tokens em `:root` (`--space-*`, `--fs-*`, `--accent-ink`, `--on-success`…). Os 3 estilos (suave, energia, esportivo) só trocam tokens.
- Ícones do mapa corporal: os SVGs usam `<use>`, então o CSS precisa mirar `#bm-sprite ...`.

## Testes
- Comando: `npm test` (Playwright e axe-core, via `node --test`). São 22 testes, todos passando.
- Também rodam no GitHub Actions (`.github/workflows/testes.yml`).
- Para tirar prints de telas: navegue antes para `#/x`, senão a tela não renderiza de novo quando o hash não muda.

## Funcionalidades prontas
- **Exercício:**
  - Carga no topo; tabela por série com repetições, peso e check.
  - O check inicia o descanso com timer. O timer sobrevive a recarregar a página, emite bipe e mantém a tela ligada.
  - Descanso configurável por treino; RIR com tooltip; "Última vez" em cada série.
- **Execução do treino:**
  - Histórico de cargas com gráfico (alternando Peso e Repetições).
  - Recorde pessoal.
  - Tipos de exercício: repetições, unilateral e tempo (com cronômetro).
  - Bi-set e super-set.
- **Durante o treino:** pular, trocar e reordenar exercícios. No fim da lista há um card para terminar antes ou descartar o treino. Ao terminar, é possível compartilhar um resumo em imagem.
- **Início:** card "Treino de hoje"; motivação dentro de "Sua semana"; card de instalação com botão de fechar (depois de fechado, a opção fica em Configurações).
- **Atividade:** abas Resumo, Evolução e Histórico.
- **Treinos:**
  - Abas Meu Treino, Explorar e Salvos.
  - Treino e Divisão (A/B/C…), cada um público ou privado; dá para salvar, seguir e copiar.
- **Formulário de treino:** exercícios primeiro, escolhidos numa folha (sheet); o resto fica em "Mais opções".
- **Dados e qualidade:**
  - Backup: exporta e importa com data e hora; a restauração é oferecida no cadastro.
  - Aviso de "nova versão"; tour de primeiro uso; telas vazias; animações; revisão de acessibilidade (axe).
  - Aviso quando o aparelho não consegue salvar (armazenamento cheio).
- **Conteúdo e admin:**
  - Admin pelo GitHub: cadastra exercício com tipo e equipamentos e faz upload de imagem.
  - Todos os exercícios têm vídeo (curadoria: vídeos curtos e objetivos).
- **Perfil:** idade e sexo ficam guardados para uso futuro.

## Pendências e próximos passos
- **Supabase (só quando o dono pedir). O que já foi combinado:**
  - Login por e-mail e convite; dados por usuário.
  - Meus treinos e comunidade (Explorar), com regras de acesso no banco: privado só para o dono, e só o dono edita.
  - Funcionar offline e sincronizar depois.
  - No primeiro login, migrar os dados locais usando o formato do backup.
  - Atualizar `admin.js` (Supabase) com tipo e equipamentos.
  - Chave secreta e código de convite nunca vão para o repositório; só a chave pública.
- Testar instalação e atualização em iPhone (Safari) e Android reais.
