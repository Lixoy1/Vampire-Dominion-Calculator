/**
 * InventoryLedger — единый резерв предметов для многошагового плана.
 *
 * Не рассчитывает игровые цены. Получает уже известные количества из
 * расчётных модулей и гарантирует, что одна и та же единица предмета
 * не будет зарезервирована дважды в разных шагах одного плана.
 */

function normalizeCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizeItemId(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

export function createInventoryLedger(initialInventory = {}) {
  if (!initialInventory || typeof initialInventory !== 'object' || Array.isArray(initialInventory)) {
    throw new TypeError('Inventory must be an object keyed by item ID.');
  }

  const remaining = {};
  for (const [itemId, count] of Object.entries(initialInventory)) {
    remaining[itemId] = normalizeCount(count);
  }
  const reservations = [];

  function getCount(itemId) {
    const key = normalizeItemId(itemId);
    return key === null ? 0 : normalizeCount(remaining[key]);
  }

  function getRemaining() {
    return { ...remaining };
  }

  function getReservations() {
    return reservations.map(row => ({ ...row }));
  }

  function reserveMany(requests) {
    if (!Array.isArray(requests)) {
      throw new TypeError('Reservations must be supplied as an array.');
    }

    const normalized = [];
    const totals = new Map();
    const reasons = new Map();

    for (const request of requests) {
      const itemId = normalizeItemId(request?.itemId);
      const amount = Number(request?.amount ?? 0);
      if (itemId === null) {
        return {
          ok: false,
          failures: [{ itemId: null, need: amount, available: 0, reason: 'missing_item_id' }],
          remaining: getRemaining(),
        };
      }
      if (!Number.isFinite(amount) || amount < 0) {
        throw new RangeError(`Invalid reservation amount for item ${itemId}.`);
      }
      if (amount === 0) continue;

      normalized.push({
        itemId,
        amount,
        reason: request.reason == null ? '' : String(request.reason),
      });
      totals.set(itemId, (totals.get(itemId) ?? 0) + amount);
      if (request.reason) {
        const list = reasons.get(itemId) ?? [];
        list.push(String(request.reason));
        reasons.set(itemId, list);
      }
    }

    const failures = [];
    for (const [itemId, need] of totals) {
      const available = getCount(itemId);
      if (available < need) {
        failures.push({
          itemId,
          need,
          available,
          missing: need - available,
          reasons: reasons.get(itemId) ?? [],
        });
      }
    }

    // All-or-nothing: no item is deducted when any item in the batch is short.
    if (failures.length) {
      return { ok: false, failures, remaining: getRemaining() };
    }

    for (const request of normalized) {
      remaining[request.itemId] = getCount(request.itemId) - request.amount;
      reservations.push({ ...request, remaining: remaining[request.itemId] });
    }

    return {
      ok: true,
      reserved: normalized.reduce((sum, row) => sum + row.amount, 0),
      remaining: getRemaining(),
      reservations: getReservations(),
    };
  }

  function reserve(itemId, amount, reason = '') {
    return reserveMany([{ itemId, amount, reason }]);
  }

  return Object.freeze({
    getCount,
    getRemaining,
    getReservations,
    reserve,
    reserveMany,
  });
}
