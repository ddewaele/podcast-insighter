import type { TranscriptAnalysis } from '../types'

export function generateMarkdown(data: TranscriptAnalysis): string {
  const { metadata, summary, quotes, insights, references } = data

  const lines: string[] = []

  // Title
  lines.push(`# ${metadata.title}`)
  lines.push('')

  // Metadata
  lines.push(`**Duration:** ${metadata.estimated_duration_minutes} minutes  `)
  lines.push(`**Speakers:** ${metadata.speakers.join(', ')}  `)
  if (metadata.date_hint) lines.push(`**Date:** ${metadata.date_hint}  `)
  if (metadata.primary_topics.length > 0) {
    lines.push(`**Topics:** ${metadata.primary_topics.join(', ')}`)
  }
  lines.push('')

  // Summary
  lines.push('## Summary')
  lines.push('')
  lines.push(`*${summary.one_liner}*`)
  lines.push('')
  lines.push(summary.executive_summary)
  lines.push('')

  // Key takeaways
  if (summary.key_takeaways.length > 0) {
    lines.push('## Key Takeaways')
    lines.push('')
    for (const takeaway of summary.key_takeaways) {
      lines.push(`- ${takeaway}`)
    }
    lines.push('')
  }

  // Top quotes (up to 5)
  const topQuotes = quotes.slice(0, 5)
  if (topQuotes.length > 0) {
    lines.push('## Notable Quotes')
    lines.push('')
    for (const quote of topQuotes) {
      lines.push(`> "${quote.text}"`)
      lines.push(`> — **${quote.speaker}**`)
      if (quote.context) lines.push(`> *${quote.context}*`)
      lines.push('')
    }
  }

  // Key insights (up to 5, prioritise high novelty)
  const sorted = [...insights].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 }
    return order[a.novelty] - order[b.novelty]
  })
  const topInsights = sorted.slice(0, 5)
  if (topInsights.length > 0) {
    lines.push('## Key Insights')
    lines.push('')
    for (const insight of topInsights) {
      lines.push(`### ${insight.claim}`)
      lines.push(`*${insight.speaker}* · novelty: ${insight.novelty}`)
      lines.push('')
      if (insight.supporting_detail) lines.push(insight.supporting_detail)
      lines.push('')
    }
  }

  // References
  if (references.length > 0) {
    lines.push('## References & Resources')
    lines.push('')
    for (const ref of references) {
      const nameLink = ref.url ? `[${ref.name}](${ref.url})` : ref.name
      lines.push(`- **${nameLink}** (${ref.type}) — ${ref.context}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

export function downloadMarkdown(data: TranscriptAnalysis): void {
  const md = generateMarkdown(data)
  const blob = new Blob([md], { type: 'text/markdown' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  const slug = data.metadata.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  a.download = `${slug || 'transcript'}.md`
  a.click()
  URL.revokeObjectURL(a.href)
}
