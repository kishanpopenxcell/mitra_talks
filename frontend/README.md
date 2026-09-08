# Frontend -- Mood-Based AI Voice Companion

React + TypeScript + Vite + Tailwind frontend. See the repo-root README for
the full project overview; this file covers frontend-specific setup and
notes.

## Setup

```bash
cd frontend
npm install
cp .env.example .env   # set VITE_API_BASE_URL to your backend's URL
npm run dev
```

Runs at `http://localhost:5173` by default. The app renders fine even if the
backend is unreachable -- it shows a clear "backend unreachable" indicator
instead of crashing.

## Scripts

```bash
npm run dev       # start the Vite dev server
npm run build     # type-check (tsc -b) and produce a production build in dist/
npm run preview   # locally preview the production build
npm run lint      # run ESLint
```

## Environment variables

```
VITE_API_BASE_URL=http://localhost:8000   # base URL of the FastAPI backend
```

Vite only exposes variables prefixed `VITE_` to client code, and nothing
sensitive (no API keys) belongs here -- all secrets stay server-side in
`backend/.env`.

## Layout

```
src/
  components/
    MoodSelection/   Initial mood-picker screen + mood card
    Conversation/     Conversation screen, message list/bubble, mood indicator
    Orb/               The floating AI orb (CSS-animated, 5 visual states)
    InputBar/          Text input, send button, mic button, voice toggle
  hooks/               useChatStream (SSE), useVoiceRecorder, useAudioPlayback
  services/            Dedicated API client layer (chat/health/voice) -- the
                        only place that calls the backend
  types/               Shared TypeScript types matching the backend's API contract
  mood/                Frontend-only mood presentation data (label, emoji, color)
```

## Notes on the backend contract

- Mood is sent to the backend using `toBackendMood()` in `src/mood/moods.ts`,
  which maps the frontend's lowercase mood ids (`'happy'`) to the backend's
  capitalized enum (`'Happy'`). If you add a mood, update both
  `frontend/src/mood/moods.ts` and `backend/app/mood/config.py` together.
- `services/chatService.ts` hand-parses Server-Sent Events from a `fetch`
  `ReadableStream` (native `EventSource` can't send a POST body). It
  normalizes both `\n\n` and `\r\n\r\n` event separators, since different SSE
  server implementations use either.

## Verification performed

- `npm install` completes cleanly (Vite pinned to `^6.0.0` for compatibility
  with `@vitejs/plugin-react`; avoid bumping past a major Vite version
  without checking the plugin's peer-dependency range first).
- `npm run build` succeeds with zero TypeScript errors.
- `npm run dev` boots and renders the mood-selection and conversation screens
  correctly against a running backend, including graceful error states when
  the backend is offline or not yet configured with an `HF_TOKEN`.
