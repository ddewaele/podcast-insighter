import { useState, useRef, DragEvent, ChangeEvent } from 'react'
import styles from './DropZone.module.css'

interface Props {
  onDrop: (e: DragEvent<HTMLDivElement>) => void
  onFile: (file: File) => void
  error: string | null
}

export function DropZone({ onDrop, onFile, error }: Props) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(true)
  }

  const handleDragLeave = () => setDragging(false)

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    setDragging(false)
    onDrop(e)
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFile(file)
  }

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.logoMark}>
          <WaveformIcon />
        </div>
        <h1 className={styles.title}>Transcript Viewer</h1>
        <p className={styles.subtitle}>
          Drop a transcript analysis JSON to explore your podcast insights
        </p>

        <div
          className={`${styles.dropZone} ${dragging ? styles.dragging : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleChange}
            style={{ display: 'none' }}
          />
          <div className={styles.dropIcon}>
            <DropIcon />
          </div>
          <p className={styles.dropText}>
            {dragging ? 'Release to load' : 'Drop your JSON file here'}
          </p>
          <p className={styles.dropHint}>or click to browse</p>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.features}>
          {[
            { icon: '🎙', label: 'Speaker insights' },
            { icon: '💬', label: 'Filterable quotes' },
            { icon: '🔍', label: 'Key insights' },
            { icon: '⚡', label: 'Topic timeline' },
          ].map(({ icon, label }) => (
            <div key={label} className={styles.feature}>
              <span>{icon}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function WaveformIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <rect x="4" y="20" width="4" height="8" rx="2" fill="#818cf8" />
      <rect x="12" y="14" width="4" height="20" rx="2" fill="#818cf8" />
      <rect x="20" y="8" width="4" height="32" rx="2" fill="#6366f1" />
      <rect x="28" y="14" width="4" height="20" rx="2" fill="#818cf8" />
      <rect x="36" y="18" width="4" height="12" rx="2" fill="#818cf8" />
    </svg>
  )
}

function DropIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M20 26V14M20 14L15 19M20 14L25 19" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 28C5.8 26.4 4 23.9 4 21C4 16.6 7.6 13 12 13C12.3 13 12.6 13 12.9 13.1C14.1 9.5 17.7 7 22 7C27.5 7 32 11.5 32 17C32 17.3 32 17.7 31.9 18C34.2 18.8 36 21.1 36 24C36 27.3 33.3 30 30 30H8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
