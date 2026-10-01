"""Run explicitly synthetic first-6000-character vs whole-index retrieval evaluation."""
import json
import math
from pathlib import Path
import platform
import statistics
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from documents import document_chunks, lexical_rank


def run():
    fixture = json.loads(Path(__file__).with_name('retrieval_cases.json').read_text())
    # Padding simulates a document larger than the legacy 6000-character excerpt,
    # preserving each explicitly labelled page rather than inventing relevance.
    document = {'id': 'synthetic-evaluation', 'page_count': len(fixture['pages']),
        'pages': [{'page': index + 1, 'status': 'readable', 'text': text * 15} for index, text in enumerate(fixture['pages'])]}
    corpus = document_chunks(document)
    baseline, remaining = [], 6000
    for chunk in corpus:
        if remaining <= 0:
            break
        baseline.append({**chunk, 'text': chunk['text'][:remaining]})
        remaining -= len(chunk['text'])
    metrics = {}
    timings = []
    sizes = []
    for name, candidates in [('legacy_initial_6000_chars', baseline), ('whole_document_bm25_page_aware', corpus)]:
        recalls, ndcgs = [], []
        for case in fixture['queries']:
            started = time.perf_counter()
            for _ in range(25):
                selected = lexical_rank(candidates, case['query'], 3)
            if name == 'whole_document_bm25_page_aware':
                timings.append((time.perf_counter() - started) * 1000 / 25)
                sizes.append(sum(len(row['text']) for row in selected))
            pages = list(dict.fromkeys(row['page'] for row in selected))
            gold = set(case['relevantPages'])
            recalls.append(len(gold & set(pages)) / len(gold))
            dcg = sum(1 / math.log2(index + 2) for index, page in enumerate(pages) if page in gold)
            ideal = sum(1 / math.log2(index + 2) for index in range(min(3, len(gold))))
            ndcgs.append(dcg / ideal)
        metrics[name] = {'recall_at_3': round(statistics.mean(recalls), 4), 'ndcg_at_3': round(statistics.mean(ndcgs), 4)}
    return {'label': fixture['label'], 'environment': {'python': platform.python_version(), 'platform': platform.platform()},
        'query_count': len(fixture['queries']), 'corpus_pages': document['page_count'],
        'timing_iterations_per_query': 25, 'total_rank_calls_per_method': len(fixture['queries']) * 25,
        'metrics': metrics, 'retrieval_mean_ms': round(statistics.mean(timings), 3),
        'retrieval_max_query_mean_ms': round(max(timings), 3),
        'mean_selected_context_characters': round(statistics.mean(sizes)),
        'provider_latency_measured': False, 'limitations': ['Small synthetic English corpus.',
            'No live Supabase/network/provider latency.', 'No semantic ranking or real learning benefit measured.',
            'Character counts are not tokenizer-measured token usage.']}


if __name__ == '__main__':
    print(json.dumps(run(), indent=2))
