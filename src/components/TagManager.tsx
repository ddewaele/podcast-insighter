import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import styles from './TagManager.module.css'

interface Tag { id: string; name: string }

interface Props {
  transcriptId: string
  initialTags: Tag[]
  isOwner: boolean
}

export function TagManager({ transcriptId, initialTags, isOwner }: Props) {
  const [tags, setTags] = useState<Tag[]>(initialTags)
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<Tag[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // Load user's tag library when entering edit mode
  useEffect(() => {
    if (!editing || !isOwner) return
    fetch('/api/tags', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setAllTags)
  }, [editing, isOwner])

  useEffect(() => {
    if (!inputValue) { setSuggestions([]); return }
    const lower = inputValue.toLowerCase()
    setSuggestions(
      allTags.filter(t => t.name.toLowerCase().includes(lower) && !tags.some(existing => existing.id === t.id))
    )
  }, [inputValue, allTags, tags])

  async function addTag(name: string) {
    const trimmed = name.trim()
    if (!trimmed || tags.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) return

    // Create tag if it doesn't exist
    const res = await fetch('/api/tags', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    if (!res.ok) return
    const tag: Tag = await res.json()

    const newTags = [...tags, tag]
    setTags(newTags)
    setInputValue('')
    setSuggestions([])
    await saveTags(newTags)
  }

  async function removeTag(tagId: string) {
    const newTags = tags.filter(t => t.id !== tagId)
    setTags(newTags)
    await saveTags(newTags)
  }

  async function saveTags(tagList: Tag[]) {
    await fetch(`/api/transcripts/${transcriptId}/tags`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagIds: tagList.map(t => t.id) }),
    })
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault()
      addTag(inputValue)
    } else if (e.key === 'Escape') {
      setEditing(false)
      setInputValue('')
      setSuggestions([])
    }
  }

  if (!isOwner && tags.length === 0) return null

  return (
    <div className={styles.root} onClick={e => e.stopPropagation()}>
      <div className={styles.chips}>
        {tags.map(tag => (
          <span key={tag.id} className={styles.tag}>
            {tag.name}
            {isOwner && (
              <button className={styles.removeBtn} onClick={() => removeTag(tag.id)} title="Remove tag">×</button>
            )}
          </span>
        ))}
        {isOwner && !editing && (
          <button className={styles.addBtn} onClick={() => { setEditing(true); setTimeout(() => inputRef.current?.focus(), 0) }}>
            + tag
          </button>
        )}
      </div>

      {editing && isOwner && (
        <div className={styles.inputWrap}>
          <input
            ref={inputRef}
            className={styles.tagInput}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => { setTimeout(() => { setEditing(false); setInputValue(''); setSuggestions([]) }, 150) }}
            placeholder="Add tag…"
          />
          {suggestions.length > 0 && (
            <div className={styles.suggestions}>
              {suggestions.map(s => (
                <button key={s.id} className={styles.suggestion} onMouseDown={() => addTag(s.name)}>
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
