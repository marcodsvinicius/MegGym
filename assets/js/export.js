/* Exportação para personal, planilhas e IA. Apenas transforma dados; não grava no aparelho. */
(function () {
  "use strict";
  const number = (value) => {
    if (value == null || String(value).trim() === "") return null;
    const n = Number(String(value).replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const day = (value) => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const typeUnit = (type, perSide = false) => type === "tempo" ? perSide ? "segundos por lado" : "segundos" : type === "unilateral" ? "repetições por lado" : "repetições";
  const fmt = (value) => value == null || value === "" ? "não informado" : String(value);

  function build(source, catalog, { days = 0, includeProfile = true, now = new Date() } = {}) {
    if (!source) throw new Error("Perfil não encontrado.");
    now = new Date(now);
    const start = new Date(now);
    days = [30, 90].includes(Number(days)) ? Number(days) : 0;
    if (days) { start.setDate(start.getDate() - days + 1); start.setHours(0, 0, 0, 0); }
    const from = days ? day(start) : null;
    const until = day(now);
    const inPeriod = (date) => Boolean(date && (!from || date >= from) && date <= until);
    const definitions = new Map((catalog.exercises || []).map((e) => [e.id, e]));
    const groups = new Map((catalog.groups || []).map((g) => [g.id, g.name]));
    const exName = (id) => definitions.get(id)?.name || source.history?.flatMap(h => h.exercises || []).find(e => e.exerciseId === id)?.name || id || "Exercício não identificado";
    const cleanSet = (s, index, type, active = false, perSide = false) => ({
      serie: index + 1, cargaKg: number(s.weight), quantidade: number(s.reps), unidade: typeUnit(type, perSide),
      concluida: active ? s.done === true : s.done !== false,
    });
    const workout = (w) => w ? ({
      id: w.id, nome: w.name, descricao: w.description || "", observacoes: w.notes || "", descansoPadraoSegundos: w.restSeconds || 60,
      exercicios: (w.items || []).map((item, i) => {
        const ex = definitions.get(item.exerciseId);
        return { ordem: i + 1, exercicioId: item.exerciseId, nome: exName(item.exerciseId), grupo: groups.get(ex?.group) || ex?.group || "",
          tipo: ex?.type || "reps", tempoPorLado: Boolean(ex?.timePerSide), instrucoes: item.instructions || ex?.description || "", seriesPlanejadas: item.sets || "", repeticoesOuTempoPlanejados: item.reps || "",
          descanso: item.rest || `${w.restSeconds || 60}s`, rirPlanejado: item.rir ?? "", cargaSugerida: item.load || "", ligadoAoProximo: Boolean(item.linkNext) };
      }),
    }) : null;
    const history = (source.history || []).filter((h) => inPeriod(day(h.finishedAt))).map((h) => ({
      id: h.id, treinoId: h.workoutId, treino: h.workoutName, descricao: h.workoutDescription || "",
      inicio: h.startedAt || null, fim: h.finishedAt, dataLocal: day(h.finishedAt),
      duracaoMinutos: h.startedAt && new Date(h.finishedAt) >= new Date(h.startedAt) ? Math.round((new Date(h.finishedAt) - new Date(h.startedAt)) / 60000 * 100) / 100 : null,
      exerciciosRegistrados: h.exerciseCount ?? (h.exercises || []).length,
      observacao: h.note || "", detalhesDisponiveis: Boolean(h.exercises?.length),
      exercicios: (h.exercises || []).map((e) => ({
        exercicioId: e.exerciseId, nome: e.name || exName(e.exerciseId), grupo: groups.get(e.group) || e.group || "",
        tipo: e.type || definitions.get(e.exerciseId)?.type || "reps", parcial: Boolean(e.partial),
        seriesRegistradas: e.sets || "", seriesPlanejadas: e.plannedSets || "", prescricaoRepeticoes: e.reps || "",
        cargaSugerida: e.load || "", cargaPessoalNaSessao: e.myLoad || "", rirPlanejado: e.rir ?? "", descanso: e.rest || "",
        observacao: e.note || "", instrucoes: e.instructions || "", tempoPorLado: Boolean(e.timePerSide ?? definitions.get(e.exerciseId)?.timePerSide), substituidoDe: e.swappedFrom || "", series: (e.setLog || []).map((s, i) => cleanSet(s, i, e.type || definitions.get(e.exerciseId)?.type, false, e.timePerSide ?? definitions.get(e.exerciseId)?.timePerSide)),
      })),
    })).sort((a, b) => a.fim.localeCompare(b.fim));
    const active = source.session;
    const activeWorkout = workout(active?.workout);
    const valid = (active?.workout?.items || []).map((_, i) => i);
    const order = [...new Set([...(active?.order || []).filter(i => valid.includes(i)), ...valid])];
    const session = active ? {
      inicio: active.startedAt, treino: activeWorkout, status: "em andamento; não incluído nos totais do histórico",
      exercicios: order.map((index, position) => {
        const item = active.workout.items[index];
        const id = active.swaps?.[index] || item.exerciseId;
        const ex = definitions.get(id);
        return { ordem: position + 1, indiceOriginal: index, exercicioId: id, nome: exName(id), substituidoDe: id !== item.exerciseId ? item.exerciseId : "", concluido: Boolean(active.done?.[index]), pulado: Boolean(active.skipped?.[index]),
          series: (active.sets?.[index] || []).map((s, i) => cleanSet(s, i, ex?.type, true, ex?.timePerSide)) };
      }),
    } : null;
    const related = new Set([
      ...Object.keys(source.weightLog || {}), ...Object.keys(source.exerciseLoads || {}), ...Object.keys(source.exerciseNotes || {}),
      ...history.flatMap(h => h.exercicios.map(e => e.exercicioId)),
      ...(source.workouts || []).flatMap(w => (w.items || []).map(e => e.exerciseId)),
      ...(session?.exercicios || []).map(e => e.exercicioId),
    ].filter(Boolean));
    const evolution = [...related].map((id) => {
      const daily = new Map();
      const add = (date, weight, origin) => {
        if (!inPeriod(date) || weight == null) return;
        const prev = daily.get(date);
        if (!prev || weight > prev.cargaKg) daily.set(date, { data: date, cargaKg: weight, origens: [origin] });
        else if (weight === prev.cargaKg && !prev.origens.includes(origin)) prev.origens.push(origin);
      };
      (source.weightLog?.[id] || []).forEach(e => add(e.date, number(e.weight), e.source === "manual" ? "registro manual" : "registro legado de origem não identificada"));
      const performances = [];
      history.forEach(h => h.exercicios.filter(e => e.exercicioId === id).forEach(e => {
        e.series.filter(s => s.concluida).forEach(s => {
          if (s.cargaKg > 0) add(h.dataLocal, s.cargaKg, "treino concluído");
          performances.push({ data: h.dataLocal, fim: h.fim, treino: h.treino, ...s });
        });
      }));
      const series = [...daily.values()].sort((a, b) => a.data.localeCompare(b.data));
      const first = series[0]?.cargaKg ?? null, last = series.at(-1)?.cargaKg ?? null;
      const load = source.exerciseLoads?.[id] || {};
      return { exercicioId: id, nome: exName(id), tipo: definitions.get(id)?.type || "reps",
        cargaAtualKg: number(load.weight), elasticoAtual: load.band || "", cargaAtualAtualizadaEm: load.updatedAt || null,
        observacaoAtual: source.exerciseNotes?.[id] || "", cargasPorDia: series, seriesRealizadas: performances,
        primeiraCargaNoPeriodoKg: first, ultimaCargaNoPeriodoKg: last,
        maiorCargaNoPeriodoKg: series.length ? Math.max(...series.map(e => e.cargaKg)) : null,
        variacaoKg: first != null && last != null ? Math.round((last - first) * 100) / 100 : null,
      };
    });
    const allSets = history.flatMap(h => h.exercicios.flatMap(e => e.series.filter(s => s.concluida).map(s => ({ ...s, tipo: e.tipo }))));
    const volumeSets = allSets.filter(s => s.tipo !== "tempo" && s.cargaKg > 0 && s.quantidade > 0);
    const currentIds = new Set(source.plan?.workoutId ? [source.plan.workoutId] : source.division?.workoutIds || []);
    return {
      app: "MegGym", tipo: "analise", versao: 1, geradoEm: now.toISOString(), fusoHorario: Intl.DateTimeFormat().resolvedOptions().timeZone,
      periodo: { inicio: from, fim: until, dias: days || "todo o histórico" },
      perfil: { ...(includeProfile ? { nome: source.user.name, idade: source.user.age ?? null, sexo: source.user.sex || "" } : {}), equipamentos: source.user.equipment || [] },
      resumo: { sessoes: history.length, diasComTreino: new Set(history.map(h => h.dataLocal)).size, seriesRealizadasComDetalhes: allSets.length,
        sessoesSemDetalhes: history.filter(h => !h.detalhesDisponiveis).length,
        exerciciosSemSeriesDetalhadas: history.flatMap(h => h.exercicios).filter(e => !e.series.length).length,
        volumeRegistradoKgRepeticoes: Math.round(volumeSets.reduce((sum, s) => sum + s.cargaKg * s.quantidade, 0) * 100) / 100,
        seriesComVolumeCalculavel: volumeSets.length },
      planoAtual: { inicio: source.plan?.startedAt || null, divisao: source.division ? { nome: source.division.name, descricao: source.division.description || "", duracaoSessoes: source.division.duration || null, treinosIds: source.division.workoutIds || [] } : null,
        treinos: (source.workouts || []).filter(w => currentIds.has(w.id)).map(workout) },
      treinosDoUsuario: (source.workouts || []).filter(w => !currentIds.has(w.id)).map(workout),
      treinoEmAndamento: session, historico: history, evolucao: evolution,
      observacoesDosTreinos: Object.entries(source.notes || {}).map(([id, text]) => ({ treinoId: id, treino: source.workouts?.find(w => w.id === id)?.name || id, observacao: text })),
      leituraDosDados: [
        "Histórico contém apenas sessões concluídas; treino em andamento é apresentado separadamente.",
        "Prescrições (séries, repetições, RIR e descanso planejados) não são resultados realizados. RIR realizado não é registrado pelo app.",
        "Valores ausentes são desconhecidos. Registros antigos podem não ter detalhes por série; nenhuma série foi estimada.",
        "Cargas por dia combinam registros manuais e o maior peso realizado, seguindo o gráfico do app. Origem legada pode ser desconhecida.",
        "Carga atual é uma preferência atual e pode estar fora do período. Não representa necessariamente recorde ou resultado de uma sessão.",
        "Volume é soma de kg × repetições apenas nas séries com ambos registrados; exclui tempo e peso corporal. Não multiplica por dois halteres nem pelos dois lados.",
        "Datas de sessões têm horário ISO; datas diárias usam o fuso do aparelho na exportação. Exportação para análise não substitui o backup de restauração.",
      ],
    };
  }

  function report(data) {
    const lines = ["MEGGYM — RELATÓRIO PARA ANÁLISE", `Gerado em: ${data.geradoEm}`, `Fuso: ${data.fusoHorario}`, `Período: ${data.periodo.inicio || "todo o histórico"} até ${data.periodo.fim}`, ""];
    const line = (text = "") => lines.push(text);
    if (data.perfil.nome) line(`Perfil: ${data.perfil.nome} | Idade: ${fmt(data.perfil.idade)} | Sexo: ${fmt(data.perfil.sexo)}`);
    line(`Equipamentos: ${data.perfil.equipamentos.join(", ") || "não informados"}`);
    line(`Resumo: ${data.resumo.sessoes} sessões, ${data.resumo.diasComTreino} dias com treino, ${data.resumo.seriesRealizadasComDetalhes} séries realizadas com detalhes.`);
    line(`Volume registrado: ${data.resumo.volumeRegistradoKgRepeticoes} kg × repetições (${data.resumo.seriesComVolumeCalculavel} séries com dados suficientes).`);
    line(`Qualidade dos dados: ${data.resumo.sessoesSemDetalhes} sessões sem lista de exercícios; ${data.resumo.exerciciosSemSeriesDetalhadas} exercícios sem detalhes por série.`);
    const printWorkout = (w) => {
      line(`\n${w.nome}${w.descricao ? ` — ${w.descricao}` : ""}`);
      w.exercicios.forEach(e => {
        line(`${e.ordem}. ${e.nome}: ${fmt(e.seriesPlanejadas)} séries × ${fmt(e.repeticoesOuTempoPlanejados)} (${typeUnit(e.tipo, e.tempoPorLado)}); descanso ${fmt(e.descanso)}; RIR planejado ${fmt(e.rirPlanejado)}; carga sugerida ${fmt(e.cargaSugerida)}${e.ligadoAoProximo ? "; conjugado com o próximo exercício" : ""}.`);
        if (e.instrucoes) line(`  Execução: ${e.instrucoes}`);
      });
      if (w.observacoes) line(`Observações do treino:\n${w.observacoes}`);
    };
    line("\nPLANO ATUAL (PRESCRIÇÃO)");
    if (data.planoAtual.divisao) line(`Divisão: ${data.planoAtual.divisao.nome} — ${data.planoAtual.divisao.descricao}`);
    if (!data.planoAtual.treinos.length) line("Nenhum treino ou divisão sendo seguido.");
    data.planoAtual.treinos.forEach(printWorkout);
    line("\nOUTROS TREINOS DO USUÁRIO");
    data.treinosDoUsuario.forEach(printWorkout);
    const printSeries = (s) => line(`  Série ${s.serie}: ${fmt(s.cargaKg)} kg | ${fmt(s.quantidade)} ${s.unidade} | ${s.concluida ? "concluída" : "pendente"}`);
    if (data.treinoEmAndamento) {
      line("\nTREINO EM ANDAMENTO (FORA DOS TOTAIS)");
      if (data.treinoEmAndamento.treino) printWorkout(data.treinoEmAndamento.treino);
      line(`Início: ${data.treinoEmAndamento.inicio}`);
      data.treinoEmAndamento.exercicios.forEach(e => { line(`${e.ordem}. ${e.nome}${e.pulado ? " — pulado" : ""}`); e.series.forEach(printSeries); });
    }
    line("\nHISTÓRICO REALIZADO");
    if (!data.historico.length) line("Nenhuma sessão concluída no período.");
    data.historico.forEach(h => {
      line(`\n${h.fim} | ${h.treino} | ${fmt(h.duracaoMinutos)} minutos`);
      if (!h.detalhesDisponiveis) line("Registro antigo sem lista de exercícios; nenhuma prescrição atual foi usada para preencher este registro.");
      h.exercicios.forEach(e => {
        line(`${e.nome} (${e.grupo})${e.parcial ? " — parcial" : ""}; séries registradas: ${fmt(e.seriesRegistradas)}; previstas: ${fmt(e.seriesPlanejadas)}; prescrição: ${fmt(e.prescricaoRepeticoes)}; RIR planejado: ${fmt(e.rirPlanejado)}; descanso: ${fmt(e.descanso)}.`);
        e.series.forEach(printSeries);
        if (!e.series.length) line("  Sem detalhes por série.");
        if (e.observacao) line(`  Observação na sessão: ${e.observacao}`);
        if (e.cargaPessoalNaSessao) line(`  Carga pessoal na sessão: ${e.cargaPessoalNaSessao}`);
      });
      if (h.observacao) line(`Observação do treino: ${h.observacao}`);
    });
    line("\nEVOLUÇÃO DE CARGA E OBSERVAÇÕES ATUAIS");
    data.evolucao.forEach(e => {
      line(`\n${e.nome}: carga atual ${fmt(e.cargaAtualKg)} kg${e.elasticoAtual ? `; elástico ${e.elasticoAtual}` : ""}. Maior no período: ${fmt(e.maiorCargaNoPeriodoKg)} kg; variação entre primeiro e último dia: ${fmt(e.variacaoKg)} kg.`);
      e.cargasPorDia.forEach(p => line(`  ${p.data}: ${p.cargaKg} kg (${p.origens.join(" + ")})`));
      if (e.observacaoAtual) line(`Observação atual: ${e.observacaoAtual}`);
    });
    data.observacoesDosTreinos.forEach(e => line(`Observação atual de ${e.treino}: ${e.observacao}`));
    line("\nCOMO INTERPRETAR");
    data.leituraDosDados.forEach(text => line(`- ${text}`));
    line("\nPARA CONVERSAR COM PERSONAL OU IA");
    line("Analise frequência, regularidade e evolução de cargas e repetições por exercício. Compare a prescrição atual com as sessões registradas e aponte lacunas nos dados. Considere as observações e explique quais informações adicionais seriam necessárias antes de sugerir ajustes.");
    return lines.join("\n");
  }

  function csv(data) {
    // Aspas tratam delimitadores/quebras; prefixo impede fórmulas em nomes/anotações ao abrir em planilhas.
    const cell = (value) => {
      let text = value == null ? "" : String(value);
      if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const rows = [["sessao_id", "inicio_iso", "fim_iso", "data_local", "treino", "exercicio_id", "exercicio", "tipo", "serie", "carga_kg", "quantidade", "unidade", "concluida", "parcial", "rir_planejado", "descanso_planejado", "observacao_exercicio", "observacao_treino", "detalhes"]];
    data.historico.forEach(h => {
      const exercises = h.exercicios.length ? h.exercicios : [null];
      exercises.forEach(e => {
        const sets = e?.series.length ? e.series : [null];
        sets.forEach(s => rows.push([h.id, h.inicio, h.fim, h.dataLocal, h.treino, e?.exercicioId, e?.nome, e?.tipo, s?.serie, s?.cargaKg, s?.quantidade, s?.unidade, s ? s.concluida : "", e?.parcial, e?.rirPlanejado, e?.descanso, e?.observacao, h.observacao, s ? "série registrada" : "registro sem detalhes por série"]));
      });
    });
    return "\uFEFF" + rows.map(row => row.map(cell).join(";")).join("\r\n");
  }
  window.MegExport = { build, report, csv };
})();
