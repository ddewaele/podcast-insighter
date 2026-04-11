import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface BookmarkItem {
  id: string
  itemType: string
  itemId: string
}

interface BookmarksContextValue {
  isBookmarked: (itemType: string, itemId: string) => boolean
  toggle: (itemType: string, itemId: string) => void
}

const BookmarksContext = createContext<BookmarksContextValue>({
  isBookmarked: () => false,
  toggle: () => {},
})

export function useBookmarks() {
  return useContext(BookmarksContext)
}

interface Props {
  transcriptId: string | null
  children: ReactNode
}

export function BookmarksProvider({ transcriptId, children }: Props) {
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])

  useEffect(() => {
    if (!transcriptId) return
    fetch(`/api/transcripts/${transcriptId}/bookmarks`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setBookmarks)
  }, [transcriptId])

  function isBookmarked(itemType: string, itemId: string) {
    return bookmarks.some(b => b.itemType === itemType && b.itemId === itemId)
  }

  async function toggle(itemType: string, itemId: string) {
    const existing = bookmarks.find(b => b.itemType === itemType && b.itemId === itemId)
    if (existing) {
      await fetch(`/api/bookmarks/${existing.id}`, { method: 'DELETE', credentials: 'include' })
      setBookmarks(prev => prev.filter(b => b.id !== existing.id))
    } else {
      const res = await fetch('/api/bookmarks', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcriptId, itemType, itemId }),
      })
      if (res.ok) {
        const bm: BookmarkItem = await res.json()
        setBookmarks(prev => [...prev, bm])
      }
    }
  }

  return (
    <BookmarksContext.Provider value={{ isBookmarked, toggle }}>
      {children}
    </BookmarksContext.Provider>
  )
}
