import type { Disagreement } from '../../types'
import styles from './DisagreementsTab.module.css'

interface Props {
  disagreements: Disagreement[]
}

export function DisagreementsTab({ disagreements }: Props) {
  return (
    <div className={styles.list}>
      {disagreements.map((d, i) => (
        <DebateCard key={i} debate={d} index={i} />
      ))}
    </div>
  )
}

function DebateCard({ debate, index }: { debate: Disagreement; index: number }) {
  const isResolved = !debate.resolution.toLowerCase().includes('unresolved') &&
    !debate.resolution.toLowerCase().includes('open question')

  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.debateNum}>#{index + 1}</span>
        <h3 className={styles.topic}>{debate.topic}</h3>
        <span className={`${styles.statusBadge} ${isResolved ? styles.resolved : styles.open}`}>
          {isResolved ? 'Resolved' : 'Open'}
        </span>
      </div>

      <div className={styles.positions}>
        {debate.positions.map((pos, i) => (
          <div key={i} className={`${styles.position} ${i === 0 ? styles.posA : styles.posB}`}>
            <span className={styles.speakerLabel}>{pos.speaker}</span>
            <p className={styles.positionText}>{pos.position}</p>
          </div>
        ))}
      </div>

      <div className={styles.resolution}>
        <div className={styles.resolutionIcon}>
          {isResolved ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
              <path d="M5.255 5.786a.237.237 0 0 0 .241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286zm1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94z" />
            </svg>
          )}
        </div>
        <p className={styles.resolutionText}>{debate.resolution}</p>
      </div>
    </article>
  )
}
