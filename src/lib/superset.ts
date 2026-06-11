// Суперсеты: соседние упражнения с одинаковым superset_group — одна связка.

export interface GroupInfo {
  size: number      // сколько упражнений в связке
  pos: number       // позиция текущего (1-based)
  start: boolean    // первое в связке
  end: boolean      // последнее в связке
  label: string     // Суперсет / Трисет / Круг
}

export function groupLabel(size: number): string {
  if (size === 2) return 'Суперсет'
  if (size === 3) return 'Трисет'
  return 'Круг'
}

// Информация о связке для элемента idx в упорядоченном списке.
// Связка = непрерывный отрезок соседей с тем же не-null superset_group.
export function groupInfoFor(
  list: Array<{ superset_group?: number | null }>,
  idx: number,
): GroupInfo | null {
  const g = list[idx]?.superset_group
  if (g == null) return null
  let start = idx
  while (start > 0 && list[start - 1]?.superset_group === g) start--
  let end = idx
  while (end < list.length - 1 && list[end + 1]?.superset_group === g) end++
  const size = end - start + 1
  if (size < 2) return null
  return {
    size,
    pos: idx - start + 1,
    start: idx === start,
    end: idx === end,
    label: groupLabel(size),
  }
}

// Пересчёт номеров групп из флагов «связано с предыдущим» (форма тренера).
// Возвращает массив superset_group той же длины, что list.
export function groupsFromLinks(linkedWithPrev: boolean[]): (number | null)[] {
  const out: (number | null)[] = new Array(linkedWithPrev.length).fill(null)
  let nextGroup = 1
  for (let i = 1; i < linkedWithPrev.length; i++) {
    if (!linkedWithPrev[i]) continue
    if (out[i - 1] == null) {
      out[i - 1] = nextGroup
      nextGroup++
    }
    out[i] = out[i - 1]
  }
  return out
}
