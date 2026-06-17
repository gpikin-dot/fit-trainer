import { supabase } from './supabase'
import type { ActualSet } from '../types/database'

// Выгрузка статистики тренировок в CSV (одна строка на подход).
// Формат: UTF-8 BOM + разделитель «;» — открывается в Excel с рус. локалью
// и в Google Sheets без танцев с кодировкой.

interface ResultRow {
  actual_reps: number | null
  actual_weight_kg: number | null
  actual_sets: ActualSet[] | null
  client_note: string | null
  exercise_library: { name_ru: string | null } | null
  assigned_workout: {
    completed_at: string | null
    workout: { name: string | null } | null
    client: { name: string | null } | null
  } | null
}

const HEADERS = [
  'Дата', 'Клиент', 'Тренировка', 'Упражнение',
  'Подход', 'Повторы', 'Вес, кг', 'Время', 'Комментарий',
]

function csvCell(v: string | number | null | undefined): string {
  if (v == null) return ''
  const s = String(v)
  // Экранируем по RFC 4180, если есть разделитель/кавычка/перенос
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function triggerDownload(filename: string, csv: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Собирает завершённые тренировки клиента в плоские строки «по подходу».
// includeClientName — для тренера (несколько клиентов смысла нет, но имя
// в файле помогает не перепутать выгрузки).
async function fetchRows(clientId: string): Promise<ResultRow[]> {
  const { data, error } = await supabase
    .from('exercise_results')
    .select('actual_reps, actual_weight_kg, actual_sets, client_note, exercise_library:exercises_library(name_ru), assigned_workout:assigned_workouts!inner(completed_at, status, client_id, workout:workouts(name), client:profiles!assigned_workouts_client_id_fkey(name))')
    .eq('completed', true)
    .eq('assigned_workout.client_id', clientId)
    .eq('assigned_workout.status', 'completed')

  if (error || !data) return []
  return (data as unknown as ResultRow[])
    .filter(r => r.assigned_workout?.completed_at)
    .sort((a, b) => a.assigned_workout!.completed_at!.localeCompare(b.assigned_workout!.completed_at!))
}

function rowsToCsv(rows: ResultRow[], includeClientName: boolean): string {
  const headers = includeClientName ? HEADERS : HEADERS.filter(h => h !== 'Клиент')
  const lines: string[] = [headers.join(';')]

  for (const r of rows) {
    const date = fmtDate(r.assigned_workout!.completed_at)
    const clientName = r.assigned_workout?.client?.name ?? ''
    const workout = r.assigned_workout?.workout?.name ?? ''
    const exercise = r.exercise_library?.name_ru ?? ''
    const note = r.client_note ?? ''
    const sets = (r.actual_sets ?? []).filter(s => s.completed)

    const emit = (setNo: string, reps: number | null, weight: number | null, time: string, withNote: boolean) => {
      const cells = [
        date,
        ...(includeClientName ? [clientName] : []),
        workout, exercise, setNo,
        reps ?? '', weight ?? '', time,
        withNote ? note : '',
      ]
      lines.push(cells.map(csvCell).join(';'))
    }

    if (sets.length > 0) {
      sets.forEach((s, i) => emit(String(i + 1), s.reps, s.weight, fmtTime(s.at), i === 0))
    } else {
      // Старые записи без разбивки по подходам
      emit('—', r.actual_reps, r.actual_weight_kg, '', true)
    }
  }
  return lines.join('\r\n')
}

function safeName(s: string): string {
  return s.trim().replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/_+/g, '_').slice(0, 40) || 'client'
}

// Выгрузка по одному клиенту. label — имя для названия файла.
// withClientColumn — добавить колонку «Клиент» (для выгрузки тренером).
export async function exportClientStats(
  clientId: string,
  label: string,
  withClientColumn = false,
): Promise<{ ok: boolean; empty?: boolean }> {
  const rows = await fetchRows(clientId)
  if (rows.length === 0) return { ok: true, empty: true }
  const csv = rowsToCsv(rows, withClientColumn)
  const today = fmtDate(new Date().toISOString()).replace(/\./g, '-')
  triggerDownload(`FitTrainer_${safeName(label)}_${today}.csv`, csv)
  return { ok: true }
}
