# Frontend validation

See [the audit and route map](frontend-refinement.md) for the initial findings and implementation priorities.

## Recorded result — 2026-09-29

- Production build **passed**, including sitemap generation after correcting its existing manifest path.
- TypeScript **passed**; ESLint **passed with zero warnings**.
- Vocabulary regression tests **4/4 passed**. A separate check of pre-existing, uncommitted transcript work also passed **8/8**; those transcript files are outside this frontend commit.
- Final production browser suite **passed**: 14 routes × 10 widths, no horizontal overflow, no Axe violations, and successful account/resource interaction assertions. Measurements wait for the actual page to replace its loading state.
- Vocabulary, video and authenticated-progress browser scripts also passed against the production build. Speaking and account network-error/recovery workflows passed in isolated frontend runs with deterministic service fixtures.
- Rendered desktop, tablet and narrow-phone screenshots were visually reviewed over multiple refinement passes.

[Machine-readable results](frontend-validation-results.json)

Representative rendered previews: [desktop home](previews/home-desktop.png), [320px home](previews/home-mobile.png), [tablet lesson](previews/lesson-tablet.png), [320px speaking setup](previews/speaking-mobile.png).

## Blue branding follow-up — 2026-09-29

- Restored the shared light-blue palette, blue-to-cyan banner, and original product logos with canonical names.
- Production build, TypeScript, ESLint, and all four vocabulary regression tests pass.
- Rechecked 14 routes at 320–1920px: no horizontal overflow or Axe findings. Visually inspected home, vocabulary, lesson, speaking, video, and progress at narrow phone, tablet, and desktop sizes, including populated progress data.
- Progress, video, and isolated speaking fixture suites pass with the new branding. The active speaking composer remains visible at widths 320–1920px, including a 320×568px viewport. Header labels and logo sizing adapt at 600px and 1100px; full accessible destination names are retained.
- Banner endpoint contrast with white text is at least 4.67:1. Navigation hover uses a light-blue surface with dark-blue text; account-menu focus retains a blue ring on its white surface.
- Navigation label follow-up: medium/large navigation now shows 単語学習, 会話練習, and 動画学習. Production build/type/lint checks pass; verified the labels and overflow at 10 widths from 320 to 1920px, including 599/600px and 1099/1100px boundaries. Header Axe checks pass.
- The preview images below reflect this blue theme. Existing service/device limitations still apply.

## Compact-screen follow-up — 2026-09-29

- Removed the requested filler copy and tightened headers, setup forms, lesson panels, cards, feedback, and mobile content spacing. Header height is 88px below 900px, 64px at 900–1099px, and 72px on larger screens; navigation and primary controls retain 44px touch height.
- On a 320×568px viewport, the first vocabulary lesson’s Start button moved from y1084–1128 to y422–466; conversation Start moved from y566–610 to y384–428; video Search moved from y840–888 to y457–501. The first vocabulary word’s Next button is also visible at y514–558.
- At 390px, home document height decreased from 2114px to 1449px and the 20-item lesson list from 2412px to 1416px. Learning text is not clipped to force these reductions.
- The final production route suite passed 14 routes × 10 widths (320–1920px), with no horizontal overflow, Axe findings, runtime errors, or shared dialog/resource regressions. Additional header boundary checks at 599/600, 899/900/901, and 1099/1100px passed.
- Production build, TypeScript, ESLint, and all four vocabulary unit tests pass. The updated vocabulary browser regression verifies that advancing after scrolling through details restores the new prompt’s visible keyboard focus; scoring, replay, and next-lesson state still pass. Long word and definition samples remain readable at 320px.
- Speaking, video, and progress workflows passed with deterministic fixtures; the speaking composer remains reachable at 320×568px and in phone landscape. Optional video skill filters retain their selected values when closed and reopened.
- Preview images were refreshed from the final production build. Existing physical-device and live-service limitations below still apply.

## Home introduction and developer profile — 2026-09-29

