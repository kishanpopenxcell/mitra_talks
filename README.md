# Mitra -- Mood-Based AI Voice Companion

A personal, single-user AI companion web app. Pick how you're feeling, then
talk to Mitra by text or voice. Mitra's personality -- tone, energy, warmth,
pacing -- adapts to your selected mood via the system prompt, not by
repeating your mood back at you.

This is a small MVP, not a SaaS product: **no accounts, no login, no
database, no persistent memory.** Each browser session is a fresh
conversation, held only in memory on the frontend.

## What it does

- Choose one of 8 moods (Happy, Sad, Angry, Stressed, Anxious, Excited,
  Lonely, Neutral) before entering the conversation.
- Type or speak to Mitra; replies stream in as text and (optionally) as
  spoken audio.
- A floating orb visually reflects what's happening: idle, listening,
  thinking, speaking, or error -- subtly tinted by your mood.
- Mitra is a friendly companion, never a therapist/doctor. It won't diagnose
  you, and if you mention serious distress or self-harm it will gently point
  you toward real-world help instead of pretending to treat you.

## Architecture

```
project-root/
  frontend/     React + TypeScript + Vite + Tailwind (the orb, chat UI, mic)
  backend/      FastAPI + LangChain (mood prompts, HF/Cartesia calls, SSE)
  project_details.md   Original product/technical spec this was built from
```

The frontend never talks to Hugging Face, Cartesia, or Groq directly -- every
external AI call is proxied through the FastAPI backend, which is the only
place that holds API keys.

```
Browser (mic / text) --> FastAPI backend --> Hugging Face / Cartesia --> back to browser
```

- **Chat**: mood + conversation history -> LangChain (`ChatHuggingFace` over
  Hugging Face Inference Providers) -> streamed text (Server-Sent Events).
- **Voice in**: recorded audio -> Hugging Face Whisper (STT) -> text -> same
  chat pipeline.
- **Voice out**: reply text -> Cartesia TTS -> audio returned to the browser,
  auto-played if voice replies are enabled.

No database, no vector store, no RAG, no agents/tools -- one model, a
mood-driven system prompt, and a capped in-memory conversation history sent
fresh with every request.

## Technology stack

| Layer | Choice |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS v4 |
| Backend | Python, FastAPI, LangChain (`langchain-huggingface`) |
| LLM | `Qwen/Qwen2.5-7B-Instruct` via Hugging Face Inference Providers (`featherless-ai`) |
| STT | `openai/whisper-large-v3` via Hugging Face Inference Providers (`hf-inference`), Groq Whisper as an optional fallback |
| TTS | Cartesia (`sonic-3.6`) -- see below for why this isn't Hugging Face; Deepgram Aura-2 as an optional fallback; browser `speechSynthesis` as a last-resort client-side fallback |

## Why Qwen2.5 instead of Llama-3.1 for the chat model

Meta's Llama models are **gated** on the Hugging Face Hub: even though
Inference Providers can technically serve them, LangChain's `ChatHuggingFace`
resolves the model ID against the Hub itself and fails with a
`GatedRepoError` (403) for any user who hasn't individually requested and
been granted access to that specific repo -- which defeats the point of a
public app anyone can use. `Qwen/Qwen2.5-7B-Instruct` is fully open
(Apache-2.0, no license click-through required), comparable in quality/size
for short conversational turns, and currently served via the `featherless-ai`
provider. If you swap `HF_LLM_MODEL`, make sure the replacement is **not
gated** on its Hub page, not just "available via Inference Providers" --
those are different things.

## Why Cartesia instead of Hugging Face for text-to-speech

The spec's intent was Hugging Face end-to-end. In practice (verified against
Hugging Face's own Inference Providers docs at implementation time), HF's
Inference Providers marketplace has **no currently working TTS routing** --
there's no dedicated Text-to-Speech task in the live partner capability
table, and `InferenceClient.text_to_speech()` calls fail against essentially
every model today. LLM (`featherless-ai`) and STT (`hf-inference`) are both
solid and confirmed working; TTS is the one exception.

