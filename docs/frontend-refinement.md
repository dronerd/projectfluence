# Frontend audit and refinement

## Architecture and route map (before editing)

Next.js 15 App Router hosts three React learning surfaces through catch-all route adapters. TypeScript, Tailwind 3 and large page-local CSS strings define the visible UI. Supabase supplies authentication and saved learning state; FastAPI supplies speaking practice. Static vocabulary JSON is served from public/vocabstream/data. Local React state, auth subscriptions and debounced settings writes drive interactions; there is no global state library.

| Route | Visible components | Learner goal | Shared dependencies |
| --- | --- | --- | --- |
| / | app/page.tsx, prompt cards, learning articles | Choose practice; consult learning resources | AuthButton, Next Link/Image |
| /vocabstream (+ /learn, /home, /landing_page aliases) | LearnGenres, Header | Select vocabulary or idiom level | AuthContext, router-compat |
| /vocabstream/learn/:genreId | LessonList | Continue or choose a lesson | progressService |
| /vocabstream/lesson/:lessonId | Lesson, word/audio cards, two quizzes, results/replay | Learn, check understanding, retry | static lesson JSON, speech, progressService |
| /vocabstream/review | ReviewLesson | Practice saved questions | reviewService, AuthContext |
| /vocabstream/weak-words | WeakWords | Revisit words needing practice | reviewService, AuthContext |
| /vocabstream/still_under_development | StillUnderDevelopment | Return from unavailable specialist courses | router-compat |
| /speakwise | SpeakWiseApp, AI_chat setup/chat/summary | Configure, practice, get feedback, continue | Supabase, FastAPI, browser speech APIs |
| /vidmatch | VidMatchApp filters and results | Find suitable listening input | settings/recommend API, AuthButton |
| /vidmatch/history | VidMatchApp history | Reopen a previously opened video | history API |
| /vidmatch/similar/:id | VidMatchApp similar results | Continue with related input | recommend API |
| /analytics | AnalyticsPanel, StatLine, BarList | Understand recorded activity and continue | summary API, AuthButton |
| /auth/reset-password | ResetPasswordPage | Recover account | Supabase |
| /privacy | PrivacyPage | Read existing privacy information | Next Link |

Backend routes, schemas, transcript foundation work and future IR plans were inspected to establish boundaries. Existing uncommitted transcript work is outside this refinement. Educational content and backend contracts will be preserved.

## Prioritized plan

### P0 — behavior and accessibility
- Scan apps/ in Tailwind; remove conflicting global theme resets.
- Consolidate navigation, implement keyboard-safe dialogs with focus restoration and body scroll locking, visible focus and appropriate touch targets.
- Fix vocabulary final-answer double count, next-lesson state reset, invalid lesson handling, and duplicate submissions.
- Fix speaking inactive sending, startup failure, stale mode override, mobile clipped panels, IME submission and media cleanup.
- Distinguish analytics signed-out/loading/failure/empty states; refresh on auth change.

### P1 — hierarchy and responsive workflows
- Shared restrained indigo/white shell with persistent learn/speak/listen/progress destinations.
- Bring learning actions above editorial content on home, retain all resources.
- Make vocabulary lesson continuation explicit; reduce inactive curriculum prominence.
- Compact speaking setup and expose start/end/settings consistently.
- Group video filters and consolidate result cards; add clear initial/no-match/error states.
- Show honest progress labels (planned minutes, opened videos), not unsupported activity claims.

### P2 — consistent visual system
- Shared surface, spacing, type, border, radius, button, input and focus tokens.
- Preserve logo and indigo identity while removing excessive gradients/shadows.
- Use intentional phone/tablet grids, readable maximum widths and safe area spacing.
- Consistent feedback, selected, disabled and reduced-motion behavior.

### P3 — wording and final interaction pass
- Keep Japanese learner guidance and English study content; shorten technical copy.
- Supportive review language, meaningful completion actions, clear guest save limits.
- Render and inspect 320, 375, 390, 430, 600, 768, 1024, 1180, 1440 and 1920px layouts.
- Exercise keyboard/dialog, vocabulary, speaking and video states with browser automation; run lint/type checks/build/existing tests.

## Validation boundaries

Use real local vocabulary data. Browser fixtures may cover network-dependent states without creating accounts, sending emails, writing production learner data or incurring AI calls. Clearly distinguish fixture validation from live service verification. Learning content quality, genuine playback/completion measurement and legal policy coverage require separate product/content decisions.

## Implemented system

- `app/components/AppHeader.tsx`: common four-mode navigation, responsive brand/account row and current-route indication.
- `app/globals.css`: palette, typography, surfaces, buttons, input sizing, keyboard focus, reduced motion, safe-area spacing and responsive header dimensions. Tailwind now scans all learning apps.
- `app/components/Modal.tsx` and `AuthButton.tsx`: native modal behavior, associated status feedback, recoverable network errors and dedicated recovery-page ownership.
- `app/home.css` and `LearningResources.tsx`: practice-first homepage with preserved editorial content and all seven copyable prompt tools.
- `apps/vocabstream/src/vocabstream.css`, `PracticeQuestion.tsx`, `lib/learning.ts`: consistent learning/review presentation and scoring derived from recorded answers; twenty-item lesson pages with continuation.
- `apps/speakwise/src/SpeakWise.css` and `pages/AI_chat.tsx`: compact setup, all existing modes, usable phone chat, lifecycle guards, retryable feedback and next-practice cues.
- `apps/vidmatch/src/VidMatchApp.tsx`: consolidated cards, grouped optional filters, explicit request states and preference-save protection.
- `app/analytics/page.tsx`: accurate activity descriptions, state-aware rendering, useful learning continuation; API read failures now produce a recoverable error instead of false zero activity.
- Root loading/error/404 states and route metadata complete the common shell. The sitemap postbuild source path was corrected; public learning entry points are included.

Final validation results and reproduction steps are recorded in [frontend-validation.md](frontend-validation.md). Existing user changes to transcript services/schema/plans were preserved.
