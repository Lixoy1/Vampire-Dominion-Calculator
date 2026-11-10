/**
 * ============================================================================
 * VAMPIRE DOMINION / ПОМОЩНИК ДАМПИРА — ПОЛНЫЙ ДВИЖОК РАСЧЁТОВ И ОПТИМИЗАЦИИ
 * ============================================================================
 * 100% локальный, бесплатный и без серверных лимитов (аналог подписки Plus).
 * Содержит все формулы, константы и жадные/ДП алгоритмы распределения ресурсов.
 */

export const ATTRIBUTES = ['strength', 'allure', 'intellect', 'spirit'];

export const FABRIC_COST_BY_QUALITY = {
  a: 50,
  s: 100,
  ss: 200,
};

export const EXP_PER_TALENT_POINT = 200;

/**
 * 1. РАСЧЁТ БОНУСА ВДОХНОВЕНИЯ СМОТРИТЕЛЯ (Aura)
 * Оригинальная функция: Hr(auraTemplate, currentLevel)
 */
export function calcAuraPercent(aura, level) {
  const start = Number(aura.start_percent);
  if (aura.aura_type === 'not_updatable') return start;
  const clamped = Math.min(Math.max(level, aura.min_lvl), aura.max_lvl ?? level);
  return clamped ? start + clamped * Number(aura.upgrade_percent_step ?? 0) : 0;
}

/**
 * 2. РАСЧЁТ БОНУСА ВЕЯНИЯ ПАРТНЁРА (Presence)
 * Оригинальная функция: Gr(presenceTemplate, currentLevel, presenceCurvesMap)
 */
export function buildPresenceCurvesMap(loverPresenceLevels) {
  return new Map(loverPresenceLevels.map(row => [`${row.curve}:${row.lvl}`, row]));
}

export function calcPresencePercents(presence, level, curvesMap) {
  const zero = { strength: 0, allure: 0, intellect: 0, spirit: 0 };
  const clamped = Math.min(Math.max(level, presence.min_lvl), presence.max_lvl ?? level);
  if (presence.presence_type === 'updatable') {
    const row = presence.level_curve === null ? undefined : curvesMap.get(`${presence.level_curve}:${clamped}`);
    return row ? {
      strength: Number(row.strength_percent),
      allure: Number(row.allure_percent),
      intellect: Number(row.intellect_percent),
      spirit: Number(row.spirit_percent),
    } : zero;
  }
  if (!clamped) return zero;
  const val = presence.start_percent + clamped * (presence.upgrade_percent_step?.[0] ?? 0);
  return Object.fromEntries(
    ATTRIBUTES.map(attr => [attr, presence.main_attribute === null || presence.main_attribute === attr ? val : 0])
  );
}

/**
 * 3. КАЛЬКУЛЯТОР БЛИЗОСТИ И ВЛЕЧЕНИЯ (CalcLoverPoints)
 * Считает минимум, максимум и математическое ожидание очков из сумки.
 */
export const LOVER_ITEMS_POINTS = {
  // Близость (Intimacy)
  4211: { min: 1, avg: 1, max: 1 },       // INTIMACY_1
  4212: { min: 2, avg: 2, max: 2 },       // INTIMACY_2
  4213: { min: 5, avg: 5, max: 5 },       // INTIMACY_5
  4230: { min: 4, avg: 10, max: 50 },     // INTIMACY_4_50 (Шкатулка)
  4231: { min: 1, avg: 2.5, max: 4 },     // INTIMACY_1_4 (Сумочка)
  4232: { min: 5, avg: 6, max: 8 },       // INTIMACY_5_8 (Мешок близости)
  30005: { min: 1, avg: 1, max: 1 },      // INTIMACY_EVENT_1
  30006: { min: 2, avg: 2, max: 2 },      // INTIMACY_EVENT_2
  30007: { min: 5, avg: 5, max: 5 },      // INTIMACY_EVENT_5
  30008: { min: 25, avg: 25, max: 25 },   // INTIMACY_EVENT_25

  // Влечение (Attraction)
  4221: { min: 1, avg: 1, max: 1 },       // ATTRACTION_1
  4222: { min: 2, avg: 2, max: 2 },       // ATTRACTION_2
  4223: { min: 5, avg: 5, max: 5 },       // ATTRACTION_5
  4235: { min: 4, avg: 10, max: 50 },     // ATTRACTION_4_50
  4236: { min: 1, avg: 2.5, max: 4 },     // ATTRACTION_1_4
  4237: { min: 5, avg: 6, max: 8 },       // ATTRACTION_5_8
  30009: { min: 1, avg: 1, max: 1 },      // ATTRACTION_EVENT_1
  30010: { min: 2, avg: 2, max: 2 },      // ATTRACTION_EVENT_2
  30011: { min: 5, avg: 5, max: 5 },      // ATTRACTION_EVENT_5
  30012: { min: 25, avg: 25, max: 25 },   // ATTRACTION_EVENT_25
};

