import { useEffect, useState } from "react";
import { apiGetVocabStreamReview, type VocabStreamReviewQuestion, type VocabStreamWeakWord } from "../api";
import { useAuth } from "../AuthContext";

export function useReviewData() {
  const { token, loading: authLoading } = useAuth();
  const [data, setData] = useState<{ weakWords: VocabStreamWeakWord[]; questions: VocabStreamReviewQuestion[] }>({ weakWords: [], questions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError(false);
    if (authLoading) return;
    if (!token) { setLoading(false); setData({ weakWords: [], questions: [] }); return; }
    setLoading(true);
    apiGetVocabStreamReview(token).then((result) => { if (!cancelled) setData(result); }).catch(() => { if (!cancelled) setError(true); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, authLoading, retry]);
  return { ...data, loading: loading || authLoading, error, refresh: () => setRetry((value) => value + 1), signedIn: Boolean(token) };
}