- Replaced the beginner note with a short Project Fluence/developer introduction, and moved guest/login guidance beneath the learning introduction. Expanded the bottom profile using relevant language-learning, AI research, and international experience from the [developer's profile](https://yutokuroki.vercel.app/ja).
- Production build, TypeScript, and ESLint pass. Targeted production-browser checks passed at 320, 375, 390, 430, 600, 768, 899, 900, 1024, 1180, 1440, and 1920px, with the profile both closed and expanded: no horizontal overflow or runtime errors, and correct placement of the guest guidance.
- The primary learning action remains visible at 320×568px. The profile disclosure opens and closes by keyboard, and expanded-page Axe checks report no violations at 320, 768, and 1440px.
- Visually reviewed phone, tablet, and desktop layouts. The fuller profile uses two columns on larger screens and one on phones, and stays collapsed initially. Updated previews: [desktop home](previews/home-desktop.png), [320px home](previews/home-mobile.png), [expanded desktop profile](previews/home-profile-desktop.png), [expanded mobile profile](previews/home-profile-mobile.png).

## Running checks

```sh
npm run lint
npm run typecheck
npm run test:frontend
npm run build
```

`test:frontend` protects vocabulary scoring against duplicate answers, repeated words, incorrect denominators, and replay changing the original score. It uses Node's TypeScript stripping support (Node 22.6+; validated with Node 26.3). The optional `test:vidmatch-transcripts` command is available only when the separate transcript work is present.

Browser checks use temporary development tooling; no production dependency was added:

```sh
npm install --prefix /tmp/fluence-browser --no-save playwright @axe-core/playwright
npm run dev
```

Use the public Supabase URL and anonymous key in `.env.local` for the authentication checks in `test:browser` and the progress fixture. These checks still intercept service requests and use no real account.

In a second terminal, with Google Chrome installed:

```sh
FLUENCE_BROWSER_TOOLS=/tmp/fluence-browser npm run test:browser
FLUENCE_BROWSER_TOOLS=/tmp/fluence-browser node scripts/validate-vocabulary.mjs
FLUENCE_BROWSER_TOOLS=/tmp/fluence-browser node scripts/validate-video.mjs
FLUENCE_BROWSER_TOOLS=/tmp/fluence-browser node scripts/validate-progress.mjs
```

For the speaking fixture, start the frontend with `NEXT_PUBLIC_SPEAKWISE_API_URL=http://127.0.0.1:8000 npm run dev`, then run:

```sh
FLUENCE_BROWSER_TOOLS=/tmp/fluence-browser node scripts/validate-speaking.mjs
```

No speaking backend is needed for that test: requests to port 8000 are intercepted. The progress fixture reads the public Supabase URL from `.env.local` to derive the session storage name; it uses a synthetic session and intercepts authentication and data requests. No accounts, emails or production records are created. The speaking and vocabulary tests intercept writes and AI requests. Do not use your regular signed-in browser profile for testing; scripts create isolated contexts.

Optional environment variables:

- `FLUENCE_BASE_URL`: frontend address (default `http://127.0.0.1:3000`).
- `FLUENCE_BROWSER_TOOLS`: folder containing the temporary tool installation.
- `FLUENCE_SCREENSHOTS`: output folder (default temporary `fluence-frontend-validation`).

## Coverage

| Area | Checks |
| --- | --- |
| Route matrix | Home, vocabulary catalog, lesson list, lesson intro, review, saved words, speaking setup, video search, history, similar videos, progress, recovery, privacy, 404 |
| Widths | 320, 375, 390, 430, 600, 768, 1024, 1180, 1440, 1920 px |
| Shared interaction | Navigation and active destinations, keyboard focus, dialog containment/Escape/restoration, signup validation, recovery form ownership, original prompt tools |
| Vocabulary | Real lesson JSON; word cards/audio/details; 20/20 = 100%; duplicate tap protection; 95% plus successful replay stays 95%; next lesson reset; invalid lesson; progress-save retry; review; saved words; 20-item pagination |
| Speaking | Setup/start failure, selected mode, no stale history, IME Enter, send/retry, single-pane mobile settings/chat, reachable composer, summary/retry, truthful guest state, next practice |
| Video | Initial/loading/results/no matches/failure/retry, custom-topic limit, history, saved preference restoration, no default overwrite after failed restore, one save per changed preference |
| Progress | Signed-out/loading/populated/empty/failure/retry, authentication changes, no false zero result on failure, planned-minute and opened-video labels |
| Accessibility | Axe on routes and fixture states; manual keyboard focus checks; English language attributes on study content; visible feedback and reduced-motion styles |

## Scope and limitations

Viewport checks use Chromium, including narrow widths and portrait/landscape tablet dimensions. They do not substitute for physical-device Safari/Android testing, screen-reader user testing, or browser microphone/voice permission testing. Automated accessibility results are checks, not an accessibility certification.

Network-dependent successful states use deterministic fixtures; live Supabase writes, OAuth/email delivery, AI quality and real microphone input were not verified. Existing backend semantics remain: video activity records links opened, speaking totals use planned duration, and word-review history does not prove mastery. The static idiom corpus includes repeated content and needs editorial review. Existing privacy-policy wording was preserved; coverage of account/AI data needs a separate product/legal review.
