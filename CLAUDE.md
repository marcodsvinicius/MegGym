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
- `data/exercises.json`: grupos e exercícios, com os campos `type` (reps/unilateral/tempo), `equipment`, `equipmentAny`, `video` e os campos preservados para eventual reativação do treinador: `pattern` (padrão de movimento detalhado: empurrar-h/v, puxar-h/v, joelho, joelho-uni, dobradica, extensao-quadril, abducao, flexao-joelho, peito-iso, ombro-lateral, ombro-posterior, cotovelo-flexao/extensao, panturrilha, core-antiextensao/antirrotacao/lateral/flexao/extensao, cardio), `muscles` (grupo: 1 primário, 0.5 secundário), `joints` (lombar, cervical, ombro, cotovelo, punho, quadril, joelho, tornozelo: 1 moderada, 2 alta), `position`, `complexity` (1 a 3), `impact` e `easier`/`harder` (cadeias de progressão). A classificação foi feita por regras de musculação e deve ser revisada por um profissional de Educação Física. São 165 exercícios em 12 grupos (inclui Cardio), todos para treino em casa (sem máquinas).
- `sw.js`: service worker. Não ativa sozinho (sem skipWaiting automático): o app mostra a barra "nova versão disponível".

## A cada publicação (obrigatório)
- Aumente o `?v=N` em `index.html`, `admin.html`, `sw.js` e `assets/css/style.css` (a URL da fonte também é versionada).
- Aumente também o `VERSION` no `sw.js`.
- Versão atual: **v60**.

Outros cuidados:
- Ícones: a fonte Material Symbols é um subconjunto. Ao usar um ícone novo, rode `python3 tools/update-icons.py`. Ícones que o script não detecta sozinho vão na lista `EXTRA`.
- Design system: tokens em `:root` (`--space-*`, `--fs-*`, `--accent-ink`, `--on-success`…). Estilos: energia (padrão), esportivo, pink-money e arcade. Suave foi retirado; perfis antigos migram para Energia ao entrar.
- Ícones do mapa corporal: os SVGs usam `<use>`, então o CSS precisa mirar `#bm-sprite ...`.

## Testes
- Comando: `npm test` (Playwright e axe-core, via `node --test`). Os testes cobrem fluxos manuais, compatibilidade, dados, acessibilidade e atualização da PWA.
- Os testes antigos do Treinador estão preservados no patch de restauração em `archive/treinador/`. A suíte ativa verifica que ele não aparece e que a criação manual funciona.
- Também rodam no GitHub Actions (`.github/workflows/testes.yml`).
- Para tirar prints de telas: navegue antes para `#/x`, senão a tela não renderiza de novo quando o hash não muda.

## Funcionalidades prontas
- **Integridade v57:** finalização só limpa a sessão após persistir o histórico e a carga; gravações em lote desfazem mudanças anteriores em caso de erro. Séries parciais entram no histórico. Sessões guardam a ficha original e migram sessões antigas antes de editar. Gráficos combinam resultados do histórico com cargas manuais identificadas; editar registros antigos não troca a carga atual. Backup validado integralmente antes de gravar, com reversão em caso de falha.
- **Exercício:**
  - Cards de prescrição, botão compacto "Ver execução", séries registráveis, Minha carga e Minhas observações vêm nessa ordem. O vídeo só carrega ao abrir um diálogo separado, vertical 9:16, com tela cheia e modo expandido quando a API nativa não está disponível. Fechar interrompe o vídeo, preserva o formulário e restaura a rolagem e o foco. Evolução e instruções ficam abaixo.
  - O peso da primeira série preenche as seguintes. A origem do preenchimento é preservada na sessão para atualizar valores herdados e respeitar ajustes manuais e séries já concluídas. Minha carga usa a primeira série como referência, enquanto o gráfico mantém o máximo realizado.
  - O check inicia o descanso com timer. O timer sobrevive a recarregar a página, emite bipe e mantém a tela ligada.
  - Descanso configurável por treino; RIR com tooltip; "Última vez" em cada série.
- **Execução do treino:**
  - Histórico de cargas com gráfico (alternando Peso e Repetições).
  - Recorde pessoal.
  - Tipos de exercício: repetições, unilateral e tempo (com cronômetro).
  - Bi-set e super-set.
- **Durante o treino:** pular, trocar e reordenar exercícios. No fim da lista há um card para terminar antes ou descartar o treino. Ao terminar, é possível compartilhar um resumo em imagem.
- **Retomada:** uma única barra fixa acima da navegação acompanha a sessão nas outras telas. O descanso ocupa uma faixa acima dela; ambos reservam espaço no conteúdo. A barra de retomada fica oculta durante a execução e quando um painel está aberto.
- **Tour de primeiro uso:** 4 passos (treino do dia, séries, opções e criação manual).
- **Início:** card "Treino de hoje"; motivação dentro de "Sua semana"; card de instalação com botão de fechar (depois de fechado, a opção fica em Configurações).
- **Atividade:** abas Resumo, Evolução e Histórico. O Resumo mostra "Séries por músculo na semana" com as séries realizadas e contribuição proporcional dos músculos secundários, sem recomendações automáticas.
- **Treinos:**
  - Abas Meu Treino, Explorar e Salvos.
  - Treino e Divisão (A/B/C…), cada um público ou privado; dá para salvar, seguir e copiar.
- **Treino GPT v1:** divisão ABCD manual, cadastrada em `data/workouts.json` (seed v5, sem apagar dados). Quatro sessões por ciclo, 25 exercícios, com séries, repetições, descanso, RIR e observações. Cargas atuais em branco. As variantes específicas foram adicionadas ao catálogo sem alterar os exercícios antigos.
- **Formulário de treino:** exercícios primeiro, escolhidos numa folha (sheet); o resto fica em "Mais opções".
- **Dados e qualidade:**
  - Backup: exporta e importa com data e hora; a restauração é oferecida no cadastro.
  - Aviso de "nova versão"; tour de primeiro uso; telas vazias; animações; revisão de acessibilidade (axe).
  - Aviso quando o aparelho não consegue salvar (armazenamento cheio).
- **Conteúdo e admin:**
  - Admin pelo GitHub: cadastra exercício com tipo e equipamentos, e faz upload de imagem. Metadados de prescrição automática continuam no JSON para uso futuro, sem campos próprios no admin.
  - Ícones de grupo (mapa corporal) só aparecem em cards; em tags e textos em linha ficam só o nome. O ícone do Cardio é o corpo da cabeça às coxas com os músculos em destaque.
  - O catálogo original tem vídeos curados. Algumas variantes adicionadas ao Treino GPT v1 aguardam vídeo específico; não reutilizar demonstrações de outra variante.
- **Criação de treinos:** manual, pelo botão Novo em Treinos. O Treinador está desativado e arquivado em `archive/treinador/`; não reativar sem pedido do dono. Links antigos abrem o formulário manual. Dados pessoais e metadados antigos foram preservados para compatibilidade.
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