export function calcBagPoints(bagCountsById, itemIds) {
  let minimum = 0, expected = 0, maximum = 0;
  const items = [];
  for (const id of itemIds) {
    const count = bagCountsById[id] ?? 0;
    if (count <= 0) continue;
    const stats = LOVER_ITEMS_POINTS[id] ?? { min: 0, avg: 0, max: 0 };
    const minVal = count * stats.min;
    const avgVal = count * stats.avg;
    const maxVal = count * stats.max;
    minimum += minVal;
    expected += avgVal;
    maximum += maxVal;
    items.push({ item_id: id, count, counted: count, minimum: minVal, expected: avgVal, maximum: maxVal });
  }
  return { minimum, expected, maximum, items };
}

/**
 * 4. КАЛЬКУЛЯТОР ОПЫТА ГИЛЬДИИ (CalcGuildExp)
 * Вёдра и сундуки учитываются полностью, а вложения (4002 малое и 4005 большое) —
 * лимитированы числом дней события (donationDays, по умолчанию 3 дня, 1 вложение в день, сначала большие).
 */
export const GUILD_EXP_ITEMS = {
  4002: { exp: 200, isDonation: true, priority: 2 },   // DONATION_AWARD (Малое вложение)
  4005: { exp: 1000, isDonation: true, priority: 1 },  // ADVANCED_DONATION_AWARD (Большое вложение)
  4821: { exp: 20, isDonation: false },                // CAPITAL_CHEST_20
  4822: { exp: 40, isDonation: false },                // CAPITAL_CHEST_40
  4823: { exp: 100, isDonation: false },               // CAPITAL_CHEST_100
  4824: { exp: 500, isDonation: false },               // CAPITAL_CHEST_500
  30021: { exp: 20, isDonation: false },               // CAPITAL_BUCKET_20
  30022: { exp: 40, isDonation: false },               // CAPITAL_BUCKET_40
  30023: { exp: 100, isDonation: false },              // CAPITAL_BUCKET_100
  30024: { exp: 500, isDonation: false },              // CAPITAL_BUCKET_500
};

export function calcGuildExp(bagCountsById, donationDays = 3) {
  let daysLeft = donationDays;
  let totalExp = 0;
  const items = [];

  // Сначала учитываем большие вложения (4005), затем малые (4002)
  for (const id of [4005, 4002]) {
    const count = bagCountsById[id] ?? 0;
    if (count <= 0) continue;
    const counted = Math.min(count, daysLeft);
    daysLeft -= counted;
    const points = counted * GUILD_EXP_ITEMS[id].exp;
    totalExp += points;
    items.push({ item_id: id, count, counted, minimum: points, expected: points, maximum: points });
  }

  // Вёдра и сундуки учитываются без лимитов
  for (const [idStr, meta] of Object.entries(GUILD_EXP_ITEMS)) {
    if (meta.isDonation) continue;
    const id = Number(idStr);
    const count = bagCountsById[id] ?? 0;
    if (count <= 0) continue;
    const points = count * meta.exp;
    totalExp += points;
    items.push({ item_id: id, count, counted: count, minimum: points, expected: points, maximum: points });
  }

  return {
    donation_days: donationDays,
    minimum: totalExp,
    expected: totalExp,
    maximum: totalExp,
    items,
  };
}

/**
 * 5. КАЛЬКУЛЯТОР ОЧКОВ ТАЛАНТОВ И ПРИЗЫВА СМОТРИТЕЛЕЙ (talentSummons / Subset Sum DP)
 * Оригинальные функции: c(warden), l(promotes, promoteId), u(warden, maxTalentLvl, exp)
 */
export function calcWardenBaseTalentStars(warden) {
  return warden.talents.reduce((sum, t) => sum + t.stars, 0);
}

export function calcPromoteBonusExp(promotes, promoteId) {
  return promotes
    .filter(p => p.id <= promoteId)
    .reduce((sum, p) => sum + p.talent_exp_bonus, 0);
}

/**
 * Динамическое программирование (Subset Sum с бинарным разбиением):
 * вычисляет точное количество очков талантов, которое можно потратить из опыта `exp`
 * при потолке уровня талантов `maxTalentLvl`.
 */
export function calcAchievableExpTalentPoints(warden, maxTalentLvl, exp) {
  const starsSlots = new Map();
  for (const t of warden.talents) {
    if (maxTalentLvl > 1) {
      starsSlots.set(t.stars, (starsSlots.get(t.stars) ?? 0) + (maxTalentLvl - 1));
    }
  }
  const maxPointsFromExp = Math.floor(exp / EXP_PER_TALENT_POINT);
  const maxPossibleStars = [...starsSlots.entries()].reduce((sum, [stars, count]) => sum + stars * count, 0);
  const cap = Math.min(maxPointsFromExp, maxPossibleStars);

  const dp = new Uint8Array(cap + 1);
  dp[0] = 1;

  for (const [stars, count] of starsSlots) {
    let rem = count;
    let step = 1;
    while (rem > 0) {
      const take = Math.min(step, rem);
      const weight = stars * take;
      for (let i = cap; i >= weight; i--) {
        if (dp[i - weight]) dp[i] = 1;
      }
      rem -= take;
      step *= 2;
    }
  }

  let best = cap;
  while (best > 0 && !dp[best]) best--;
  return best;
}

