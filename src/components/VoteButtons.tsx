import { useState, useEffect } from 'react'
import styles from './VoteButtons.module.css'

interface Props {
  transcriptId: string
}

export function VoteButtons({ transcriptId }: Props) {
  const [upvotes, setUpvotes] = useState(0)
  const [downvotes, setDownvotes] = useState(0)
  const [userVote, setUserVote] = useState<1 | -1 | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`/api/transcripts/${transcriptId}/vote`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        setUpvotes(data.upvotes)
        setDownvotes(data.downvotes)
        setUserVote(data.userVote)
      })
  }, [transcriptId])

  async function castVote(value: 1 | -1) {
    if (loading) return
    // Toggle off if already voted the same
    const newValue = userVote === value ? 0 : value
    setLoading(true)
    const res = await fetch(`/api/transcripts/${transcriptId}/vote`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: newValue }),
    })
    setLoading(false)
    if (!res.ok) return
    const data = await res.json()
    setUpvotes(data.upvotes)
    setDownvotes(data.downvotes)
    setUserVote(data.userVote)
  }

  return (
    <div className={styles.root} onClick={e => e.stopPropagation()}>
      <button
        className={`${styles.btn} ${userVote === 1 ? styles.upActive : ''}`}
        onClick={() => castVote(1)}
        disabled={loading}
        title="Upvote"
      >
        <UpvoteIcon />
        <span className={styles.count}>{upvotes}</span>
      </button>
      <button
        className={`${styles.btn} ${userVote === -1 ? styles.downActive : ''}`}
        onClick={() => castVote(-1)}
        disabled={loading}
        title="Downvote"
      >
        <DownvoteIcon />
        <span className={styles.count}>{downvotes}</span>
      </button>
    </div>
  )
}

function UpvoteIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 12V4M4 8l4-4 4 4" />
    </svg>
  )
}

function DownvoteIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 4v8M12 8l-4 4-4-4" />
    </svg>
  )
}
