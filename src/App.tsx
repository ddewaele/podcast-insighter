import { useState, useCallback, DragEvent } from 'react'
import type { TranscriptAnalysis } from './types'
import { DropZone } from './components/DropZone'
import { Dashboard } from './components/Dashboard'

export default function App() {
  const [data, setData] = useState<TranscriptAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)

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
    return <Dashboard data={data} onReset={handleReset} />
  }

  return <DropZone onDrop={handleDrop} onFile={handleFile} error={error} />
}
