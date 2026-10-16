# Treinador arquivado

O Treinador foi retirado do aplicativo na v53 por decisão do dono. A criação de treinos e divisões agora é manual.

`restaurar-v52.patch` preserva o código, os estilos, formulários, integrações, documentação e testes da funcionalidade na versão anterior, incluindo as 1.728 combinações de regras. É um patch de restauração da v53 para a v52; não é executado nem carregado pelo aplicativo e não faz parte do cache da PWA.

Referência original: [commit bc859e2 da v52](https://github.com/marcodsvinicius/MegGym/commit/bc859e2aa2fba9c70a77b7fa822cf07c6f48c8b4).

## Reativação futura

Somente reativar se o dono pedir. Fazer isso em uma branch de trabalho.

1. Usar o patch e o commit original para recuperar o algoritmo, as telas e os testes.
2. Para verificar a restauração sobre a v53: `git apply --check archive/treinador/restaurar-v52.patch`. Aplicar o patch inteiro recupera também a versão antiga dos arquivos e remove os testes novos da desativação; não deve ser publicado sem revisão.
3. Integrar à versão atual, revisar os metadados e as regras de prescrição, e reexecutar os testes do treinador e os fluxos manuais.
4. Atualizar `VERSION` e todas as referências `?v=` para uma versão nova antes de publicar. Nunca voltar o cache de produção para v52.

Os metadados dos exercícios e os dados já gravados nos perfis (`coachPrefs`, `limits`, `painLog`, entre outros) foram preservados, inclusive no backup. Treinos antigos e históricos continuam funcionando; pelo histórico é possível salvar uma cópia editável de um treino antigo.

Links antigos `#/treinador` e `#/assistente` levam ao formulário manual. O resumo semanal continua mostrando as séries realizadas, sem prescrição automática ou referência de nível.
