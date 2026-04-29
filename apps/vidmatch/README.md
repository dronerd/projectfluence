# VidMatch YouTube Ingestion

VidMatch can ingest YouTube videos, score them with a simple quality heuristic, and upsert useful metadata into Supabase PostgreSQL.

## 1. Create the table

Run `apps/vidmatch/supabase/schema.sql` in the Supabase SQL editor.

## 2. Add environment variables

Add these values to your local `.env.local` and to your deployment environment:

```bash
YOUTUBE_API_KEY=your_youtube_data_api_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
VIDMATCH_INGEST_TOKEN=choose-a-private-token-for-this-api-route
```

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Do not expose it with `NEXT_PUBLIC_`.

## 3. Ingest videos

Start the app and call the protected API route:

```bash
curl -X POST http://localhost:3000/api/vidmatch/ingest-youtube \
  -H "Authorization: Bearer $VIDMATCH_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "English listening practice travel B1",
    "level": "B1",
    "skills": ["listening", "vocabulary"],
    "topics": ["travel"],
    "accent": "American",
    "maxResults": 10,
    "minQualityScore": 70
  }'
```

The service stores:

- `video_id`
- `title`
- `channel_name`
- `youtube_url`
- `thumbnail_url`
- `duration`
- `level`
- `skills`
- `topics`
- `accent`
- `transcript_available`
- `description`
- `tags`
- `quality_score`
- `created_at`

## Notes

The first scoring logic is intentionally simple: captions, description, tags, duration, views, and likes all add to `quality_score`. Later, you can improve recommendations by adding user history, watched videos, saved interests, or a richer classifier for CEFR level, topic, and accent.
