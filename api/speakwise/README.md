# SpeakWise Backend

FastAPI service for the SpeakWise chat and voice features.

## Endpoints

- `GET /health` - health check for local development and uptime monitors.
- `POST /api/chat` - English tutoring chat for `speaking`, `lesson`, and `warmup` modes.
- `POST /api/voice` - text-to-speech audio for an assistant message.
- `POST /api/feedback` - structured feedback for a submitted practice answer.
- `POST /api/improved-version` - highlighted improved version of a submitted answer.

## Local Setup

```bash
cd api/speakwise
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `api/speakwise/.env`:

```bash
OPENAI_API_KEY=sk-...
```

Run the API:

```bash
uvicorn main:app --reload
```

The frontend defaults to `http://127.0.0.1:8000`. To override it, set this in the Next.js environment:

```bash
NEXT_PUBLIC_SPEAKWISE_API_URL=https://your-speakwise-backend.example.com
```

## Deployment

The repository root contains `render.yaml` for deploying this service from `api/speakwise`.
