# Design system do MegGym

O aplicativo e o admin compartilham a mesma base de interface. Energia é o padrão; Esportivo, Pink Money e Arcade preservam sua identidade em claro, escuro e automático. A galeria publicada em [`design-system.html`](../design-system.html) usa o CSS e os componentes reais, sem carregar os dados de treino.

## Arquitetura

Não edite `assets/css/style.css`: ele é o artefato de produção. Edite os módulos abaixo, execute `npm run css:build` e inclua o resultado no commit. O app continua estático, sem dependências de produção e com uma única requisição de CSS, já incluída no cache offline.

| Fonte em `assets/css/` | Responsabilidade |
| --- | --- |
| `tokens.css` | Espaços, escala tipográfica, controles, bordas, ícones, movimento, níveis de sobreposição e safe areas; cores funcionais de mídia, mensagens e gráficos |
| `themes.css` | Paletas e papéis de componentes para os quatro temas, suas diferenças no escuro e as miniaturas fixas da escolha de estilo |
| `base.css` | Reset, texto, fontes locais e Material Symbols |
| `layout.css` | Cabeçalho, conteúdo, navegação, abas e áreas fixas de ação |
| `controls.css` | Botões, campos, chips, seleção, estatísticas e estados de interação |
| `cards.css` | Cards compartilhados, catálogo, estados vazios e progresso |
| `training.css` | Fichas, divisões, listas de exercícios, séries, carga, observações e recordes |
| `activity.css` | Início, semana, atividade, histórico, configurações e gráficos |
| `onboarding.css` | Entrada, equipamentos, aparência, tour e instalação |
| `admin.css` | Painéis, listas e formulários administrativos |
| `overlays.css` | Bottom sheets, diálogos, vídeo, descanso, retomada, toast e aviso de atualização |
| `motion.css` | Animações e respeito a `prefers-reduced-motion` |
| `utilities.css` | Visibilidade e apresentação de pequenos trechos antes definidos inline |
| `design-system.css` | Somente a galeria; não entra no bundle do aplicativo |

A ordem é explícita em `tools/build-css.mjs`. Não há `@import` em produção. Os módulos não precisam ser carregados ou armazenados separadamente pelo service worker. A regra de um componente deve ficar no módulo responsável; alterações futuras não devem criar um novo bloco de correção no fim do bundle.

## Contrato dos tokens

Tokens são CSS custom properties. A interface usa papéis; os temas fornecem seus valores. Cores de texto sobre preenchimentos têm um token próprio: não assumir branco ou preto.

| Categoria | Tokens principais | Uso |
| --- | --- | --- |
| Superfícies | `--bg`, `--surface`, `--surface-2`, `--tint` | Página, cards e blocos internos |
| Texto | `--text`, `--text-muted`, `--accent-ink` | Conteúdo, apoio e links legíveis |
| Marca | `--accent`, `--accent-contrast`, `--accent-container`, `--on-accent-container` | Ações e destaque suave |
| Estados | `--success`, `--on-success`, `--done`, `--on-done`, `--danger`, `--danger-solid`, `--on-danger-solid` | Conclusão, erro e ação destrutiva |
| Cards | `--card-bg`, `--card-border`, `--card-border-w`, `--card-shadow`, `--card-pad` | Mesmo tratamento entre telas |
| Campos | `--field-bg`, `--field-border`, `--field-border-w`, `--control-radius`, `--control-h*` | Formulários e tabela de séries |
| Forma | `--radius`, `--radius-sm`, `--btn-radius`, `--pill-radius`, `--check-radius`, `--sheet-radius`, `--guide-radius` | Geometria adaptada a cada estilo |
| Tipo | `--font-body`, `--font-display`, `--fs-*`, `--fw-*`, `--line-*`, `--display-*` | Escala e personalidade tipográfica |
| Espaços | `--space-1` a `--space-6` = 4/8/12/16/20/24 px; extensões `--space-8`, `--space-12` etc. | Ritmo principal; meios passos como `--space-1-5` = 6 px permitem densidade nas tabelas |
| Movimento | `--duration-*`, `--ease-out`, `--ease-spring` | Transições e animações |
| Foco | `--ring`, `--check-border` | Foco visível e seleção |
| Navegação | `--header-*`, `--nav-*`, `--system-bar` | Cor do sistema e cabeçalho sincronizados |
| Componentes | `--button-*`, `--chip-*`, `--seg-*`, `--stat-*`, `--rest-*`, `--letter-*` | Estados e diferenças de tema sem duplicar componentes |
| Camadas | `--z-sticky`, `--z-header`, `--z-nav`, `--z-resume`, `--z-sheet`, `--z-rest`, `--z-update`, `--z-video` | Ordem das sobreposições |
| Áreas fixas | `--nav-h`, `--header-h`, `--dock-gap`, `--resume-height`, `--resume-reserve`, `--rest-reserve`, `--safe-*` | Reservar espaço e respeitar recortes do celular |

`--accent` serve para preenchimento; `--accent-ink` serve para texto. Esportivo, por exemplo, precisa de laranja distinto no link sobre fundo claro. A ação destrutiva sólida mantém vermelho de contraste seguro em todos os temas. As cores de músculos e elásticos são dados do catálogo/usuário, não cores da marca.

