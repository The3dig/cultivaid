/** Datas no formato YYYY-MM-DD no fuso local. */
export function todayISO(): string {
  return toISODate(new Date())
}

export function toISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return toISODate(new Date(y, m - 1, d + days))
}

export function daysBetween(fromISO: string, toISO: string): number {
  const [y1, m1, d1] = fromISO.slice(0, 10).split('-').map(Number)
  const [y2, m2, d2] = toISO.slice(0, 10).split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso)
  return d.toLocaleDateString('pt-BR')
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

/** "hoje", "amanhã", "há 3 dias", "em 5 dias" */
export function relativeDay(iso: string): string {
  const diff = daysBetween(todayISO(), iso.slice(0, 10))
  if (diff === 0) return 'hoje'
  if (diff === 1) return 'amanhã'
  if (diff === -1) return 'ontem'
  return diff > 0 ? `em ${diff} dias` : `há ${-diff} dias`
}
