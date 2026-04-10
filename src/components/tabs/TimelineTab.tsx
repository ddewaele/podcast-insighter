import type { TopicSegment, TopicPosition } from '../../types'
import styles from './TimelineTab.module.css'

interface Props {
  segments: TopicSegment[]
}

const POSITION_LABEL: Record<TopicPosition, string> = {
  'early': 'Early',
  'early-mid': 'Early–Mid',
  'mid': 'Mid',
  'mid-late': 'Mid–Late',
  'late': 'Late',
}

const POSITION_ORDER: TopicPosition[] = ['early', 'early-mid', 'mid', 'mid-late', 'late']

export function TimelineTab({ segments }: Props) {
  // Sort segments by position order
  const sorted = [...segments].sort(
    (a, b) => POSITION_ORDER.indexOf(a.approximate_position) - POSITION_ORDER.indexOf(b.approximate_position)
  )

  return (
    <div className={styles.container}>
      <div className={styles.progressBar}>
        {POSITION_ORDER.map((pos) => {
          const count = segments.filter((s) => s.approximate_position === pos).length
          return (
            <div key={pos} className={styles.progressSegment} style={{ flex: Math.max(count, 1) }}>
              <div className={styles.progressFill} />
              <span className={styles.progressLabel}>{POSITION_LABEL[pos]}</span>
            </div>
          )
        })}
      </div>

      <div className={styles.timeline}>
        {sorted.map((segment, i) => (
          <TimelineSegment key={i} segment={segment} index={i} total={sorted.length} />
        ))}
      </div>
    </div>
  )
}

function TimelineSegment({ segment, index, total }: { segment: TopicSegment; index: number; total: number }) {
  const isLast = index === total - 1

  return (
    <div className={styles.segment}>
      <div className={styles.rail}>
        <div className={styles.dot} />
        {!isLast && <div className={styles.line} />}
      </div>
      <div className={styles.content}>
        <div className={styles.positionBadge}>
          {POSITION_LABEL[segment.approximate_position]}
        </div>
        <h3 className={styles.topic}>{segment.topic}</h3>
        <p className={styles.summary}>{segment.summary}</p>
      </div>
    </div>
  )
}
