import { useBookmarks } from './BookmarksContext'
import styles from './BookmarkButton.module.css'

interface Props {
  itemType: 'quote' | 'insight' | 'reference'
  itemId: string
}

export function BookmarkButton({ itemType, itemId }: Props) {
  const { isBookmarked, toggle } = useBookmarks()
  const saved = isBookmarked(itemType, itemId)

  return (
    <button
      className={`${styles.btn} ${saved ? styles.active : ''}`}
      onClick={e => { e.stopPropagation(); toggle(itemType, itemId) }}
      title={saved ? 'Remove bookmark' : 'Save bookmark'}
    >
      <BookmarkIcon filled={saved} />
    </button>
  )
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2h10a1 1 0 0 1 1 1v11l-6-3.5L2 14V3a1 1 0 0 1 1-1z" />
    </svg>
  )
}
