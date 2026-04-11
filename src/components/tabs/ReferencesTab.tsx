import { useState, useMemo } from 'react'
import type { Reference } from '../../types'
import { BookmarkButton } from '../BookmarkButton'
import styles from './ReferencesTab.module.css'

interface Props {
  references: Reference[]
}

const TYPE_ICONS: Record<string, string> = {
  tool: '🔧',
  project: '📦',
  company: '🏢',
  person: '👤',
  concept: '💡',
  paper: '📄',
  'blog-post': '✍️',
}

const ALL = '__all__'

export function ReferencesTab({ references }: Props) {
  const [typeFilter, setTypeFilter] = useState(ALL)

  const types = useMemo(() => {
    const counts: Record<string, number> = {}
    references.forEach((r) => {
      counts[r.type] = (counts[r.type] || 0) + 1
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [references])

  const filtered = useMemo(
    () => typeFilter === ALL ? references : references.filter((r) => r.type === typeFilter),
    [references, typeFilter]
  )

  // Group by type for the all view
  const grouped = useMemo(() => {
    if (typeFilter !== ALL) return null
    const map: Record<string, Reference[]> = {}
    filtered.forEach((r) => {
      if (!map[r.type]) map[r.type] = []
      map[r.type].push(r)
    })
    return map
  }, [filtered, typeFilter])

  return (
    <div className={styles.container}>
      <div className={styles.filters}>
        <button
          className={`${styles.filterBtn} ${typeFilter === ALL ? styles.active : ''}`}
          onClick={() => setTypeFilter(ALL)}
        >
          All
          <span className={styles.count}>{references.length}</span>
        </button>
        {types.map(([type, count]) => (
          <button
            key={type}
            className={`${styles.filterBtn} ${typeFilter === type ? styles.active : ''}`}
            onClick={() => setTypeFilter(type)}
          >
            {TYPE_ICONS[type] || '•'} {type}
            <span className={styles.count}>{count}</span>
          </button>
        ))}
      </div>

      {grouped ? (
        <div className={styles.grouped}>
          {Object.entries(grouped).map(([type, refs]) => (
            <section key={type}>
              <h3 className={styles.groupTitle}>
                {TYPE_ICONS[type] || '•'} {type}
                <span className={styles.groupCount}>{refs.length}</span>
              </h3>
              <div className={styles.refGrid}>
                {refs.map((ref) => <RefCard key={ref.id} reference={ref} />)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className={styles.refGrid}>
          {filtered.map((ref) => <RefCard key={ref.id} reference={ref} />)}
        </div>
      )}
    </div>
  )
}

function RefCard({ reference }: { reference: Reference }) {
  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.typeIcon}>{TYPE_ICONS[reference.type] || '•'}</span>
        <div className={styles.nameRow}>
          {reference.url ? (
            <a href={reference.url} target="_blank" rel="noopener noreferrer" className={styles.name}>
              {reference.name}
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.5 }}>
                <path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z" />
                <path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z" />
              </svg>
            </a>
          ) : (
            <span className={styles.name}>{reference.name}</span>
          )}
          <span className={styles.typeBadge}>{reference.type}</span>
        </div>
      </div>
      <p className={styles.context}>{reference.context}</p>
      <div className={styles.cardFooter}>
        <span className={styles.mentionedBy}>Mentioned by {reference.mentioned_by}</span>
        <BookmarkButton itemType="reference" itemId={reference.id} />
      </div>
    </article>
  )
}
