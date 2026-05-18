// Числовые лимиты — синхронны с scripts/add-numeric-checks.sql.
// Не даём сохранить отрицательные/абсурдные значения (BUG-005/UX-003).

export const LIMITS = {
  sets:   { min: 1, max: 20 },
  reps:   { min: 1, max: 3600 },   // для режима «время» reps = секунды
  weight: { min: 0, max: 1000 },
  rest:   { min: 0, max: 3600 },
  actualReps:   { min: 0, max: 3600 },
  actualWeight: { min: 0, max: 1000 },
} as const

export function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

export const clampSets   = (n: number) => clamp(Math.round(n), LIMITS.sets.min, LIMITS.sets.max)
export const clampReps   = (n: number) => clamp(Math.round(n), LIMITS.reps.min, LIMITS.reps.max)
export const clampWeight = (n: number) => clamp(n, LIMITS.weight.min, LIMITS.weight.max)
export const clampRest   = (n: number | null): number | null =>
  n == null ? null : clamp(Math.round(n), LIMITS.rest.min, LIMITS.rest.max)
export const clampActualReps   = (n: number | null): number | null =>
  n == null ? null : clamp(Math.round(n), LIMITS.actualReps.min, LIMITS.actualReps.max)
export const clampActualWeight = (n: number | null): number | null =>
  n == null ? null : clamp(n, LIMITS.actualWeight.min, LIMITS.actualWeight.max)
