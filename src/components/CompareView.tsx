import { useState, useEffect } from 'react'
import type { Theme, User, TranscriptListItem } from '../types'
import type { ComparisonResult } from '../../server/routes/compare'
import { ThemeToggle } from './ThemeToggle'
import { UserMenu } from './UserMenu'
import { WaveformIconSmall } from './icons'
import styles from './CompareView.module.css'

interface Props {
  transcriptA: TranscriptListItem
  transcriptB: TranscriptListItem
  theme: Theme
  onToggleTheme: () => void
  user: User
  onLogout: () => void
  onBack: () => void
}

export function CompareView({ transcriptA, transcriptB, theme, onToggleTheme, user, onLogout, onBack }: Props) {
  const [result, setResult] = useState<ComparisonResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch('/api/transcripts/compare', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idA: transcriptA.id, idB: transcriptB.id }),
    })
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.error ?? 'Comparison failed')))
      .then(data => { setResult(data.comparison); setLoading(false) })
      .catch(err => { setError(typeof err === 'string' ? err : 'Comparison failed'); setLoading(false) })
  }, [transcriptA.id, transcriptB.id])

  return (
    <div className={styles.layout}>
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

      <div className={styles.subHeader}>
        <button className={styles.backBtn} onClick={onBack}>
          <BackIcon /> Back
        </button>
        <div className={styles.subjectsRow}>
          <span className={styles.subjectLabel}>
            <span className={styles.pill}>A</span>
            {transcriptA.title}
          </span>
          <VsIcon />
          <span className={styles.subjectLabel}>
            <span className={styles.pillB}>B</span>
            {transcriptB.title}
          </span>
        </div>
      </div>

      <main className={styles.content}>
        {loading && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Analyzing both transcripts with Claude…</p>
          </div>
        )}

        {error && (
          <div className={styles.errorBox}>{error}</div>
        )}

        {result && (
          <div className={styles.sections}>
            {/* Verdict */}
            <section className={styles.verdict}>
              <p className={styles.verdictText}>{result.verdict}</p>
            </section>

            {/* Two-column: shared topics vs exclusive */}
            <div className={styles.topicGrid}>
              <section className={styles.card}>
                <h3 className={styles.cardTitle}>
                  <SharedIcon /> Shared Topics
                  <span className={styles.count}>{result.shared_topics.length}</span>
                </h3>
                {result.shared_topics.length === 0
                  ? <p className={styles.empty}>None found</p>
                  : <ul className={styles.list}>{result.shared_topics.map((t, i) => <li key={i}>{t}</li>)}</ul>
                }
              </section>

              <div className={styles.exclusiveCol}>
                <section className={styles.card}>
                  <h3 className={styles.cardTitle}>
                    <span className={styles.pillSm}>A</span> Only in A
                    <span className={styles.count}>{result.only_in_a.length}</span>
                  </h3>
                  {result.only_in_a.length === 0
                    ? <p className={styles.empty}>None</p>
                    : <ul className={styles.list}>{result.only_in_a.map((t, i) => <li key={i}>{t}</li>)}</ul>
                  }
                </section>
                <section className={styles.card}>
                  <h3 className={styles.cardTitle}>
                    <span className={styles.pillSmB}>B</span> Only in B
                    <span className={styles.count}>{result.only_in_b.length}</span>
                  </h3>
                  {result.only_in_b.length === 0
                    ? <p className={styles.empty}>None</p>
                    : <ul className={styles.list}>{result.only_in_b.map((t, i) => <li key={i}>{t}</li>)}</ul>
                  }
                </section>
              </div>
            </div>

            {/* Agreements */}
            {result.agreements.length > 0 && (
              <section className={styles.card}>
                <h3 className={styles.cardTitle}>
                  <AgreementIcon /> Agreements
                  <span className={styles.count}>{result.agreements.length}</span>
                </h3>
                <div className={styles.itemList}>
                  {result.agreements.map((a, i) => (
                    <div key={i} className={styles.item}>
                      <strong className={styles.itemTopic}>{a.topic}</strong>
                      <p className={styles.itemBody}>{a.summary}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Contradictions */}
            {result.contradictions.length > 0 && (
              <section className={styles.card}>
                <h3 className={styles.cardTitle}>
                  <ContradictionIcon /> Contradictions
                  <span className={styles.count}>{result.contradictions.length}</span>
                </h3>
                <div className={styles.itemList}>
                  {result.contradictions.map((c, i) => (
                    <div key={i} className={styles.item}>
                      <strong className={styles.itemTopic}>{c.topic}</strong>
                      <div className={styles.positionGrid}>
                        <div className={styles.positionA}>
                          <span className={styles.pillSm}>A</span>
                          <p>{c.position_a}</p>
                        </div>
                        <div className={styles.positionB}>
                          <span className={styles.pillSmB}>B</span>
                          <p>{c.position_b}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Shared References */}
            {result.shared_references.length > 0 && (
              <section className={styles.card}>
                <h3 className={styles.cardTitle}>
                  <ReferenceIcon /> Shared References
                  <span className={styles.count}>{result.shared_references.length}</span>
                </h3>
                <div className={styles.itemList}>
                  {result.shared_references.map((r, i) => (
                    <div key={i} className={styles.item}>
                      <strong className={styles.itemTopic}>{r.name}</strong>
                      <div className={styles.positionGrid}>
                        <div className={styles.positionA}>
                          <span className={styles.pillSm}>A</span>
                          <p>{r.context_a}</p>
                        </div>
                        <div className={styles.positionB}>
                          <span className={styles.pillSmB}>B</span>
                          <p>{r.context_b}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 4L6 8l4 4" />
    </svg>
  )
}

function VsIcon() {
  return <span className={styles.vs}>vs</span>
}

function SharedIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="8" r="4.5" />
      <circle cx="10" cy="8" r="4.5" />
    </svg>
  )
}

function AgreementIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 8l4 4 8-8" />
    </svg>
  )
}

function ContradictionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

function ReferenceIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2h5l4 4v8H4z" />
      <path d="M9 2v4h4" />
    </svg>
  )
}
