import { useState, useMemo } from 'react'
import type { Insight } from '../../types'
import styles from './InsightsTab.module.css'

interface Props {
  insights: Insight[]
}

const ALL = '__all__'
const NOVELTY_LABELS: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' }
const NOVELTY_ORDER = ['high', 'medium', 'low']

export function InsightsTab({ insights }: Props) {
  const [noveltyFilter, setNoveltyFilter] = useState(ALL)
  const [tagFilter, setTagFilter] = useState(ALL)

  const allTags = useMemo(() => {
    const set = new Set<string>()
    insights.forEach((i) => i.tags.forEach((t) => set.add(t)))
    return Array.from(set).sort()
  }, [insights])

  const filtered = useMemo(() => {
    return insights.filter((i) => {
      const matchNovelty = noveltyFilter === ALL || i.novelty === noveltyFilter
      const matchTag = tagFilter === ALL || i.tags.includes(tagFilter)
      return matchNovelty && matchTag
    })
  }, [insights, noveltyFilter, tagFilter])

  return (
    <div className={styles.container}>
      <div className={styles.filterRow}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Novelty</span>
          <div className={styles.filters}>
            <button
              className={`${styles.filterBtn} ${noveltyFilter === ALL ? styles.active : ''}`}
              onClick={() => setNoveltyFilter(ALL)}
            >
              All
            </button>
            {NOVELTY_ORDER.map((n) => (
              <button
                key={n}
                className={`${styles.filterBtn} ${noveltyFilter === n ? styles.active : ''} ${styles[`novelty_${n}`]}`}
                onClick={() => setNoveltyFilter(n)}
              >
                {NOVELTY_LABELS[n]}
                <span className={styles.count}>{insights.filter(i => i.novelty === n).length}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Tag</span>
          <div className={styles.filters}>
            <button
              className={`${styles.filterBtn} ${tagFilter === ALL ? styles.active : ''}`}
              onClick={() => setTagFilter(ALL)}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                className={`${styles.filterBtn} ${tagFilter === tag ? styles.active : ''}`}
                onClick={() => setTagFilter(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.list}>
        {filtered.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
        {filtered.length === 0 && (
          <div className={styles.empty}>No insights match the current filters.</div>
        )}
      </div>
    </div>
  )
}

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <NoveltyBadge novelty={insight.novelty} />
        <div className={styles.tags}>
          {insight.tags.map((tag) => (
            <span key={tag} className={styles.tag}>{tag}</span>
          ))}
        </div>
      </div>
      <p className={styles.claim}>{insight.claim}</p>
      <p className={styles.detail}>{insight.supporting_detail}</p>
      <span className={styles.speaker}>{insight.speaker}</span>
    </article>
  )
}

function NoveltyBadge({ novelty }: { novelty: string }) {
  return (
    <span className={`${styles.noveltyBadge} ${styles[`novelty_${novelty}`]}`}>
      {novelty === 'high' && '★★★'}
      {novelty === 'medium' && '★★'}
      {novelty === 'low' && '★'}
      {' '}{NOVELTY_LABELS[novelty]} novelty
    </span>
  )
}
