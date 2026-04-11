import { useState, useEffect, useRef, useCallback, FormEvent, ChangeEvent } from 'react'
import type { Theme, User, TranscriptListItem, TranscriptAnalysis } from '../types'
import { ThemeToggle } from './ThemeToggle'
import { UserMenu } from './UserMenu'
import { WaveformIconSmall } from './icons'
import { TagManager } from './TagManager'
import styles from './HomePage.module.css'

interface Props {
  theme: Theme
  onToggleTheme: () => void
  user: User
  onLogout: () => void
  onOpen: (data: TranscriptAnalysis) => void
  onUpload: () => void
}

type GenerateState =
  | { kind: 'idle' }
  | { kind: 'form' }
  | { kind: 'running'; transcriptId: string; stage: string; pct: number; detail: string }
  | { kind: 'done'; transcriptId: string }
  | { kind: 'error'; message: string }

const STAGES = ['downloading', 'analyzing', 'done'] as const
const STAGE_LABELS: Record<string, string> = {
  downloading: 'Fetching captions',
  analyzing: 'Analyzing',
  done: 'Done',
}

export function HomePage({ theme, onToggleTheme, user, onLogout, onOpen, onUpload }: Props) {
  const [transcripts, setTranscripts] = useState<TranscriptListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [generate, setGenerate] = useState<GenerateState>({ kind: 'idle' })
  const [ytUrl, setYtUrl] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const sseRef = useRef<EventSource | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch('/api/transcripts', { credentials: 'include' })
      .then(r => r.json())
      .then(rows => { setTranscripts(rows); setLoading(false) })
      .catch(() => { setListError('Failed to load transcripts.'); setLoading(false) })
  }, [refreshKey])

  useEffect(() => () => { sseRef.current?.close() }, [])

  async function handleGenerate(e: FormEvent) {
    e.preventDefault()
    if (!ytUrl.trim()) return
    setSubmitError(null)
    setSubmitting(true)

    const res = await fetch('/api/jobs', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ youtubeUrl: ytUrl.trim() }),
    })

    setSubmitting(false)

    if (!res.ok) {
      setSubmitError('Failed to start job. Is the server running?')
      return
    }

    const { jobId, transcriptId } = await res.json()
    setGenerate({ kind: 'running', transcriptId, stage: 'downloading', pct: 0, detail: 'Starting…' })

    sseRef.current?.close()
    const source = new EventSource(`/api/jobs/${jobId}/progress`, { withCredentials: true })
    sseRef.current = source

    source.onmessage = (e) => {
      const payload = JSON.parse(e.data) as { stage: string; pct: number; detail: string }
      if (payload.stage === 'done') {
        source.close()
        setGenerate({ kind: 'done', transcriptId })
        setRefreshKey(k => k + 1)
      } else if (payload.stage === 'error') {
        source.close()
        setGenerate({ kind: 'error', message: payload.detail ?? 'Pipeline failed.' })
      } else {
        setGenerate(g =>
          g.kind === 'running'
            ? { ...g, stage: payload.stage, pct: payload.pct, detail: payload.detail }
            : g
        )
      }
    }

    source.onerror = () => {
      source.close()
      setGenerate(g => g.kind === 'running' ? { kind: 'error', message: 'Lost connection to server.' } : g)
    }
  }

  async function handleOpen(id: string) {
    setOpening(id)
    try {
      const r = await fetch(`/api/transcripts/${id}`, { credentials: 'include' })
      if (!r.ok) throw new Error('Failed to load transcript')
      const item = await r.json()
      if (!item.data) throw new Error('no-data')
      onOpen(item.data as TranscriptAnalysis)
    } catch (err) {
      setOpening(null)
      if (err instanceof Error && err.message === 'no-data') {
        setTranscripts(prev =>
          prev.map(t => t.id === id ? { ...t, hasData: false } : t)
        )
      }
    }
  }

  async function handleDeleteConfirmed() {
    if (!confirmDelete) return
    setDeleting(true)
    await fetch(`/api/transcripts/${confirmDelete.id}`, { method: 'DELETE', credentials: 'include' })
    setTranscripts(prev => prev.filter(t => t.id !== confirmDelete.id))
    setConfirmDelete(null)
    setDeleting(false)
  }

  function resetGenerate() {
    sseRef.current?.close()
    setGenerate({ kind: 'idle' })
    setYtUrl('')
    setSubmitError(null)
  }

  // ── Export / Import ──────────────────────────────────────────────────
  const [showDataMenu, setShowDataMenu] = useState(false)
  const [includePublic, setIncludePublic] = useState(false)
  const [importing, setImporting] = useState(false)
  const [dataMessage, setDataMessage] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    if (!showDataMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowDataMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showDataMenu])

  const handleExport = useCallback(async () => {
    setShowDataMenu(false)
    setDataMessage(null)
    const url = `/api/transcripts/export?includePublic=${includePublic}`
    const r = await fetch(url, { credentials: 'include' })
    if (!r.ok) { setDataMessage('Export failed.'); return }
    const data = await r.json()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `podcast-insighter-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    setDataMessage(`Exported ${data.count} transcript${data.count === 1 ? '' : 's'}.`)
  }, [includePublic])

  const handleImportFile = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setShowDataMenu(false)
    setImporting(true)
    setDataMessage(null)

    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const items = json.transcripts
      if (!Array.isArray(items)) throw new Error('Invalid export file — missing transcripts array')

      const r = await fetch('/api/transcripts/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcripts: items }),
      })
      if (!r.ok) throw new Error('Import request failed')
      const result = await r.json()
      setDataMessage(`Imported ${result.imported} transcript${result.imported === 1 ? '' : 's'}${result.skipped ? ` (${result.skipped} skipped)` : ''}.`)
      setRefreshKey(k => k + 1)
    } catch (err) {
      setDataMessage(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setImporting(false)
      if (importRef.current) importRef.current.value = ''
    }
  }, [])

  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null)

  // Gather all unique tags from loaded transcripts
  const allTags = Array.from(
    new Map(transcripts.flatMap(t => t.tags ?? []).map(tag => [tag.id, tag])).values()
  ).sort((a, b) => a.name.localeCompare(b.name))

  const filteredTranscripts = activeTagFilter
    ? transcripts.filter(t => (t.tags ?? []).some(tag => tag.id === activeTagFilter))
    : transcripts

  const showPanel = generate.kind !== 'idle'

  return (
    <div className={styles.page}>
      <nav className={styles.topBar}>
        <div className={styles.topBarBrand}>
          <WaveformIconSmall />
          <span className={styles.topBarTitle}>Podcast Insighter</span>
        </div>
        <div className={styles.topBarActions}>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <UserMenu user={user} onLogout={onLogout} />
        </div>
      </nav>

      <div className={styles.content}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>My Transcripts</h1>
            <p className={styles.pageSubtitle}>Your uploaded and generated transcript analyses</p>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.dataMenuWrapper} ref={menuRef}>
              <button
                className={styles.secondaryBtn}
                onClick={() => setShowDataMenu(v => !v)}
              >
                <DataIcon />
                Data
              </button>
              {showDataMenu && (
                <div className={styles.dataMenu}>
                  <label className={styles.dataMenuCheck}>
                    <input type="checkbox" checked={includePublic} onChange={e => setIncludePublic(e.target.checked)} />
                    Include public transcripts
                  </label>
                  <button className={styles.dataMenuItem} onClick={handleExport}>
                    <ExportIcon /> Export JSON
                  </button>
                  <hr className={styles.dataMenuDivider} />
                  <button className={styles.dataMenuItem} onClick={() => { setShowDataMenu(false); importRef.current?.click() }} disabled={importing}>
                    <ImportIcon /> {importing ? 'Importing…' : 'Import JSON'}
                  </button>
                </div>
              )}
              <input ref={importRef} type="file" accept=".json" onChange={handleImportFile} style={{ display: 'none' }} />
            </div>
            <button
              className={styles.secondaryBtn}
              onClick={onUpload}
              disabled={generate.kind === 'running'}
            >
              <UploadIcon />
              Upload JSON
            </button>
            <button
              className={styles.newBtn}
              onClick={() => setGenerate({ kind: 'form' })}
              disabled={showPanel}
            >
              <YoutubeIcon />
              Generate from YouTube
            </button>
          </div>
          {dataMessage && (
            <div className={styles.dataToast}>
              {dataMessage}
              <button className={styles.dataToastClose} onClick={() => setDataMessage(null)}>×</button>
            </div>
          )}
        </div>

        {/* Generate panel */}
        {showPanel && (
          <div className={styles.generatePanel}>
            {generate.kind === 'form' && (
              <form className={styles.generateForm} onSubmit={handleGenerate}>
                <YoutubeIcon />
                <input
                  className={styles.urlInput}
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=…"
                  value={ytUrl}
                  onChange={e => setYtUrl(e.target.value)}
                  autoFocus
                />
                <button className={styles.newBtn} type="submit" disabled={submitting || !ytUrl.trim()}>
                  {submitting ? 'Starting…' : 'Generate'}
                </button>
                <button type="button" className={styles.cancelBtn} onClick={resetGenerate}>Cancel</button>
                {submitError && <span className={styles.inlineError}>{submitError}</span>}
              </form>
            )}

            {generate.kind === 'running' && (
              <div className={styles.progressView}>
                <div className={styles.progressHeader}>
                  <span className={styles.progressLabel}>{generate.detail}</span>
                  <span className={styles.progressPct}>{generate.pct}%</span>
                </div>
                <div className={styles.progressTrack}>
                  <div className={styles.progressBar} style={{ width: `${generate.pct}%` }} />
                </div>
                <div className={styles.stages}>
                  {STAGES.map(s => {
                    const currentIdx = STAGES.indexOf(generate.stage as typeof STAGES[number])
                    const thisIdx = STAGES.indexOf(s)
                    const done = thisIdx < currentIdx
                    const active = thisIdx === currentIdx
                    return (
                      <span
                        key={s}
                        className={`${styles.stageChip} ${done ? styles.stageDone : ''} ${active ? styles.stageActive : ''}`}
                      >
                        {done ? '✓' : active ? '⟳' : '○'} {STAGE_LABELS[s]}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {generate.kind === 'done' && (
              <div className={styles.doneView}>
                <span className={styles.doneIcon}>✓</span>
                <span className={styles.doneText}>Transcript ready!</span>
                <button
                  className={styles.newBtn}
                  onClick={() => handleOpen(generate.transcriptId)}
                  disabled={opening === generate.transcriptId}
                >
                  {opening === generate.transcriptId ? 'Opening…' : 'Open'}
                </button>
                <button className={styles.cancelBtn} onClick={resetGenerate}>Dismiss</button>
              </div>
            )}

            {generate.kind === 'error' && (
              <div className={styles.doneView}>
                <span className={styles.errorIcon}>✗</span>
                <span className={styles.inlineError}>{generate.message}</span>
                <button className={styles.cancelBtn} onClick={resetGenerate}>Dismiss</button>
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>Loading…</p>
          </div>
        )}

        {!loading && listError && (
          <div className={styles.errorBox}>{listError}</div>
        )}

        {/* Tag filter bar */}
        {!loading && !listError && allTags.length > 0 && (
          <div className={styles.tagFilterBar}>
            <button
              className={`${styles.tagFilterChip} ${activeTagFilter === null ? styles.tagFilterActive : ''}`}
              onClick={() => setActiveTagFilter(null)}
            >
              All
            </button>
            {allTags.map(tag => (
              <button
                key={tag.id}
                className={`${styles.tagFilterChip} ${activeTagFilter === tag.id ? styles.tagFilterActive : ''}`}
                onClick={() => setActiveTagFilter(tag.id === activeTagFilter ? null : tag.id)}
              >
                {tag.name}
              </button>
            ))}
          </div>
        )}

        {!loading && !listError && transcripts.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <EmptyIcon />
            </div>
            <p className={styles.emptyTitle}>No transcripts yet</p>
            <p className={styles.emptyText}>Upload a JSON file or generate one from a YouTube URL.</p>
          </div>
        )}

        {!loading && !listError && transcripts.length > 0 && (
          <div className={styles.grid}>
            {filteredTranscripts.map(t => (
              <TranscriptCard
                key={t.id}
                transcript={t}
                loading={opening === t.id}
                onOpen={() => handleOpen(t.id)}
                onDelete={() => setConfirmDelete({ id: t.id, title: t.title })}
                onVisibilityChange={(isPublic) =>
                  setTranscripts(prev => prev.map(x => x.id === t.id ? { ...x, isPublic } : x))
                }
                onTagsChange={(tags) =>
                  setTranscripts(prev => prev.map(x => x.id === t.id ? { ...x, tags } : x))
                }
              />
            ))}
          </div>
        )}
      </div>
      {confirmDelete && (
        <div className={styles.modalOverlay} onClick={() => !deleting && setConfirmDelete(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Delete transcript?</h3>
            <p className={styles.modalBody}>
              <strong>{confirmDelete.title}</strong> will be permanently deleted. This cannot be undone.
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.cancelDeleteBtn}
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className={styles.confirmDeleteBtn}
                onClick={handleDeleteConfirmed}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface CardProps {
  transcript: TranscriptListItem
  loading: boolean
  onOpen: () => void
  onDelete: (item: { id: string; title: string }) => void
  onVisibilityChange: (isPublic: boolean) => void
  onTagsChange: (tags: { id: string; name: string }[]) => void
}

function TranscriptCard({ transcript: t, loading, onOpen, onDelete, onVisibilityChange, onTagsChange }: CardProps) {
  const [togglingVisibility, setTogglingVisibility] = useState(false)

  const date = new Date(t.createdAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })

  async function handleToggleVisibility() {
    setTogglingVisibility(true)
    const next = !t.isPublic
    await fetch(`/api/transcripts/${t.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublic: next }),
    })
    onVisibilityChange(next)
    setTogglingVisibility(false)
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardTop}>
        <div className={styles.cardMeta}>
          <StatusBadge status={t.status} />
          {t.isPublic
            ? <span className={styles.publicBadge}>Public</span>
            : t.isOwner && <span className={styles.privateBadge}>Private</span>
          }
          {!t.isOwner && (
            <span className={styles.sharedBadge}>by {t.owner.name.split(' ')[0]}</span>
          )}
        </div>
        <h2 className={styles.cardTitle}>{t.title || 'Untitled'}</h2>
        {t.youtubeUrl && (
          <p className={styles.cardUrl}>{t.youtubeUrl}</p>
        )}
      </div>
      <TagManager
        transcriptId={t.id}
        initialTags={t.tags ?? []}
        isOwner={t.isOwner}
      />
      <div className={styles.cardBottom}>
        <span className={styles.cardDate}>{date}</span>
        <div className={styles.cardActions}>
          {t.isOwner && (
            <button
              className={styles.visibilityBtn}
              onClick={handleToggleVisibility}
              disabled={togglingVisibility}
              title={t.isPublic ? 'Make private' : 'Make public'}
            >
              {t.isPublic ? <GlobeIcon /> : <LockIcon />}
            </button>
          )}
          {t.isOwner && (
            <button className={styles.deleteBtn} onClick={() => onDelete({ id: t.id, title: t.title })} title="Delete transcript">
              <TrashIcon />
            </button>
          )}
          <button
            className={`${styles.openBtn} ${!t.hasData && t.status === 'ready' ? styles.openBtnNoData : ''}`}
            onClick={onOpen}
            disabled={t.status !== 'ready' || loading || !t.hasData}
            title={!t.hasData && t.status === 'ready' ? 'No analysis data available' : undefined}
          >
            {loading ? 'Opening…' : t.status === 'processing' ? 'Processing…' : !t.hasData ? 'No data' : 'Open'}
            {!loading && t.status === 'ready' && t.hasData && <ArrowIcon />}
          </button>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: TranscriptListItem['status'] }) {
  const labels: Record<TranscriptListItem['status'], string> = {
    ready: 'Ready',
    pending: 'Pending',
    processing: 'Processing',
    failed: 'Failed',
  }
  return <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>{labels[status]}</span>
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 10V3M8 3L5 6M8 3l3 3" />
      <path d="M2 11v1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1" />
    </svg>
  )
}

function YoutubeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8.051 1.999h.089c.822.003 4.987.033 6.11.335a2.01 2.01 0 0 1 1.415 1.42c.101.38.172.883.22 1.402l.01.104.022.26.008.104c.065.914.073 1.77.074 1.957v.075c-.001.194-.01 1.108-.082 2.06l-.008.105-.009.104c-.05.572-.124 1.14-.235 1.558a2.007 2.007 0 0 1-1.415 1.42c-1.16.312-5.569.334-6.18.335h-.142c-.309 0-1.587-.006-2.927-.052l-.17-.006-.087-.004-.171-.007-.171-.007c-1.11-.049-2.167-.128-2.654-.26a2.007 2.007 0 0 1-1.415-1.419c-.111-.417-.185-.986-.235-1.558L.09 9.82l-.008-.104A31.4 31.4 0 0 1 0 7.68v-.123c.002-.215.01-.958.064-1.778l.007-.103.003-.052.008-.104.022-.26.01-.104c.048-.519.119-1.023.22-1.402a2.007 2.007 0 0 1 1.415-1.42c.487-.13 1.544-.21 2.654-.26l.17-.007.172-.006.086-.003.171-.007A99.788 99.788 0 0 1 7.858 2h.193zM6.4 5.209v4.818l4.157-2.408L6.4 5.209z"/>
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 1.5C8 1.5 6 4 6 8s2 6.5 2 6.5M8 1.5C8 1.5 10 4 10 8s-2 6.5-2 6.5M1.5 8h13" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="7" width="10" height="7.5" rx="1.5" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-9" />
    </svg>
  )
}

function EmptyIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="8" y="6" width="32" height="36" rx="4" />
      <path d="M16 16h16M16 22h16M16 28h10" strokeLinecap="round" />
    </svg>
  )
}

function DataIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="8" cy="4" rx="6" ry="2.5" />
      <path d="M2 4v4c0 1.38 2.69 2.5 6 2.5S14 9.38 14 8V4" />
      <path d="M2 8v4c0 1.38 2.69 2.5 6 2.5S14 13.38 14 12V8" />
    </svg>
  )
}

function ExportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v7M8 10L5 7M8 10l3-3" />
      <path d="M2 11v1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1" />
    </svg>
  )
}

function ImportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 10V3M8 3L5 6M8 3l3 3" />
      <path d="M2 11v1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1" />
    </svg>
  )
}
