import { useState, useMemo } from 'react'
import type { Quote } from '../../types'
import { BookmarkButton } from '../BookmarkButton'
import styles from './QuotesTab.module.css'

interface Props {
  quotes: Quote[]
}

const ALL_TAG = '__all__'

export function QuotesTab({ quotes }: Props) {
  const [activeTag, setActiveTag] = useState(ALL_TAG)

  const allTags = useMemo(() => {
    const set = new Set<string>()
    quotes.forEach((q) => q.tags.forEach((t) => set.add(t)))
    return Array.from(set).sort()
  }, [quotes])

  const filtered = useMemo(
    () => activeTag === ALL_TAG ? quotes : quotes.filter((q) => q.tags.includes(activeTag)),
    [quotes, activeTag]
  )

  return (
    <div className={styles.container}>
      <div className={styles.filters}>
        <button
          className={`${styles.filterBtn} ${activeTag === ALL_TAG ? styles.active : ''}`}
          onClick={() => setActiveTag(ALL_TAG)}
        >
          All
          <span className={styles.count}>{quotes.length}</span>
        </button>
        {allTags.map((tag) => (
          <button
            key={tag}
            className={`${styles.filterBtn} ${activeTag === tag ? styles.active : ''}`}
            onClick={() => setActiveTag(tag)}
          >
            {tag}
            <span className={styles.count}>{quotes.filter(q => q.tags.includes(tag)).length}</span>
          </button>
        ))}
      </div>

      <div className={styles.quoteGrid}>
        {filtered.map((quote) => (
          <QuoteCard key={quote.id} quote={quote} />
        ))}
      </div>
    </div>
  )
}

function QuoteCard({ quote }: { quote: Quote }) {
  return (
    <article className={styles.card}>
      <div className={styles.quoteBar} />
      <div className={styles.cardBody}>
        <blockquote className={styles.text}>"{quote.text}"</blockquote>
        <div className={styles.footer}>
          <span className={styles.speaker}>{quote.speaker}</span>
          <div className={styles.tags}>
            {quote.tags.map((tag) => (
              <span key={tag} className={`${styles.tag} ${styles[`tag_${tag.replace(/-/g, '_')}`] || ''}`}>
                {tag}
              </span>
            ))}
          </div>
          <BookmarkButton itemType="quote" itemId={quote.id} />
        </div>
        {quote.context && (
          <p className={styles.context}>{quote.context}</p>
        )}
      </div>
    </article>
  )
}