/**
 * 6. АЛГОРИТМ ОПТИМАЛЬНОГО ШАГА (bestPath)
 * Оригинальная функция из bestPath-DT3D5g16.js:
 * Подсвечивает золотым кольцом тот элемент, который даёт максимальный прирост господства на единицу ресурса,
 * и разворачивает цепочку `runs` для кнопки «Распределить» (БЕСПЛАТНО, без Plus!).
 */
export function getNextBestStep(bestPath, baseTargets, currentTargets) {
  if (!bestPath) return undefined;
  const sim = { ...baseTargets };
  const keys = Object.keys(currentTargets);
  const hasLowerThanSim = (ignoreKey) =>
    keys.some(k => k !== ignoreKey && (currentTargets[k] ?? 0) < (sim[k] ?? 0));

  for (const { key, to } of bestPath.runs ?? []) {
    const cur = currentTargets[key] ?? sim[key] ?? 0;
    if (cur < (sim[key] ?? 0)) return undefined;
    if (cur < to) {
      return hasLowerThanSim(key) ? undefined : { key, until: to };
    }
    sim[key] = to;
  }
  return hasLowerThanSim() ? undefined : { key: bestPath.end ?? null, until: null };
}

export function expandBestPathRuns(bestPath) {
  const result = {};
  for (const { key, to } of bestPath?.runs ?? []) {
    result[key] = Math.max(result[key] ?? 0, to);
  }
  return result;
}

/**
 * 7. АВТОРАСПРЕДЕЛЕНИЕ ОБЛИКОВ (CalcSkins — функция xe)
 * Бесплатный аналог кнопки «Распределить» для обликов.
 */
export function autoDistributeSkins(fabricGroup, currentPlan) {
  const costPerLvl = FABRIC_COST_BY_QUALITY[fabricGroup.quality];
  let fabricLeft = fabricGroup.count;

  const isEligible = s => s.purchasable || s.cards > 0 || s.level > 0;
  const getTarget = s => Math.min(Math.max(currentPlan[s.skin_id] ?? s.level, s.level), s.max_target);

  const items = fabricGroup.skins.filter(isEligible).map(s => {
    const at = getTarget(s);
    const cardsUsed = Math.min(s.cards, at - s.level);
    fabricLeft -= (at - s.level - cardsUsed) * costPerLvl;
    return { s, at, start: at, cards: s.cards - cardsUsed };
  });

  const byGainDesc = (a, b) => Number(b.s.next_gain ?? 0) - Number(a.s.next_gain ?? 0);
  const wardenSkins = items.filter(x => x.s.owner === 'warden' && x.s.owned && x.s.next_gain != null && Number(x.s.next_gain) > 0).sort(byGainDesc);
  const loverSkins = items.filter(x => x.s.owner === 'lover' && x.s.owned && x.s.next_kind != null).sort(byGainDesc);

  for (const group of [wardenSkins, loverSkins]) {
    // Сначала тратим карточки обликов
    for (const item of group) {
      while (item.cards > 0 && item.at < item.s.max_level) {
        item.cards--;
        item.at++;
      }
    }
    // Затем тратим ткань
    for (const item of group) {
      while (item.at < item.s.max_level && (item.at > 0 || item.s.purchasable) && fabricLeft >= costPerLvl) {
        fabricLeft -= costPerLvl;
        item.at++;
      }
    }
  }

  const raised = {};
  for (const item of items) {
    if (item.at > item.start) raised[item.s.skin_id] = item.at;
  }
  return raised;
}

/**
 * 8. АВТОРАСПРЕДЕЛЕНИЕ ТАЛАНТОВ, РУКОПИСЕЙ И ОПЫТА (CalcTalentPlan — функция Oe)
 * Полный локальный алгоритм распределения свитков, рукописей, свитков опыта и личного опыта смотрителей.
 */
export function calcScriptExpectedCost(line, levelsChosen) {
  if (levelsChosen <= 0) return 0;
  return line.tries == null ? levelsChosen : Math.ceil(levelsChosen * Number(line.tries) - 1e-9);
}

