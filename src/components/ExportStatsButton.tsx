import { useState } from 'react'
import { Download } from 'lucide-react'

// Кнопка выгрузки статистики в CSV. Дёргает переданный экспортёр,
// показывает «Готовлю…» и сообщение, если данных ещё нет.
export default function ExportStatsButton({
  run,
  className = '',
}: {
  run: () => Promise<{ ok: boolean; empty?: boolean }>
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function handle() {
    if (busy) return
    setBusy(true)
    setMsg('')
    try {
      const res = await run()
      if (res.empty) setMsg('Нет завершённых тренировок для выгрузки')
    } catch {
      setMsg('Не удалось выгрузить. Попробуйте ещё раз')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={className}>
      <button
        onClick={handle}
        disabled={busy}
        className="w-full flex items-center justify-center gap-[6px] bg-white border border-[var(--slate-200)] text-[var(--slate-600)] text-[14px] font-semibold rounded-[10px] py-[10px] disabled:opacity-50 hover:bg-[var(--slate-50)] transition-colors"
      >
        <Download className="w-[15px] h-[15px]" />
        {busy ? 'Готовлю файл…' : 'Выгрузить в Excel (CSV)'}
      </button>
      {msg && <div className="text-[12px] text-[var(--slate-400)] text-center mt-[6px]">{msg}</div>}
    </div>
  )
}
