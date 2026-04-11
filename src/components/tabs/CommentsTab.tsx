import { useState, useEffect, FormEvent } from 'react'
import type { User } from '../../types'
import styles from './CommentsTab.module.css'

interface Author {
  id: string
  name: string
  avatarUrl: string | null
}

interface Comment {
  id: string
  userId: string
  body: string
  createdAt: string
  author: Author
  replies: Comment[]
}

interface Props {
  transcriptId: string | null
  user: User
}

export function CommentsTab({ transcriptId, user }: Props) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(false)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!transcriptId) return
    setLoading(true)
    fetch(`/api/transcripts/${transcriptId}/comments`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((data: Comment[]) => { setComments(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [transcriptId])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!body.trim() || !transcriptId) return
    setSubmitting(true)
    const res = await fetch(`/api/transcripts/${transcriptId}/comments`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: body.trim() }),
    })
    setSubmitting(false)
    if (!res.ok) return
    const comment: Comment = await res.json()
    setComments(prev => [...prev, comment])
    setBody('')
  }

  async function handleDelete(commentId: string, parentId?: string) {
    await fetch(`/api/comments/${commentId}`, { method: 'DELETE', credentials: 'include' })
    if (parentId) {
      setComments(prev => prev.map(c =>
        c.id === parentId ? { ...c, replies: c.replies.filter(r => r.id !== commentId) } : c
      ))
    } else {
      setComments(prev => prev.filter(c => c.id !== commentId))
    }
  }

  async function handleReply(parentId: string, replyBody: string) {
    if (!transcriptId) return
    const res = await fetch(`/api/transcripts/${transcriptId}/comments`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: replyBody.trim(), parentId }),
    })
    if (!res.ok) return
    const reply: Comment = await res.json()
    setComments(prev => prev.map(c =>
      c.id === parentId ? { ...c, replies: [...c.replies, reply] } : c
    ))
  }

  if (!transcriptId) {
    return <div className={styles.empty}>Comments are available when a transcript is saved.</div>
  }

  return (
    <div className={styles.container}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <textarea
          className={styles.textarea}
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Add a comment…"
          rows={3}
        />
        <button className={styles.submitBtn} type="submit" disabled={submitting || !body.trim()}>
          {submitting ? 'Posting…' : 'Post comment'}
        </button>
      </form>

      {loading && <div className={styles.empty}>Loading comments…</div>}

      {!loading && comments.length === 0 && (
        <div className={styles.empty}>No comments yet. Be the first to share your thoughts!</div>
      )}

      <div className={styles.list}>
        {comments.map(comment => (
          <CommentCard
            key={comment.id}
            comment={comment}
            currentUserId={user.id}
            onDelete={(id) => handleDelete(id)}
            onReply={(replyBody) => handleReply(comment.id, replyBody)}
            onDeleteReply={(replyId) => handleDelete(replyId, comment.id)}
          />
        ))}
      </div>
    </div>
  )
}

interface CardProps {
  comment: Comment
  currentUserId: string
  onDelete: (id: string) => void
  onReply: (body: string) => void
  onDeleteReply: (replyId: string) => void
}

function CommentCard({ comment, currentUserId, onDelete, onReply, onDeleteReply }: CardProps) {
  const [showReply, setShowReply] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const date = new Date(comment.createdAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  async function handleReplySubmit(e: FormEvent) {
    e.preventDefault()
    if (!replyBody.trim()) return
    setSubmitting(true)
    await onReply(replyBody)
    setSubmitting(false)
    setReplyBody('')
    setShowReply(false)
  }

  return (
    <div className={styles.comment}>
      <div className={styles.commentHeader}>
        <div className={styles.avatar}>
          {comment.author.avatarUrl
            ? <img src={comment.author.avatarUrl} alt={comment.author.name} className={styles.avatarImg} />
            : <span className={styles.avatarInitial}>{comment.author.name[0]}</span>
          }
        </div>
        <div className={styles.commentMeta}>
          <span className={styles.authorName}>{comment.author.name}</span>
          <span className={styles.commentDate}>{date}</span>
        </div>
        {comment.userId === currentUserId && (
          <button className={styles.deleteCommentBtn} onClick={() => onDelete(comment.id)} title="Delete">×</button>
        )}
      </div>
      <p className={styles.commentBody}>{comment.body}</p>
      <div className={styles.commentActions}>
        <button className={styles.replyBtn} onClick={() => setShowReply(v => !v)}>Reply</button>
      </div>

      {showReply && (
        <form className={styles.replyForm} onSubmit={handleReplySubmit}>
          <textarea
            className={styles.replyTextarea}
            value={replyBody}
            onChange={e => setReplyBody(e.target.value)}
            placeholder="Write a reply…"
            rows={2}
            autoFocus
          />
          <div className={styles.replyFormActions}>
            <button className={styles.submitBtn} type="submit" disabled={submitting || !replyBody.trim()}>
              {submitting ? 'Posting…' : 'Reply'}
            </button>
            <button type="button" className={styles.cancelReplyBtn} onClick={() => { setShowReply(false); setReplyBody('') }}>Cancel</button>
          </div>
        </form>
      )}

      {comment.replies.length > 0 && (
        <div className={styles.replies}>
          {comment.replies.map(reply => (
            <div key={reply.id} className={styles.reply}>
              <div className={styles.commentHeader}>
                <div className={styles.avatar}>
                  {reply.author.avatarUrl
                    ? <img src={reply.author.avatarUrl} alt={reply.author.name} className={styles.avatarImg} />
                    : <span className={styles.avatarInitial}>{reply.author.name[0]}</span>
                  }
                </div>
                <div className={styles.commentMeta}>
                  <span className={styles.authorName}>{reply.author.name}</span>
                  <span className={styles.commentDate}>{new Date(reply.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
                {reply.userId === currentUserId && (
                  <button className={styles.deleteCommentBtn} onClick={() => onDeleteReply(reply.id)} title="Delete">×</button>
                )}
              </div>
              <p className={styles.commentBody}>{reply.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