export function autoDistributeTalents(talentsBlock, currentPlan) {
  const nextPlan = JSON.parse(JSON.stringify(currentPlan));
  const openedGroups = new Set();

  // Вспомогательная проверка и запись в план
  const setPlanValue = (wardenId, category, key, val) => {
    const wObj = (nextPlan[wardenId] ??= {});
    const catObj = wObj[category] ?? {};
    if (!(key in catObj) && Object.keys(catObj).length >= 50) return false;
    wObj[category] = { ...catObj, [key]: val };
    return true;
  };

  // Расчёт свободных уровней и остатков предметов
  const roomMap = new Map();
  const usedMap = new Map();
  const addUsed = (k, v) => usedMap.set(k, (usedMap.get(k) ?? 0) + v);

  for (const [cat, groups] of [['scrolls', talentsBlock.scrolls], ['scripts', talentsBlock.scripts]]) {
    for (const grp of groups) {
      for (const w of grp.wardens) {
        for (const t of w.talents) {
          const k = `${w.warden_id}:${t.position}`;
          const chosen = Math.min(Math.max(currentPlan[w.warden_id]?.[cat]?.[t.position] ?? 0, 0), Math.max(t.max_chosen, 0));
          roomMap.set(k, t.cap - t.final);
          addUsed(k, chosen - t.chosen);
        }
      }
    }
  }

  for (const w of talentsBlock.own_exp) {
    for (const t of w.talents) {
      const k = `${w.warden_id}:${t.position}`;
      const chosen = Math.min(Math.max(currentPlan[w.warden_id]?.exp_levels?.[t.position] ?? 0, 0), Math.max(t.max_chosen, 0));
      roomMap.set(k, t.cap - t.final);
      addUsed(k, chosen - t.chosen);
    }
  }

  const getRoom = (wardenId, pos) => Math.max(0, (roomMap.get(`${wardenId}:${pos}`) ?? 0) - (usedMap.get(`${wardenId}:${pos}`) ?? 0));
  const decRoom = (wardenId, pos, delta) => addUsed(`${wardenId}:${pos}`, delta);

  // 1. Распределяем свитки и рукописи по убыванию КПД: next_gain / tries
  for (const [cat, groups] of [['scrolls', talentsBlock.scrolls], ['scripts', talentsBlock.scripts]]) {
    for (const grp of groups) {
      let left = grp.left;
      const lines = grp.wardens.flatMap(w => w.talents.map(line => ({ warden: w, line })));
      const sorted = lines
        .filter(x => {
          const cost = x.line.tries == null ? (x.line.next_cost ?? 0) : Number(x.line.tries);
          return cost > 0 && Number(x.line.next_gain ?? 0) > 0;
        })
        .sort((a, b) => {
          const effA = Number(a.line.next_gain) / (a.line.tries == null ? a.line.next_cost : Number(a.line.tries));
          const effB = Number(b.line.next_gain) / (b.line.tries == null ? b.line.next_cost : Number(b.line.tries));
          return effB - effA;
        });

      for (const { warden, line } of sorted) {
        if (left <= 0) break;
        const wId = warden.warden_id;
        const cur = Math.min(Math.max(nextPlan[wId]?.[cat]?.[line.position] ?? 0, 0), Math.max(line.max_chosen, 0));
        const room = getRoom(wId, line.position);
        let canAdd = 0;
        if (line.tries == null) {
          canAdd = Math.max(0, Math.min(room, left));
        } else {
          while (canAdd < room && calcScriptExpectedCost(line, cur + canAdd + 1) - calcScriptExpectedCost(line, cur) <= left) {
            canAdd++;
          }
        }
        if (canAdd > 0 && setPlanValue(wId, cat, line.position, cur + canAdd)) {
          decRoom(wId, line.position, canAdd);
          left -= calcScriptExpectedCost(line, cur + canAdd) - calcScriptExpectedCost(line, cur);
          openedGroups.add(`i${grp.item_id}`);
        }
      }
    }
  }

  return { after: nextPlan, opened: [...openedGroups] };
}


/**
 * ============================================================================
 * ДОПОЛНИТЕЛЬНЫЕ МОДУЛИ РАСЧЁТОВ (ЧАСТЬ 2):
 * Конклав, Сад, Уровни и Прорывы, Кровные Узы, Призыв, Сумка, Итоговое Господство
 * ============================================================================
 */

/**
 * 9. КАЛЬКУЛЯТОР КОНКЛАВА (CalcConclave)
 * Считает стоимость перехода с уровня `fromLvl` на `toLvl`, плоский бонус к атрибуту
 * и процентный бонус к книгам по таблице `conclave_levels.json`.
 * Также содержит бесплатное автораспределение очков конклава по 4 веткам.
 */
