// Render's scheduler invokes the existing protected Next.js ingestion route.
// No automatic retries: a timeout may occur after ingestion already committed.
try {
  const base = new URL(process.env.PROJECTFLUENCE_URL || '');
  if (base.protocol !== 'https:' || base.username || base.password || !process.env.CRON_SECRET) {
    throw new Error('Cron configuration is incomplete');
  }
  const response = await fetch(new URL('/api/vidmatch/cron/daily-youtube', base), {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    signal: AbortSignal.timeout(300_000),
    redirect: 'error',
  });
  const result = await response.json();
  if (!response.ok || result?.ok !== true) throw new Error('Daily ingestion failed');
  console.log(JSON.stringify({ event: 'vidmatch_daily_ingestion', status: 'ok', discoveryStatus: result.discovery?.status, analyzed: result.discovery?.analyzed ?? 0, inserted: result.discovery?.inserted ?? 0, deferred: result.discovery?.deferred ?? 0, purgeRemaining: result.health?.purge?.remaining ?? false }));
} catch {
  // No response bodies, endpoint URLs, or credentials in scheduler logs.
  console.error(JSON.stringify({ event: 'vidmatch_daily_ingestion', status: 'failed' }));
  process.exitCode = 1;
}