### Identidades

| Tema | Tipo | Forma | Identidade |
| --- | --- | --- | --- |
| Energia | Manrope + Barlow Condensed | Cards arredondados, ações em pílula | Laranja, verde de conclusão, pouca borda |
| Esportivo | Archivo + Anton | Cantos retos e bordas marcantes | Contraste preto/branco e laranja; cabeçalho escuro |
| Pink Money | Plus Jakarta Sans | Cantos amplos, ações em pílula | Rosa e superfícies suaves, verde de sucesso |
| Arcade | Manrope + monoespaçada | Cantos pequenos, bordas e sombra deslocada | Roxo no claro, ciano no escuro e detalhes magenta |

Diferenças decorativas, como a grade do Arcade e o gradiente de Energia, permanecem junto do componente que decoram, sempre usando tokens. Paletas e medidas do tema ficam em `themes.css`.

## Como implementar

Reutilize `.btn`/`.btn-primary`, `.input`, `.select`, `.textarea`, `.chip`, `.stat`, `.settings-list`, `.workout-card` e `.sets-table`. Modificadores exprimem função ou estado (`.done`, `.weighted`, `.timed`), não cor. A tabela de séries usa `--control-radius`; os painéis usam `--sheet-radius` ou `--guide-radius`.

```css
.novo-componente {
  padding: var(--card-pad);
  gap: var(--space-3);
  color: var(--text);
  background: var(--card-bg);
  border: var(--card-border-w) solid var(--card-border);
  border-radius: var(--radius);
}
```

Não adicionar hex/RGB, tamanhos tipográficos `rem` isolados ou níveis de `z-index` em componentes. Valores estruturais, como proporção 9:16, colunas de tabelas, tamanhos de mídia e breakpoints, podem ser locais: não são escolhas de tema. Breakpoints atuais são 360/400/520/720 px; CSS custom properties não funcionam nas condições de media queries.

HTML/JS não deve conter margens, padding ou cores de apresentação inline. Classes carregam o estilo. Dados variáveis entram somente por custom properties: `--group-color`, `--band-color`, `--hero-image`, `--progress`, `--bar-value`, `--p` (temporizador), `--i` (entrada em cascata) e valores de posição/tempo do confete. Escape e valide valores externos antes de passá-los ao template.

### Estado do tema e JavaScript

`theme.js` é carregado no head **depois do CSS e antes do body**. Assim, aplica o estilo antes da primeira pintura e pode ler os tokens sem outra paleta em JavaScript.

- `data-style`: energia/esportivo/pink-money/arcade.
- `data-theme`: escolha explícita light/dark; ausente no automático.
- `data-color-scheme`: modo efetivo light/dark, resolvido pelo mesmo código para todas as telas.
- `MegTheme.set`, `setStyle`, `get`, `getStyle`: API existente preservada; estilos antigos/invalidos continuam migrando para Energia.
- `MegTheme.token("--system-bar")`: leitura de tokens resolvidos. A meta `theme-color` e o Canvas de compartilhamento usam esta API.

O listener de `prefers-color-scheme` só reaplica o modo quando a escolha é automática. A galeria usa a mesma API e salva apenas preferências visuais do aparelho; não importa `store.js` e não acessa treinos ou histórico.

### Sobreposição e execução

Manter a ordem de camadas e as reservas de espaço. A retomada e o descanso coexistem; abrir um painel esconde a retomada, e o descanso passa para a base da tela. Não trocar os valores reservados independentemente da altura das barras.

O vídeo expandido precisa limpar `transform` e animações dos ancestrais para que a área fixa cubra a viewport. Não remover essas regras nem recriar o iframe ao expandir: isso reinicia o vídeo. Os diálogos de carga/observações compartilham a base, mas os estilos específicos do guia devem continuar sob `.execution-guide`.

## Verificação e publicação

```sh
npm run css:build   # após editar módulos
npm run css:check   # falha se o bundle estiver desatualizado
npm test           # inclui css:check, testes funcionais, Playwright e axe
```

Abra `design-system.html` no mesmo servidor estático do app. Confira os quatro estilos em claro/escuro/automático, foco com teclado, botões desabilitados, tabela e painel. Valide larguras 320/390/430 px e movimento reduzido. O admin usa o mesmo bundle e também entra na verificação do contrato de tokens.

Os testes adicionais impedem tokens sem definição, cores de apresentação inline e divergência entre módulos/bundle; verificam a reação ao modo do aparelho, persistência, ausência de ciclos nos papéis principais, cores da barra do sistema, contraste e overflow da galeria. A suíte existente continua cobrindo execução, vídeo/tela cheia, descanso/retomada, dados, exportações e atualização offline.

A cada publicação, atualize a versão em `index.html`, `admin.html`, `sw.js`, `design-system.html` e na fonte de ícones em `base.css`, depois gere o bundle. Inclua todos os módulos, o gerador e `style.css` no commit. Publicar primeiro na branch de desenvolvimento e, após os testes, na main. A galeria é uma referência de desenvolvimento acessível por URL, não uma nova seção no fluxo do praticante. O service worker mantém documentos da galeria e do admin em chaves próprias, para nunca substituir o shell offline do aplicativo.
