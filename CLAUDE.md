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
- `data/exercises.json`: grupos e exercícios, com os campos `type` (reps/unilateral/tempo), `equipment`, `equipmentAny`, `video` e os campos do treinador: `pattern` (padrão de movimento detalhado: empurrar-h/v, puxar-h/v, joelho, joelho-uni, dobradica, extensao-quadril, abducao, flexao-joelho, peito-iso, ombro-lateral, ombro-posterior, cotovelo-flexao/extensao, panturrilha, core-antiextensao/antirrotacao/lateral/flexao/extensao, cardio), `muscles` (grupo: 1 primário, 0.5 secundário), `joints` (lombar, cervical, ombro, cotovelo, punho, quadril, joelho, tornozelo: 1 moderada, 2 alta), `position`, `complexity` (1 a 3), `impact` e `easier`/`harder` (cadeias de progressão). A classificação foi feita por regras de musculação e deve ser revisada por um profissional de Educação Física. São 157 exercícios em 12 grupos (inclui Cardio), todos para treino em casa (sem máquinas).
- `sw.js`: service worker. Não ativa sozinho (sem skipWaiting automático): o app mostra a barra "nova versão disponível".

## A cada publicação (obrigatório)
- Aumente o `?v=N` em `index.html`, `admin.html`, `sw.js` e `assets/css/style.css` (a URL da fonte também é versionada).
- Aumente também o `VERSION` no `sw.js`.
- Versão atual: **v51**.

Outros cuidados:
- Ícones: a fonte Material Symbols é um subconjunto. Ao usar um ícone novo, rode `python3 tools/update-icons.py`. Ícones que o script não detecta sozinho vão na lista `EXTRA`.
- Design system: tokens em `:root` (`--space-*`, `--fs-*`, `--accent-ink`, `--on-success`…). Os 3 estilos (suave, energia, esportivo) só trocam tokens.
- Ícones do mapa corporal: os SVGs usam `<use>`, então o CSS precisa mirar `#bm-sprite ...`.

## Testes
- Comando: `npm test` (Playwright e axe-core, via `node --test`). São 24 testes, todos passando.
- `tests/coach.test.mjs` monta 1.728 combinações no treinador (via `window.MegCoach.build`) e confere as regras de `tests/coach-rules.js` (equipamento, impacto, limitações, gestação, chão, dor, nível, lombar, volume por músculo, puxar >= empurrar, tempo). Ao mudar regras do treinador, atualize os dois.
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
- **Tour de primeiro uso:** 5 passos (treino do dia, séries, opções, apresentação do Treinador e "Sente alguma dor?" com o seletor de limitações).
- **Início:** card "Treino de hoje"; motivação dentro de "Sua semana"; card de instalação com botão de fechar (depois de fechado, a opção fica em Configurações).
- **Atividade:** abas Resumo, Evolução e Histórico. O Resumo mostra "Séries por músculo na semana" (mesmo cálculo do treinador, referência pelo nível) e um botão para montar treino com os músculos que mais faltam (`#/treinador?grupos=...`).
- **Treinos:**
  - Abas Meu Treino, Explorar e Salvos.
  - Treino e Divisão (A/B/C…), cada um público ou privado; dá para salvar, seguir e copiar.
- **Formulário de treino:** exercícios primeiro, escolhidos numa folha (sheet); o resto fica em "Mais opções".
- **Dados e qualidade:**
  - Backup: exporta e importa com data e hora; a restauração é oferecida no cadastro.
  - Aviso de "nova versão"; tour de primeiro uso; telas vazias; animações; revisão de acessibilidade (axe).
  - Aviso quando o aparelho não consegue salvar (armazenamento cheio).
- **Conteúdo e admin:**
  - Admin pelo GitHub: cadastra exercício com tipo, equipamentos, padrão de movimento e impacto, e faz upload de imagem.
  - Ícones de grupo (mapa corporal) só aparecem em cards; em tags e textos em linha ficam só o nome. O ícone do Cardio é o corpo da cabeça às coxas com os músculos em destaque.
  - Todos os exercícios têm vídeo (curadoria: vídeos curtos e objetivos).
