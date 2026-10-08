// Regras que todo treino do treinador precisa cumprir. Roda dentro da página (usa window.MegCoach)
// e devolve a lista de violações. Usado por tests/coach.test.mjs.
window.checkCoachRules = function (data) {
  const ALL = ["halter", "banco", "elastico", "barra-fixa", "kettlebell", "caneleira", "step", "bola-suica", "corda", "anilha", "estacao", "roldana"];
  const FOCUS = {
    corpo: ["peito", "costas", "quadriceps", "posterior", "gluteos", "ombros", "abdomen"],
    superiores: ["peito", "costas", "ombros", "biceps", "triceps"],
    inferiores: ["quadriceps", "posterior", "gluteos", "panturrilha"],
    empurrar: ["peito", "ombros", "triceps"],
    puxar: ["costas", "biceps"],
    core: ["abdomen", "lombar"],
    cardio: ["cardio"],
    avulso: ["costas", "biceps", "gluteos"],
  };
  const LIMITS = [
    { regions: {}, conditions: [], flags: [] },
    { regions: { joelho: "evitar", lombar: "cuidado" }, conditions: [], flags: [] },
    { regions: { ombro: "evitar", punho: "evitar" }, conditions: [], flags: [] },
    { regions: { lombar: "evitar" }, conditions: ["pressao"], flags: [] },
    { regions: {}, conditions: ["chao", "idoso"], flags: [] },
    { regions: {}, conditions: [], flags: ["gestacao"] },
  ];
  const EQUIP = [[], ["elastico"], ["halter", "banco"], ALL];
  const LEVELS = ["iniciante", "intermediario", "avancado"];
  const byId = Object.fromEntries(data.exercises.map((e) => [e.id, e]));
  const fam = { "empurrar-h": "empurrar", "empurrar-v": "empurrar", "puxar-h": "puxar", "puxar-v": "puxar" };
  const FLOOR = ["chao-costas", "chao-brucos", "chao-lado", "quatro-apoios", "prancha", "ajoelhado"];
  const canDo = (ex, eq) => (ex.equipment || []).every((x) => eq.includes(x)) && (!(ex.equipmentAny || []).length || ex.equipmentAny.some((x) => eq.includes(x)));
  const errors = [];
  let n = 0;
  for (const [focus, groups] of Object.entries(FOCUS))
    for (const time of [15, 30, 60])
      for (const goal of ["hipertrofia", "forca", "resistencia"])
        for (const equipment of EQUIP)
          LIMITS.forEach((limits, li) => {
            const level = LEVELS[(n + li) % 3];
            const noImpact = n % 4 === 0;
            const prefs = { focus: focus === "avulso" ? "" : focus, groups, time, goal, equipment, limits, level, noImpact, warmup: true };
            const label = `${focus}/${time}min/${goal}/${equipment.length} equip/limite ${li}/${level}${noImpact ? "/sem impacto" : ""}`;
            n++;
            const { items, minutes } = window.MegCoach.build(prefs);
            const all = items.map((it) => ({ it, ex: byId[it.exerciseId] }));
            const main = all.filter(({ it }) => !it.warmup);
            const fail = (msg) => errors.push(`${label}: ${msg}`);
            if (all.some(({ ex }) => !ex)) return fail("exercício inexistente");
            const ids = all.map(({ ex }) => ex.id);
            if (new Set(ids).size !== ids.length) fail("exercício repetido");
            all.forEach(({ ex }) => {
              if (!canDo(ex, equipment)) fail(`${ex.id} sem o equipamento`);
              if ((noImpact || limits.flags.length) && ex.impact) fail(`${ex.id} tem impacto`);
              Object.entries(limits.regions).forEach(([r, l]) => l === "evitar" && (ex.joints?.[r] || 0) >= 2 && fail(`${ex.id} força ${r}`));
              if (limits.conditions.includes("chao") && FLOOR.includes(ex.position)) fail(`${ex.id} é no chão`);
              if (limits.flags.includes("gestacao") && (["chao-costas", "chao-brucos", "banco"].includes(ex.position) || ex.pattern === "core-flexao" || (ex.joints?.lombar || 0) >= 1)) fail(`${ex.id} não indicado na gestação`);
              if (ex.id === "flexao") fail("flexao entrou mesmo com dor forte registrada");
            });
            if (level === "iniciante" && main.some(({ ex }) => ex.complexity > 2)) fail("técnica alta para iniciante");
            if (main.filter(({ ex }) => (ex.joints?.lombar || 0) >= 2).length > 1) fail("mais de 1 exercício pesado para a lombar");
            const vol = {};
            main.forEach(({ it, ex }) => {
              Object.entries(ex.muscles || {}).forEach(([g, w]) => {
                if (w >= 1) vol[g] = (vol[g] || 0) + Number(it.sets);
              });
            });
            Object.entries(vol).forEach(([g, v]) => v > 10 && fail(`${v} séries de ${g}`));
            const push = main.filter(({ ex }) => fam[ex.pattern] === "empurrar").length;
            const pull = main.filter(({ ex }) => fam[ex.pattern] === "puxar").length;
            if (["corpo", "superiores"].includes(focus) && equipment === ALL && !Object.keys(limits.regions).length && !limits.flags.length && push > pull) fail(`${push} empurrões e ${pull} puxadas`);
            if (equipment === ALL && !limits.flags.length && main.length === 0) fail("treino vazio");
            // Tempo calibrado: a estimativa (arredondada de 5 em 5) não passa do tempo escolhido + 5 min.
            if (minutes > time + 5 && main.length > 2) fail(`estimativa de ${minutes} min`);
          });
  return { combos: n, errors };
};