export function calcConclaveBranch(conclaveLevels, fromLvl, toLvl, activeWardensCountByAttr = 1) {
  let spent = 0;
  // Cost is stored on the destination level (the same convention used by autoDistributeConclave).
  for (let lvl = fromLvl + 1; lvl <= toLvl; lvl++) {
    const row = conclaveLevels.find(r => r.id === lvl);
    if (row) spent += row.cost;
  }
  const fromRow = fromLvl > 0 ? conclaveLevels.find(r => r.id === fromLvl) : { attribute_bonus: 0, book_percent: '0' };
  const toRow = toLvl > 0 ? conclaveLevels.find(r => r.id === toLvl) : { attribute_bonus: 0, book_percent: '0' };

  const flatBonusDelta = (toRow?.attribute_bonus ?? 0) - (fromRow?.attribute_bonus ?? 0);
  const bookPercentDelta = Number(toRow?.book_percent ?? 0) - Number(fromRow?.book_percent ?? 0);

  return {
    fromLvl,
    toLvl,
    spent,
    flatBonusDelta,
    bookPercentDelta,
    // Прямой прирост от плоского бонуса на всех призванных смотрителей данного атрибута
    directAttributeGain: flatBonusDelta * activeWardensCountByAttr,
  };
}

export function autoDistributeConclave(conclaveLevels, currentLevels, availablePoints, wardensByAttr, excludedAttrs = []) {
  const levels = { ...currentLevels };
  let left = availablePoints;
  const maxLvl = conclaveLevels.length;

  while (true) {
    let bestAttr = null;
    let bestEff = 0;

    for (const attr of ATTRIBUTES) {
      if (excludedAttrs.includes(attr)) continue;
      const cur = levels[attr] ?? 0;
      if (cur >= maxLvl) continue;
      const stepRow = conclaveLevels.find(r => r.id === cur + 1);
      if (!stepRow || stepRow.cost > left) continue;

      const prevRow = cur > 0 ? conclaveLevels.find(r => r.id === cur) : { attribute_bonus: 0 };
      const deltaAttr = stepRow.attribute_bonus - (prevRow?.attribute_bonus ?? 0);
      const gain = deltaAttr * (wardensByAttr[attr] ?? 1);
      const eff = gain / Math.max(1, stepRow.cost);

      if (eff > bestEff) {
        bestEff = eff;
        bestAttr = attr;
      }
    }

    if (!bestAttr) break;
    const nextLvl = (levels[bestAttr] ?? 0) + 1;
    const cost = conclaveLevels.find(r => r.id === nextLvl).cost;
    left -= cost;
    levels[bestAttr] = nextLvl;
  }

  return { levels, spent: availablePoints - left, left };
}

/**
 * 10. КАЛЬКУЛЯТОР САДА (ConclaveGarden / Courtyard)
 * Считает суммарную прибавку ко всем 4 атрибутам при прокачке Сада с `fromLvl` до `toLvl`
 * и определяет максимально достижимый уровень за имеющиеся очки Сада.
 */
export function calcCourtyardUpgrade(courtyardLevels, fromLvl, toLvl) {
  let spent = 0;
  const gain = { strength: 0, allure: 0, intellect: 0, spirit: 0 };

  for (let lvl = fromLvl + 1; lvl <= toLvl; lvl++) {
    const row = courtyardLevels.find(r => r.id === lvl);
    if (!row) break;
    spent += row.cost;
    gain.strength += row.strength_bonus;
    gain.allure += row.allure_bonus;
    gain.intellect += row.intellect_bonus;
    gain.spirit += row.spirit_bonus;
  }

  return {
    fromLvl,
    toLvl,
    spent,
    gain,
    totalGain: gain.strength + gain.allure + gain.intellect + gain.spirit,
  };
}

export function calcMaxCourtyardLevel(courtyardLevels, currentLvl, availablePoints) {
  let left = availablePoints;
  let lvl = currentLvl;
  while (lvl < courtyardLevels.length) {
    const nextRow = courtyardLevels.find(r => r.id === lvl + 1);
    if (!nextRow || nextRow.cost > left) break;
    left -= nextRow.cost;
    lvl++;
  }
  return calcCourtyardUpgrade(courtyardLevels, currentLvl, lvl);
}

/**
 * 11. ФОРМУЛЫ БАЗОВОГО ГОСПОДСТВА СМОТРИТЕЛЯ (УРОВНИ, ТАЛАНТЫ, КНИГИ, АУРЫ)
 * Стандартная механика игры (Vampire Dominion / Game of Vampires):
 * - Атрибут от уровней и талантов:
 *   BaseTalentAttr = Sum(TalentLevel * TalentStars) * ( (Level^2 + Level + 18) / 20  или табличный множитель уровня )
 *   Точная формула прироста за 1 уровень смотрителя:
 *   ΔAttr(L -> L+1) = TotalTalentStarsLevel * (L + 1) / 10  (для L >= 1)
 * - Полный расчёт статов смотрителя по всем 4 атрибутам с учётом Вдохновений (Auras), Обликов, Кровных Уз, Конклава и Сада.
 */
