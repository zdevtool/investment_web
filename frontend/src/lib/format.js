export function fmtTime(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

export function statusPill(run) {
  if (!run) return { label: '—', cls: 'bg-slate-700 text-slate-200' }
  if (run.status === 'in_progress' || run.status === 'queued')
    return { label: run.status, cls: 'bg-amber-500/20 text-amber-200' }
  if (run.conclusion === 'success')
    return { label: 'success', cls: 'bg-emerald-500/20 text-emerald-200' }
  if (run.conclusion === 'failure')
    return { label: 'failure', cls: 'bg-rose-500/20 text-rose-200' }
  if (run.conclusion === 'cancelled')
    return { label: 'cancelled', cls: 'bg-slate-500/20 text-slate-200' }
  return { label: run.conclusion || run.status || '—', cls: 'bg-slate-500/20 text-slate-200' }
}