Cartesia was chosen as the closest fit to the project's constraints: a
genuinely free tier (20,000 credits/month, no credit card), low latency,
simple REST API, and audio returned as directly browser-playable WAV. This is
a deliberate, documented deviation from the letter of the spec in service of
its actual intent (a working, free, non-paid-API voice companion). See
[`backend/app/services/tts_service.py`](backend/app/services/tts_service.py)
for the implementation and fallback chain (Cartesia -> Deepgram Aura-2 ->
signal `tts_available: false` so the frontend falls back to the browser's
built-in speech synthesis).

## Prerequisites

- Node.js 18+ and npm
- Python 3.11+
- A Hugging Face account and access token
- A Cartesia account and API key (for voice replies -- optional; the app
  works text-only without it)

## Getting a Hugging Face token

1. Create a free account at https://huggingface.co/join
2. Go to https://huggingface.co/settings/tokens
3. Click **New token**, give it a name, and choose the **Read** role (no
   write access needed)
4. Copy the token -- you'll paste it into `backend/.env` as `HF_TOKEN`

Hugging Face's free tier currently includes **$0.10/month in Inference
Providers credit** for non-paid accounts. This is enough for light personal
use (short chat turns + transcriptions) but is not unlimited -- see
[Known limitations](#known-limitations) below.

## Getting a Cartesia API key

1. Sign up at https://play.cartesia.ai/sign-up
2. Generate a key at https://play.cartesia.ai/keys
3. Copy it into `backend/.env` as `CARTESIA_API_KEY`
4. (Optional) Browse voices at https://play.cartesia.ai/voices and set
   `CARTESIA_VOICE_ID` to your preferred one

Cartesia's free tier is 20,000 credits/month (roughly 1 credit per
character of speech generated), no card required. If you skip this step
entirely, text chat still works fully -- voice replies just won't play
(the app tells you cleanly rather than failing).

## Environment configuration

Each app has its own `.env.example`:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Then edit `backend/.env` with your `HF_TOKEN` and (optionally)
`CARTESIA_API_KEY`. `frontend/.env` only needs `VITE_API_BASE_URL` pointed at
wherever the backend is running.

Never commit either `.env` file -- both are covered by their app's
`.gitignore`.

## Running locally

**Backend:**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then edit in your HF_TOKEN / CARTESIA_API_KEY
uvicorn app.main:app --reload
```

Backend runs at `http://localhost:8000`. Visit `http://localhost:8000/docs`
for interactive Swagger API docs. The app boots fine even with an empty
`.env` -- `/health` will just report which services aren't configured, and
chat/voice endpoints return a clean error instead of crashing.

**Frontend** (in a second terminal):

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Frontend runs at `http://localhost:5173` and talks to the backend at the URL
in `VITE_API_BASE_URL`.

Open `http://localhost:5173`, pick a mood, and start talking.

## How mood adaptation works

`backend/app/mood/config.py` centralizes one personality profile per mood
(tone, energy, communication style, empathy level, pacing, what to avoid).
`backend/app/mood/prompt_builder.py` turns the selected profile into a system
prompt, always appended with non-negotiable safety boundaries (no
therapist/medical claims, no diagnosis, redirect to real help on self-harm
mentions) regardless of which mood is picked. There's one model and one code
path -- only the system prompt changes. To add or tweak a mood, edit that one
config file; nothing else needs to change.

## How voice input works

The browser's `MediaRecorder` API records audio (webm/opus) when you press
the mic button. On stop, the clip is uploaded to the backend, which sends it
to Hugging Face Whisper for transcription, then runs the transcript through
the same mood-aware chat pipeline as typed messages. Microphone permission
denial and unsupported browsers are handled gracefully with a clear message
instead of a crash.

## How voice output works

After the AI's reply text is ready, the backend requests speech audio from
Cartesia and returns it to the frontend, which auto-plays it if voice replies
are toggled on. You can turn voice replies off at any time to use the app
text-only. If Cartesia (and its fallback) are both unavailable, the backend
tells the frontend clearly, and the frontend falls back to the browser's
built-in `speechSynthesis` for that one reply -- never the primary path.

