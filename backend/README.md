# Backend -- Mood-Based AI Voice Companion

FastAPI backend. See the repo-root README for the full project overview;
this file covers backend-specific setup and notes.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then fill in HF_TOKEN / CARTESIA_API_KEY / etc.
uvicorn app.main:app --reload
```

The app boots fine with an empty `.env` -- `/health` will simply report
`hf_configured: false` / `tts_configured: false`, and the chat/voice
endpoints will return a clean 503 `configuration_error` instead of crashing.

Visit `http://localhost:8000/docs` for interactive API docs.

## Layout

```
app/
  main.py                 FastAPI app creation, CORS, router mounting
  core/config.py          Pydantic Settings (env vars)
  core/logging.py         Logging setup
  api/routes/             health, chat (SSE), voice
  api/deps.py             Dependency-injected service accessors
  schemas/                Pydantic request/response models
  services/               llm_service (LangChain + HF), stt_service, tts_service
  mood/                   Centralized mood -> personality profile + prompt builder
  utils/                  errors.py (exception hierarchy + handlers), audio.py
```

## Why Cartesia for TTS instead of Hugging Face

Hugging Face Inference Providers does not currently have a reliable/working
TTS routing path the way it does for chat (`featherless-ai`) and ASR
(`hf-inference`). Cartesia's `POST /tts/bytes` REST API is used instead --
it has a free tier, low latency, and returns browser-playable WAV bytes
directly. See `app/services/tts_service.py` for the full rationale and the
swappable-fallback design (Deepgram Aura-2 hook included but not required
for the MVP).

## Choosing an `HF_LLM_MODEL`

The model must be **fully public on the Hugging Face Hub** (no gated
license/click-through), not merely "servable via Inference Providers" --
LangChain's `ChatHuggingFace` resolves the model ID against the Hub itself,
and a gated repo (e.g. any Meta Llama model) will throw a `GatedRepoError`
(403) regardless of which provider handles the actual inference call. Check
a candidate model's Hub page for a "You need to agree to share your contact
information..." gate before configuring it.

## Verification performed

- `pip install -r requirements.txt` installs cleanly in a fresh venv.
- `uvicorn app.main:app` boots with no `.env` present; no crash.
- `GET /health` returns `{"status": "ok", "hf_configured": false, "tts_configured": false}` with no secrets configured.
- `GET /docs` renders Swagger UI with full schemas/descriptions for all endpoints.
- Calling `/api/chat/stream` or `/api/voice/*` without a configured token returns a clean JSON 503 (`configuration_error`), never a stack trace.
