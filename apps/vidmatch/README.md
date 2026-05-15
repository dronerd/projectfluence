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
CRON_SECRET=choose-a-private-token-for-vercel-cron
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

## Daily Vercel cron ingestion

`vercel.json` schedules `/api/vidmatch/cron/daily-youtube` once per day at `20:00 UTC`, which is `05:00` in Japan Standard Time.

Add `CRON_SECRET` to Vercel environment variables. Vercel will automatically send it as the `Authorization: Bearer ...` header when invoking the cron route.

To test the route manually:

```bash
curl -X GET http://localhost:3000/api/vidmatch/cron/daily-youtube \
  -H "Authorization: Bearer $CRON_SECRET"
```

The cron route rotates through a small list of preset searches and asks for up to 1 video per day.