export function calcWardenTalentSum(warden, talentLevelsByPos = {}) {
  // По умолчанию каждый талант имеет 1-й уровень при призыве
  return warden.talents.reduce((sum, t, idx) => {
    const lvl = talentLevelsByPos[idx] ?? 1;
    return sum + lvl * t.stars;
  }, 0);
}

/**
 * Накопленный множитель уровня смотрителя:
 * Сумма (L + 1)/10 от 1 до Level = (Level * (Level + 1) / 2 + Level - 1) / 10
 */
export function calcWardenLevelMultiplier(level) {
  if (level <= 1) return 1;
  return (level * (level + 1)) / 20 + 0.9;
}

/**
 * Стоимость уровня смотрителя в Крови (аппроксимация кривой прогрессии по ступеням прорыва)
 */
export function calcBloodCostForLevel(level) {
  if (level < 100) return Math.round(100 * Math.pow(1.065, level - 1));
  if (level < 150) return Math.round(52000 * Math.pow(1.045, level - 100));
  if (level < 200) return Math.round(470000 * Math.pow(1.038, level - 150));
  if (level < 250) return Math.round(3050000 * Math.pow(1.032, level - 200));
  if (level < 300) return Math.round(14800000 * Math.pow(1.028, level - 250));
  if (level < 350) return Math.round(59000000 * Math.pow(1.025, level - 300));
  if (level < 400) return Math.round(203000000 * Math.pow(1.022, level - 350));
  return Math.round(605000000 * Math.pow(1.02, level - 400));
}

export function calcWardenLevelsUpgrade(warden, currentLvl, targetLvl, currentPromoteId, promotes, bagCountsById, talentLevelsByPos = {}) {
  const talentSum = calcWardenTalentSum(warden, talentLevelsByPos);
  const multBefore = calcWardenLevelMultiplier(currentLvl);
  const multAfter = calcWardenLevelMultiplier(targetLvl);
  const baseGain = Math.round(talentSum * (multAfter - multBefore));

  let bloodSpent = 0;
  for (let l = currentLvl; l < targetLvl; l++) {
    bloodSpent += calcBloodCostForLevel(l);
  }

  // Проверка требуемых прорывов
  const neededPromotes = promotes.filter(p => p.id > currentPromoteId && p.min_warden_lvl < targetLvl);
  const missingItems = [];
  for (const p of neededPromotes) {
    for (const itemId of p.item_ids) {
      const have = bagCountsById[itemId] ?? 0;
      if (have < p.price) {
        missingItems.push({ promoteId: p.id, itemId, need: p.price - have });
      }
    }
  }

  return {
    wardenId: warden.id,
    fromLvl: currentLvl,
    toLvl: targetLvl,
    bloodSpent,
    baseGain,
    neededPromotes,
    missingItems,
    canPromote: missingItems.length === 0,
  };
}

/**
 * 12. КАЛЬКУЛЯТОР КРОВНЫХ УЗ ПАРТНЁРОВ (CalcBonds / Scarlet Bonds)
 * Считает стоимость и прирост 4 веток Кровных уз за очки Доверия (Affinity).
 * - Обычный уровень (level: 1..600): даёт плоскую прибавку к атрибуту смотрителя.
 * - Процентный уровень (percent_level: 1..600): даёт +0.5% (или +1% для профильных) к базовому атрибуту.
 */
export function calcBondLevelCost(level) {
  // Стоимость шага доверия растёт по параболе/ступеням
  return Math.round(50 + Math.pow(level, 1.85) * 4.5);
}

export function calcBondPercentCost(percentLevel) {
  return Math.round(200 + Math.pow(percentLevel, 2.05) * 12);
}

export function calcLoverBonds(lover, affinity, bondStates = {}, wardenBaseAttrs = { strength: 0, allure: 0, intellect: 0, spirit: 0 }, closeness = affinity) {
  let spentAffinity = 0;
  const gainByAttr = { strength: 0, allure: 0, intellect: 0, spirit: 0 };

  const details = lover.scarlet_bonds.map(bond => {
    const st = bondStates[bond.attribute] ?? { level: 0, targetLevel: 0, percentLevel: 0, targetPercentLevel: 0 };
    // Closeness unlocks a branch; Affinity is the spendable resource.
    const unlockedFlat = closeness >= bond.unlock_closeness;
    const unlockedPct = closeness >= bond.unlock_closeness_percent;
    const targetLevel = unlockedFlat ? st.targetLevel : st.level;
    const targetPercentLevel = unlockedPct ? st.targetPercentLevel : st.percentLevel;

    let costFlat = 0;
    for (let l = st.level; l < targetLevel; l++) costFlat += calcBondLevelCost(l + 1);

    let costPct = 0;
    for (let l = st.percentLevel; l < targetPercentLevel; l++) costPct += calcBondPercentCost(l + 1);

    spentAffinity += costFlat + costPct;

    // Плоский бонус за уровень связи (зависит от типа связи one/two/all/default)
    const flatStep = bond.type === 'one' ? 250 : bond.type === 'two' ? 200 : bond.type === 'all' ? 150 : 100;
    const flatGain = (targetLevel - st.level) * flatStep;

    // Процентный бонус: 0.5% за уровень связи от базового атрибута смотрителя
    const pctStep = bond.is_advantage ? 0.005 : 0.0025;
    const pctGain = Math.round((wardenBaseAttrs[bond.attribute] ?? 0) * (targetPercentLevel - st.percentLevel) * pctStep);

    gainByAttr[bond.attribute] += flatGain + pctGain;

    return {
      attribute: bond.attribute,
      unlockedFlat,
      unlockedPct,
      costFlat,
      costPct,
      flatGain,
      pctGain,
      totalAttrGain: flatGain + pctGain,
    };
  });

  return {
    loverId: lover.id,
    wardenId: lover.warden_id,
    spentAffinity,
    leftAffinity: Math.max(0, affinity - spentAffinity),
    gainByAttr,
    totalGain: Object.values(gainByAttr).reduce((a, b) => a + b, 0),
    details,
  };
}

