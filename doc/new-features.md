# New Feature Proposals

Eight proposed features to make TranscriberUI more useful and engaging.

---

## 1. Full-Text Search Across All Transcripts

**What**: A search bar on the HomePage that searches across all transcripts — matching titles, quotes, insights, speaker names, and references. Results highlight which transcript matched and why (e.g. "Quote by John in *Episode 42*: '...'").

**Why users will love it**: Once you have 20+ transcripts, finding "that thing someone said about AI regulation" is painful. This turns the app from a transcript viewer into a personal knowledge base.

**Effort**: Medium-low. The `json_data` is already stored as text. A Postgres `ILIKE` or `to_tsvector` search on `title` + `json_data` gets 80% of the value. Frontend is a search input + results list with highlights.

---

## 2. Shareable Public Transcript Links

**What**: When a transcript is marked public, generate a clean shareable URL (e.g. `/t/<id>`) that anyone can view without logging in — a read-only Dashboard with all 6 tabs. Add a "Copy Link" button next to the visibility toggle.

**Why users will love it**: People analyze podcasts/interviews to share insights with colleagues, on social media, or in newsletters. Right now "public" is a flag but there's no way to actually share a direct link. This turns every analysis into a shareable artifact.

**Effort**: Low. The backend already serves public transcripts. Needs one unauthenticated GET route, a minimal frontend route/view, and a copy-to-clipboard button.

---

## 3. AI-Powered Transcript Comparison ("Compare Two Episodes")

**What**: Select 2 transcripts from the HomePage and see a side-by-side comparison: shared topics, contradicting claims, overlapping references, and unique insights per episode. Generated on-demand via a single Claude API call.

**Why users will love it**: Podcast listeners often follow topics across episodes or across different shows. "Did Guest A on Lex Fridman contradict what Guest B said on Huberman?" is the kind of question that's impossible to answer manually but trivial for AI with structured data.

**Effort**: Medium. The structured JSON for both transcripts is already in the DB. Send both to Claude with a comparison prompt, display results in a new view. No schema changes needed — it's a read-only feature.

---

## 4. One-Click Markdown/Newsletter Export

**What**: A "Export as Markdown" button on the Dashboard that generates a polished, copy-paste-ready document: title, summary, top quotes (with speaker attribution), key insights, and references with links. Formatted for newsletters, blog posts, or Notion.

**Why users will love it**: The analysis is great inside the app, but users want to *use* the insights elsewhere — in a team Slack, a Substack post, meeting notes. Right now they'd have to manually copy from each tab. One click gives them a ready-to-publish document.

**Effort**: Low. All the data is already structured in `json_data`. Pure frontend formatting — iterate over the JSON fields and produce a Markdown string, then download or copy to clipboard. No API changes needed.

---

## 5. Bookmarks & Collections

**What**: Let users bookmark individual quotes, insights, or references from any transcript into a personal "Saved Items" collection. A star/bookmark icon on each card in the Dashboard tabs. A new "Saved" view on the HomePage shows all bookmarked items grouped by type, with links back to the source transcript.

**Why users will love it**: The app surfaces 50+ data points per transcript. Users care about maybe 5-10 across all their transcripts. Bookmarks let them curate their own "best of" — the most important quotes, the tools they want to try, the claims they want to fact-check. Turns passive browsing into active knowledge curation.

**Effort**: Medium-low. One new Prisma model (`Bookmark` with `userId`, `transcriptId`, `itemType`, `itemId`). One new API route for CRUD. Frontend adds a small bookmark icon to each card + a new "Saved" tab/view on the HomePage.

---

## 6. Tags

**What**: Let users associate zero or more tags on a transcript analysis. Tags are user-defined labels (e.g. "AI", "health", "interview", "favorite") that can be added/removed from the Dashboard or HomePage. The HomePage gets a tag filter bar to show only transcripts matching selected tags.

**Why users will love it**: As the transcript library grows, users need a way to organize and categorize their content beyond just chronological order. Tags provide flexible, user-driven taxonomy — group by topic, project, podcast series, or any personal system.

**Effort**: Medium-low. New Prisma model (`Tag` with `userId`, `name`) and join table (`TranscriptTag`). API routes for CRUD on tags and tag assignments. Frontend: tag chips on transcript cards, a tag input/autocomplete component, and a filter bar on the HomePage.

---

## 7. Upvote / Downvote System

**What**: An upvote/downvote mechanism on public transcripts. Users can upvote or downvote a transcript once. The HomePage shows vote counts on public transcript cards, and a "Top Rated" sort option surfaces the most valued analyses.

**Why users will love it**: When transcripts are shared publicly, there's no signal for quality. Votes let the community surface the best analyses and help new users discover high-value content. It also gives transcript creators feedback on what resonates.

**Effort**: Medium-low. New Prisma model (`Vote` with `userId`, `transcriptId`, `value` of +1/-1, unique constraint on user+transcript). API routes for voting and fetching vote counts. Frontend: upvote/downvote buttons with count display on transcript cards, sort option on HomePage.

---

## 8. Comment System

**What**: A comment section on each transcript where users can leave comments and discuss the analysis. Comments are visible to anyone who can view the transcript (public transcripts: all users; private: only the owner). Supports threaded replies for focused discussions.

**Why users will love it**: Transcripts often spark questions and debate — "I disagree with that insight", "Does anyone have the link for that reference?", "This quote was taken out of context". Comments turn each transcript from a static document into a living discussion. It builds community around shared content.

**Effort**: Medium. New Prisma model (`Comment` with `id`, `userId`, `transcriptId`, `parentId` for threading, `body`, `createdAt`). API routes for CRUD with auth checks. Frontend: comment list component, reply threading UI, comment input form, and comment count badges on transcript cards.
