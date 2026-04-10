import { useState, useCallback, useEffect, DragEvent } from 'react'
import type { Theme, TranscriptAnalysis } from './types'
import { DropZone } from './components/DropZone'
import { Dashboard } from './components/Dashboard'

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('theme') as Theme | null
  const theme = stored === 'dark' || stored === 'light'
    ? stored
    : window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  // Set synchronously so the CSS transition doesn't fire on first paint
  document.documentElement.setAttribute('data-theme', theme)
  return theme
}

export default function App() {
  const [data, setData] = useState<TranscriptAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark')
  }, [])

  const handleFile = useCallback((file: File) => {
    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string)
        setData(parsed as TranscriptAnalysis)
      } catch {
        setError('Invalid JSON file. Please drop a valid transcript analysis file.')
      }
    }
    reader.readAsText(file)
  }, [])

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file?.type === 'application/json' || file?.name.endsWith('.json')) {
      handleFile(file)
    } else {
      setError('Please drop a JSON file.')
    }
  }, [handleFile])

  const handleReset = useCallback(() => {
    setData(null)
    setError(null)
  }, [])

  if (data) {
    return <Dashboard data={data} onReset={handleReset} theme={theme} onToggleTheme={toggleTheme} />
  }

  return <DropZone onDrop={handleDrop} onFile={handleFile} error={error} theme={theme} onToggleTheme={toggleTheme} />
}
