import type { TranscriptAnalysis } from '../../types'
import styles from './OverviewTab.module.css'

interface Props {
  data: TranscriptAnalysis
}

export function OverviewTab({ data }: Props) {
  const { metadata, summary } = data

  return (
    <div className={styles.grid}>
      {/* One-liner */}
      <div className={styles.oneLiner}>
        <p>{summary.one_liner}</p>
      </div>

      {/* Primary topics */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Primary Topics</h2>
        <div className={styles.topicList}>
          {metadata.primary_topics.map((topic) => (
            <span key={topic} className={styles.topic}>{topic}</span>
          ))}
        </div>
      </section>

      {/* Executive summary */}
      <section className={`${styles.card} ${styles.fullWidth}`}>
        <h2 className={styles.cardTitle}>Executive Summary</h2>
        <div className={styles.summaryText}>
          {summary.executive_summary.split('\n\n').map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </section>

      {/* Key takeaways */}
      <section className={`${styles.card} ${styles.fullWidth}`}>
        <h2 className={styles.cardTitle}>
          Key Takeaways
          <span className={styles.count}>{summary.key_takeaways.length}</span>
        </h2>
        <ol className={styles.takeawayList}>
          {summary.key_takeaways.map((item, i) => (
            <li key={i} className={styles.takeaway}>
              <span className={styles.takeawayNum}>{i + 1}</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
