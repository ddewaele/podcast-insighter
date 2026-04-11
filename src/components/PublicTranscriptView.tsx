import { useState } from 'react'
import type { Theme, TranscriptAnalysis } from '../types'
import { ThemeToggle } from './ThemeToggle'
import { OverviewTab } from './tabs/OverviewTab'
import { QuotesTab } from './tabs/QuotesTab'
import { InsightsTab } from './tabs/InsightsTab'
import { ReferencesTab } from './tabs/ReferencesTab'
import { DisagreementsTab } from './tabs/DisagreementsTab'
import { TimelineTab } from './tabs/TimelineTab'
import { WaveformIconSmall } from './icons'
import styles from './Dashboard.module.css'
import headerStyles from './Header.module.css'

type Tab = 'overview' | 'timeline' | 'quotes' | 'insights' | 'references' | 'disagreements'

const TABS: { id: Tab; label: string; count?: (d: TranscriptAnalysis) => number }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'timeline', label: 'Timeline', count: (d) => d.topic_segments.length },
  { id: 'quotes', label: 'Quotes', count: (d) => d.quotes.length },
  { id: 'insights', label: 'Insights', count: (d) => d.insights.length },
  { id: 'references', label: 'References', count: (d) => d.references.length },
  { id: 'disagreements', label: 'Debates', count: (d) => d.disagreements_and_nuance.length },
]

interface Props {
  data: TranscriptAnalysis
  theme: Theme
  onToggleTheme: () => void
}

export function PublicTranscriptView({ data, theme, onToggleTheme }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const { metadata } = data

  return (
    <div className={styles.layout}>
      {/* Public header — no user actions, just branding + theme toggle */}
      <header className={headerStyles.header}>
        <div className={headerStyles.inner}>
          <div className={headerStyles.meta}>
            <div className={headerStyles.titleRow}>
              <div className={headerStyles.waveIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <rect x="2" y="10" width="2.5" height="4" rx="1.25" fill="#818cf8" />
                  <rect x="6.5" y="7" width="2.5" height="10" rx="1.25" fill="#818cf8" />
                  <rect x="11" y="4" width="2.5" height="16" rx="1.25" fill="#6366f1" />
                  <rect x="15.5" y="7" width="2.5" height="10" rx="1.25" fill="#818cf8" />
                  <rect x="20" y="9" width="2.5" height="6" rx="1.25" fill="#818cf8" />
                </svg>
              </div>
              <h1 className={headerStyles.title}>{metadata.title}</h1>
            </div>
            <div className={headerStyles.chips}>
              <span className={headerStyles.chip}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm7.5-3.5a.5.5 0 0 1 .5.5v3.793l2.146 2.147a.5.5 0 0 1-.708.708l-2.5-2.5A.5.5 0 0 1 6.5 9V5a.5.5 0 0 1 .5-.5z" />
                </svg>
                {metadata.estimated_duration_minutes} min
              </span>
              <span className={headerStyles.chip}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1H3zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                </svg>
                {metadata.speakers.length} speakers
              </span>
              <span className={headerStyles.chip}>{metadata.date_hint}</span>
            </div>
            <div className={headerStyles.speakers}>
              {metadata.speakers.map((s) => (
                <span key={s} className={headerStyles.speaker}>{s}</span>
              ))}
            </div>
          </div>

          <div className={headerStyles.actions}>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <div className={headerStyles.divider} />
            <a href="/auth/google" className={headerStyles.resetBtn}>
              <WaveformIconSmall />
              Sign in
            </a>
          </div>
        </div>
      </header>

      <div className={styles.tabBar}>
        <div className={styles.tabList}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              {tab.count && (
                <span className={styles.badge}>{tab.count(data)}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <main className={styles.content}>
        {activeTab === 'overview' && <OverviewTab data={data} />}
        {activeTab === 'timeline' && <TimelineTab segments={data.topic_segments} />}
        {activeTab === 'quotes' && <QuotesTab quotes={data.quotes} />}
        {activeTab === 'insights' && <InsightsTab insights={data.insights} />}
        {activeTab === 'references' && <ReferencesTab references={data.references} />}
        {activeTab === 'disagreements' && <DisagreementsTab disagreements={data.disagreements_and_nuance} />}
      </main>
    </div>
  )
}