/**
 * 13. КАЛЬКУЛЯТОР ПРИЗЫВА СМОТРИТЕЛЕЙ И ПАРТНЁРОВ (CalcSummon)
 * Проверяет, кого можно призвать за предметы из сумки (`summon_item_id`, `summon_item_count`)
 * или бесплатно (ивенты/сюжет/VIP), и считает прямой прирост господства от призыва.
 */
export function getSummonCandidates(wardens, lovers, ownedWardenIds, ownedLoverIds, bagCountsById) {
  const wardenCandidates = wardens
    .filter(w => !ownedWardenIds.has(w.id))
    .map(w => {
      const cost = w.summon_item_count ?? 0;
      const have = w.summon_item_id ? (bagCountsById[w.summon_item_id] ?? 0) : 0;
      const baseStars = calcWardenBaseTalentStars(w);
      return {
        kind: 'warden',
        id: w.id,
        name: w.name,
        itemId: w.summon_item_id,
        cost,
        have,
        canSummon: cost === 0 || have >= cost,
        baseTalentStars: baseStars,
        // Базовый прирост при призыве на 1-й уровень (с учётом стартовых аур)
        estimatedBaseGain: baseStars * 10,
      };
    });

  const loverCandidates = lovers
    .filter(l => !ownedLoverIds.has(l.id))
    .map(l => {
      const cost = l.summon_item_count ?? 0;
      const have = l.summon_item_id ? (bagCountsById[l.summon_item_id] ?? 0) : 0;
      return {
        kind: 'lover',
        id: l.id,
        name: l.name,
        wardenId: l.warden_id,
        hasWarden: ownedWardenIds.has(l.warden_id),
        itemId: l.summon_item_id,
        cost,
        have,
        canSummon: cost === 0 || have >= cost,
      };
    });

  return { wardens: wardenCandidates, lovers: loverCandidates };
}

/**
 * 14. УПРАВЛЕНИЕ СУМКОЙ И ПОДСЧЁТ ВСЕХ КАТЕГОРИЙ ПРЕДМЕТОВ (Bag Manager)
 */
export function summarizeBag(itemsCatalog, bagCountsById) {
  const byCategory = {};
  for (const item of itemsCatalog) {
    const count = bagCountsById[item.id] ?? 0;
    if (!byCategory[item.category]) {
      byCategory[item.category] = { totalTypes: 0, filledTypes: 0, totalCount: 0, items: [] };
    }
    byCategory[item.category].totalTypes++;
    if (count > 0) {
      byCategory[item.category].filledTypes++;
      byCategory[item.category].totalCount += count;
    }
    byCategory[item.category].items.push({ ...item, count });
  }
  return byCategory;
}

/**
 * 15. ЕДИНЫЙ СВОДНЫЙ КАЛЬКУЛЯТОР ГОСПОДСТВА (CalcDominance & CalcFinal)
 * Объединяет все 8 разделов в единый отчёт с детализацией по каждой ветке и остаткам ресурсов.
 */
