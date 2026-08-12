// Supports: * , */n , a-b , comma lists — enough for demo-grade scheduling
// without pulling in a heavier cron-parsing dependency.
function fieldMatches(field, value) {
  return field.split(',').some((part) => {
    if (part === '*') return true;
    if (part.includes('/')) {
      const [range, stepStr] = part.split('/');
      const step = Number(stepStr);
      if (range === '*') return value % step === 0;
      const [start, end] = range.split('-').map(Number);
      return value >= start && value <= end && (value - start) % step === 0;
    }
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      return value >= start && value <= end;
    }
    return Number(part) === value;
  });
}

/** expr: "minute hour day month weekday" (UTC) */
function cronMatches(expr, date = new Date()) {
  const [min, hour, day, month, weekday] = expr.trim().split(/\s+/);
  return (
    fieldMatches(min, date.getUTCMinutes()) &&
    fieldMatches(hour, date.getUTCHours()) &&
    fieldMatches(day, date.getUTCDate()) &&
    fieldMatches(month, date.getUTCMonth() + 1) &&
    fieldMatches(weekday, date.getUTCDay())
  );
}

module.exports = { cronMatches };
