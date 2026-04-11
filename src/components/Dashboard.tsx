import { useState } from 'react'
import type { Theme, TranscriptAnalysis, User } from '../types'
import { Header } from './Header'
import { OverviewTab } from './tabs/OverviewTab'
import { QuotesTab } from './tabs/QuotesTab'
import { InsightsTab } from './tabs/InsightsTab'
import { ReferencesTab } from './tabs/ReferencesTab'
import { DisagreementsTab } from './tabs/DisagreementsTab'
import { TimelineTab } from './tabs/TimelineTab'
import { BookmarksProvider } from './BookmarksContext'
import styles from './Dashboard.module.css'

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
  transcriptId: string | null
  onReset: () => void
  theme: Theme
  onToggleTheme: () => void
  user: User
  onLogout: () => void
}

export function Dashboard({ data, transcriptId, onReset, theme, onToggleTheme, user, onLogout }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  return (
    <BookmarksProvider transcriptId={transcriptId}>
    <div className={styles.layout}>
      <Header data={data} onReset={onReset} theme={theme} onToggleTheme={onToggleTheme} user={user} onLogout={onLogout} />

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
    </BookmarksProvider>
  )
}