- **Treinador** (`#/treinador`, antes `#/assistente`, que ainda funciona; card "Montar um treino agora" na Início e atalho na aba Meu Treino vazia): monta um treino na hora por regras, sem IA.
  - Pergunta tempo, grupos (atalhos só marcam; sugestão pelo histórico das últimas 48h), equipamentos (com opção de salvar no perfil), nível (só na primeira vez, fica em `user.level`) e objetivo (força, ganhar massa, resistência), com interruptores de evitar impacto e incluir aquecimento.
  - Resultado: resumo das escolhas tocável, bloco de aquecimento separado, "Por que esse treino?" e aviso quando há poucos exercícios para o tempo. Trocar abre uma folha com alternativas do mesmo grupo. Exercícios de cardio só entram quando o grupo Cardio é escolhido (ou como aquecimento).
  - Acessibilidade: o foco vai para cada pergunta nova e para o resultado.
  - Também é uma das opções do "+ Novo" em Treinos (`#/treinador?novo=1`, junto com "Criar treino manual" e "Nova divisão"). Nesse caminho o botão principal é "Salvar e ajustar": abre o formulário de treino já preenchido (rascunho). O formulário vazio tem o atalho "Sem ideia? Deixe o treinador montar".
  - Algoritmo (sem IA, `coachBuild` em `app.js`): moldes de vagas por padrão de movimento para cada foco (ou vagas por grupo); o tempo decide quantas vagas entram. Cada vaga pega o exercício de maior nota (músculos ainda não trabalhados, volume que falta na semana, nível e complexidade, recência, demanda articular, dor, progressão).
  - Regras: o mesmo movimento só se repete com outro exercício de fato (fora da cadeia, outro nome e, nos compostos, outra posição ou equipamento); puxar >= empurrar quando há costas; no máximo 1 exercício com lombar alta; até 10 séries por músculo na sessão (secundário conta 0,5); ordem compostos (mais técnicos primeiro) > isolados > core > cardio; bi-set só de músculos diferentes.
  - Prescrição por objetivo, diferente para compostos e isolados (`COACH_GOALS`, `COACH_ISO`), com descanso por item e RIR (3 para iniciante ou região com dor). Peso do corpo e exercícios por tempo usam as repetições do próprio exercício.
  - Limitações (salvas em `user.limits`) são editadas no treinador, em Configurações > Dores e limitações (`#/atividade/limitacoes`) e no último passo do tour de primeiro uso; o seletor é compartilhado (`limitsPickerHtml`/`limitsApply`). Regras: regiões com "incomoda" (menos séries e RIR 3) ou "dói" (tira exercícios com exigência alta naquela articulação); condições (pressão alta, 60+, sem deitar no chão); sinais de alerta (dor forte, irradiada, cirurgia, gestação, dor no peito) ativam o modo cuidadoso e orientam procurar um profissional. Gestação tem regras próprias.
  - Dor por exercício: no resumo do treino feito, "Sentiu dor em algum exercício?" (salva em `user.painLog`). De 4 a 6, o exercício sai e entra a versão mais fácil; 7 ou mais, sai e orienta procurar um profissional.
  - Progressão: exercício com todas as séries no topo da faixa nas 2 últimas vezes é "dominado"; o treinador prefere a versão mais difícil da cadeia ou sugere aumentar a carga.
  - Sugestão na etapa de grupos: músculos com menos séries na semana e que não treinaram nas últimas 48h.
  - Está marcado como **Beta** (selo no card da Início, no cabeçalho e no "+ Novo"; tocar no selo explica que está em testes). No resultado há "O que achou deste treino?": avaliação + comentário, enviados por e-mail (`FEEDBACK_EMAIL` em `config.js`, com escolhas e treino no corpo) e com cópia em `user.coachFeedback`.
  - Resultado: trocar exercício, gerar outro, salvar como treino ou começar. "Começar" salva um treino com `assistant: true` (escondido das listas; o anterior é apagado) e guarda `user.coachPrefs` para "Igual da última vez". Treinos do treinador que estão no histórico não são apagados; no resumo do treino feito aparece "Gostou deste treino? Salvar".
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