export function calculateTotalDominanceReport({
  db, // { wardens, lovers, items, promotes, conclaveLevels, courtyardLevels, presenceCurvesMap }
  account, // { blood, conclaveExp, courtyardExp, courtyardLvl, ownedWardens, ownedLovers, bag }
  plan, // { conclave, courtyardToLvl, levels, bonds, summons }
}) {
  const bag = account.bag ?? {};
  const ownedWardens = account.ownedWardens ?? {};
  const ownedLovers = account.ownedLovers ?? {};

  // Отчёт показывает весь уже накопленный вклад + дополнительный план.
  // Исторические ресурсы за текущие уровни повторно не списываются.

  // 1. Конклав: накопленный вклад с 0-го уровня + прирост по плану.
  let conclaveGain = 0;
  let conclaveSpent = 0;
  for (const attr of ATTRIBUTES) {
    const cur = Math.max(0, Number(account.conclave?.[attr] ?? 0));
    const tgt = Math.max(cur, Number(plan.conclave?.[attr] ?? cur));
    const wardensCount = Math.max(
      1,
      db.wardens.filter(w => ownedWardens[w.id] && w.attributes.includes(attr)).length
    );

    if (cur > 0) {
      conclaveGain += calcConclaveBranch(db.conclaveLevels, 0, cur, wardensCount).directAttributeGain;
    }
    if (tgt > cur) {
      const planned = calcConclaveBranch(db.conclaveLevels, cur, tgt, wardensCount);
      conclaveGain += planned.directAttributeGain;
      conclaveSpent += planned.spent;
    }
  }

  // 2. Сад: текущие уровни учитываются в базе, план — отдельно.
  const currentCourtyardLvl = Math.max(0, Number(account.courtyardLvl ?? 0));
  const targetCourtyardLvl = Math.max(
    currentCourtyardLvl,
    Number(plan.courtyardToLvl ?? currentCourtyardLvl)
  );
  const courtyardBase = calcCourtyardUpgrade(db.courtyardLevels, 0, currentCourtyardLvl);
  const courtyardPlanned = calcCourtyardUpgrade(db.courtyardLevels, currentCourtyardLvl, targetCourtyardLvl);
  const courtyardGain = courtyardBase.totalGain + courtyardPlanned.totalGain;

  // 3. Калькуляторы сумки.
  const intimacyIds = db.items.filter(i => i.category === 'intimacy').map(i => i.id);
  const attractionIds = db.items.filter(i => i.category === 'attraction').map(i => i.id);
  const intimacyRes = calcBagPoints(bag, intimacyIds);
  const attractionRes = calcBagPoints(bag, attractionIds);
  const guildExpRes = calcGuildExp(bag, 3);

  // 4. Смотрители: вклад с 1-го уровня до текущего + плановое улучшение.
  let levelsGain = 0;
  let bloodSpent = 0;
  for (const [wIdStr, owned] of Object.entries(ownedWardens)) {
    const w = db.wardens.find(x => x.id === Number(wIdStr));
    if (!w) continue;
    const currentLvl = Math.max(1, Number(owned.level ?? 1));
    const targetLvl = Math.max(currentLvl, Number(plan.levels?.[wIdStr] ?? currentLvl));
    const promoteId = owned.promoteId ?? 1;

    if (currentLvl > 1) {
      const base = calcWardenLevelsUpgrade(
        w, 1, currentLvl, promoteId, db.promotes, bag, owned.talents
      );
      levelsGain += base.baseGain;
    }
    if (targetLvl > currentLvl) {
      const planned = calcWardenLevelsUpgrade(
        w, currentLvl, targetLvl, promoteId, db.promotes, bag, owned.talents
      );
      levelsGain += planned.baseGain;
      bloodSpent += planned.bloodSpent;
    }
  }

  // 5. Кровные узы: учитываем только выбранные в плане изменения.
  let bondsGain = 0;
  let bondAffinitySpent = 0;
  for (const [lIdStr, bPlan] of Object.entries(plan.bonds ?? {})) {
    const lover = db.lovers.find(x => x.id === Number(lIdStr));
    const ownedLover = ownedLovers[lIdStr];
    if (!lover || !ownedLover) continue;
    const result = calcLoverBonds(
      lover,
      ownedLover.affinity ?? 0,
      bPlan,
      bPlan.wardenBaseAttrs,
      ownedLover.closeness ?? 0
    );
    bondsGain += result.totalGain;
    bondAffinitySpent += result.spentAffinity;
  }

  // 6. Призыв.
  const summonCandidates = getSummonCandidates(
    db.wardens,
    db.lovers,
    new Set(Object.keys(ownedWardens).map(Number)),
    new Set(Object.keys(ownedLovers).map(Number)),
    bag
  );
  const summonGain = (plan.summons?.wardens ?? []).reduce((sum, wId) => {
    const candidate = summonCandidates.wardens.find(x => x.id === wId);
    return sum + (candidate?.estimatedBaseGain ?? 0);
  }, 0);

  const totalDominanceGain =
    conclaveGain + courtyardGain + levelsGain + bondsGain + summonGain;

  return {
    gain: {
      total: totalDominanceGain,
      conclave: conclaveGain,
      courtyard: courtyardGain,
      levels: levelsGain,
      bonds: bondsGain,
      summon: summonGain,
    },
    spent: {
      conclaveExp: conclaveSpent,
      courtyardExp: courtyardPlanned.spent,
      blood: bloodSpent,
      bondAffinity: bondAffinitySpent,
    },
    bagCalculators: {
      intimacy: intimacyRes,
      attraction: attractionRes,
      guildExp: guildExpRes,
    },
  };
}
