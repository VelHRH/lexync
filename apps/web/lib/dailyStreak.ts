import { supabase } from './supabase';

export type DailyStreak = { current: number; extendedToday: boolean };

let timezoneReport: Promise<void> | null = null;

export function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export function reportLearnerTimezone() {
  if (timezoneReport) return timezoneReport;
  const timezone = browserTimezone();
  if (!timezone) return Promise.resolve();
  timezoneReport = (async () => {
    const { error } = await supabase.rpc('report_learner_timezone', { p_timezone: timezone });
    if (error) timezoneReport = null;
  })();
  return timezoneReport;
}

export function parseDailyStreak(value: unknown): DailyStreak | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const current = Number(record.current);
  if (!Number.isFinite(current) || typeof record.extended_today !== 'boolean') return null;
  return { current, extendedToday: record.extended_today };
}

export async function readDailyStreak() {
  const { data, error } = await supabase.rpc('daily_streak');
  if (error) return null;
  return parseDailyStreak(data);
}

export function newlyExtendedStreak(before: DailyStreak | null, after: DailyStreak | null) {
  return before && !before.extendedToday && after?.extendedToday ? after.current : null;
}

export function streakDays(count: number) {
  return `${count} ${count === 1 ? 'day' : 'days'}`;
}
