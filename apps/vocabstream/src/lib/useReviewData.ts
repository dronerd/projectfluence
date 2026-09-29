import { useEffect, useRef, useState } from "react";
import { apiGetVocabStreamReview, type VocabStreamReviewQuestion, type VocabStreamWeakWord } from "../api";
import { useAuth } from "../AuthContext";

export function useReviewData() {
  const { token, user, loading: authLoading } = useAuth();
  const latestToken = useRef(token);
  latestToken.current = token;
  const userId = user?.id;
  const [data, setData] = useState<{ weakWords: VocabStreamWeakWord[]; questions: VocabStreamReviewQuestion[] }>({ weakWords: [], questions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError(false);
    if (authLoading) return;
    const accessToken = latestToken.current;
    if (!userId || !accessToken) { setLoading(false); setData({ weakWords: [], questions: [] }); return; }
    setLoading(true);
    setData({ weakWords: [], questions: [] });
    apiGetVocabStreamReview(accessToken).then((result) => { if (!cancelled) setData(result); }).catch(() => { if (!cancelled) setError(true); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, authLoading, retry]);
  return { ...data, loading: loading || authLoading, error, refresh: () => setRetry((value) => value + 1), signedIn: Boolean(token) };
}