## Streaming

Text chat responses stream progressively over Server-Sent Events, so you see
words appear as the model generates them rather than waiting for the full
reply. The orb's state (thinking -> speaking) reflects this.

## Changing the models

All model/provider choices are environment variables in `backend/.env` --
no code changes required to swap them:

```
HF_LLM_MODEL, HF_LLM_PROVIDER
HF_STT_MODEL, HF_STT_PROVIDER
CARTESIA_TTS_MODEL, CARTESIA_VOICE_ID
```

If a model becomes unavailable through its provider, check current
availability at https://huggingface.co/docs/inference-providers and swap the
env var -- the service layer (`backend/app/services/`) doesn't need to
change.

## Deployment

**Frontend -> Vercel:** point Vercel at the `frontend/` directory (Vite
preset), set `VITE_API_BASE_URL` to your deployed backend's URL in Vercel's
environment variables.

**Backend -> Render or Railway** (not Vercel): the backend uses long-lived
Server-Sent Events streaming and multipart audio uploads, which don't fit
cleanly into Vercel's serverless function model (cold starts, execution time
limits). Render or Railway's free tiers run FastAPI as a normal long-lived
process, which is simpler and more reliable for this app. Either:

1. Point Render/Railway at the `backend/` directory
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Set the same environment variables as your local `backend/.env`
5. Set `FRONTEND_ORIGIN` to your deployed Vercel frontend URL (for CORS)

The backend has no local filesystem or in-memory persistence requirements
beyond a single request's lifetime, so it's compatible with a
restart-anytime free-tier host.

## Known limitations

- **Hugging Face free tier is not unlimited.** Free (non-PRO) accounts get
  $0.10/month in Inference Providers credit. Heavy use of chat/STT will
  exhaust this; the backend reports a clean "service temporarily
  unavailable" error rather than silently failing or auto-billing you.
- **No persistent memory.** Refreshing the page starts a new conversation.
  This is intentional, not a bug.
- **TTS is not Hugging Face** (see [above](#why-cartesia-instead-of-hugging-face-for-text-to-speech)).
  Cartesia's free tier (20,000 credits/month) is also finite.
- **Single user, no auth.** Anyone with the deployed URL can use it. Fine for
  a personal project; don't put anything sensitive through it.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/health` shows `hf_configured: false` | `HF_TOKEN` missing/empty in `backend/.env` | Add a valid token, restart the backend |
| Chat returns "service not configured" | Same as above | Same as above |
| Voice replies never play | `CARTESIA_API_KEY` missing, or Cartesia free tier exhausted | Add/check the key; app falls back to text-only automatically |
| "Microphone access was denied" | Browser permission blocked | Re-enable mic permission for the site in browser settings |
| Frontend shows "backend unreachable" | Backend not running, or `VITE_API_BASE_URL` wrong | Confirm backend is running and the URL matches |
| CORS errors in the browser console | `FRONTEND_ORIGIN` on the backend doesn't match the frontend's actual origin | Update `FRONTEND_ORIGIN` in `backend/.env` and restart |
| `npm install` fails with `ERESOLVE`/peer-dependency conflict | A dependency range in `frontend/package.json` resolved to an incompatible version pair | `rm -rf node_modules package-lock.json && npm install` after confirming `package.json` versions are compatible (already fixed as of this repo's current commit) |
| Chat fails with `GatedRepoError: 403 ... Access to model ... is restricted` | `HF_LLM_MODEL` points at a gated model (e.g. any Meta Llama repo) that requires per-user license acceptance on the Hub | Use a fully open model instead -- the default `Qwen/Qwen2.5-7B-Instruct` is not gated |

## Project structure details

See [`backend/README.md`](backend/README.md) for the backend's internal
layout (routes / services / mood / schemas / utils),
[`frontend/README.md`](frontend/README.md) for the frontend's, and
[`project_details.md`](project_details.md) for the original full product
specification this app was built against.
