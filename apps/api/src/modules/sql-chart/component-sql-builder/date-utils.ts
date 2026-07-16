const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const startOfWeek = (date: Date): Date => {
  const result = new Date(date);
  const day = result.getDay();
  result.setDate(result.getDate() + (day === 0 ? -6 : 1 - day));
  result.setHours(0, 0, 0, 0);
  return result;
};

const fmt = (date: Date): string => date.toISOString().split('T')[0]!;
const fmtDt = (date: Date): string => date.toISOString().slice(0, 19).replace('T', ' ');

function buildDateMap(): Record<string, string> {
  const now = new Date();
  const endOfWeek = addDays(startOfWeek(now), 6);
  const som = new Date(now.getFullYear(), now.getMonth(), 1);
  const eom = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const solm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const eolm = new Date(now.getFullYear(), now.getMonth(), 0);
  const soy = new Date(now.getFullYear(), 0, 1);
  const eoy = new Date(now.getFullYear(), 11, 31);
  const lastWeek = addDays(now, -7);
  const sdlm = (() => {
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    const ty = m === 0 ? y - 1 : y, tm = m === 0 ? 11 : m - 1;
    return new Date(ty, tm, Math.min(d, new Date(ty, tm + 1, 0).getDate()));
  })();
  const sdly = (() => {
    const ty = now.getFullYear() - 1, tm = now.getMonth(), d = now.getDate();
    return new Date(ty, tm, Math.min(d, new Date(ty, tm + 1, 0).getDate()));
  })();
  return {
    TODAY: fmt(now),
    YESTERDAY: fmt(addDays(now, -1)),
    TOMORROW: fmt(addDays(now, 1)),
    SAME_TIME_LAST_WEEK: fmtDt(lastWeek),
    SAME_DAY_LAST_WEEK: fmt(addDays(now, -8)),
    SAME_DAY_LAST_MONTH: fmt(sdlm),
    SAME_DAY_LAST_YEAR: fmt(sdly),
    START_OF_WEEK: fmt(startOfWeek(now)),
    END_OF_WEEK: fmt(endOfWeek),
    START_OF_LAST_WEEK: fmt(addDays(startOfWeek(now), -7)),
    END_OF_LAST_WEEK: fmt(addDays(endOfWeek, -7)),
    START_OF_MONTH: fmt(som),
    END_OF_MONTH: fmt(eom),
    START_OF_LAST_MONTH: fmt(solm),
    END_OF_LAST_MONTH: fmt(eolm),
    START_OF_YEAR: fmt(soy),
    END_OF_YEAR: fmt(eoy),
    START_OF_LAST_YEAR: fmt(new Date(now.getFullYear() - 1, 0, 1)),
    END_OF_LAST_YEAR: fmt(new Date(now.getFullYear() - 1, 11, 31)),
    LAST_7_DAYS: fmt(addDays(now, -7)),
    LAST_30_DAYS: fmt(addDays(now, -30)),
  };
}

function resolveOffsetPlaceholder(value: string): string | null {
  const m = value.match(/^(START|END)_OF_(YEAR|MONTH|WEEK)_OFFSET_(-?\d+)$/);
  if (!m) return null;
  const [, boundary, unit, offsetStr] = m;
  const offset = Number(offsetStr);
  const now = new Date();
  if (unit === 'YEAR') {
    const y = now.getFullYear() + offset;
    return fmt(boundary === 'START' ? new Date(y, 0, 1) : new Date(y, 11, 31));
  }
  if (unit === 'MONTH') {
    const m2 = now.getMonth() + offset;
    return fmt(boundary === 'START' ? new Date(now.getFullYear(), m2, 1) : new Date(now.getFullYear(), m2 + 1, 0));
  }
  const weekBase = startOfWeek(now);
  return fmt(boundary === 'START' ? addDays(weekBase, offset * 7) : addDays(addDays(weekBase, 6), offset * 7));
}

export function resolveDynamicDateValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const map = buildDateMap();
  if (map[value]) return map[value];
  return resolveOffsetPlaceholder(value) ?? value;
}

export function replaceDynamicDatePlaceholders(expression: string): string {
  const map = buildDateMap();
  let result = expression;
  for (const [key, val] of Object.entries(map)) {
    result = result.replaceAll(`'${key}'`, `'${val}'`).replaceAll(`"${key}"`, `'${val}'`);
  }
  return result;
}
