"""Bounded native PDF extraction and deterministic, page-aware lexical retrieval.

The worker has no networking. It runs in a killable subprocess: a timeout of a
thread would otherwise leave hostile decompression running in the API process.
"""
from collections import Counter
import asyncio
from io import BytesIO
import json
import math
from pathlib import Path
import re
import sys
import unicodedata

MAX_PDF_BYTES = 8 * 1024 * 1024
MAX_PAGES = 80
MAX_TEXT_CHARS = 180000
MAX_PAGE_CHARS = 24000
CHUNK_CHARS = 1800
_extraction_slots = asyncio.Semaphore(1)


class PdfProcessorBusy(Exception):
    pass


def extract_native(data: bytes) -> dict:
    from pypdf import PdfReader
    if not data.startswith(b'%PDF-'):
        raise ValueError('Upload a valid PDF file.')
    reader = PdfReader(BytesIO(data), strict=False)
    if reader.is_encrypted:
        raise ValueError('Password-protected PDFs are not supported. Upload an unlocked copy.')
    if len(reader.pages) > MAX_PAGES:
        raise ValueError(f'This PDF has too many pages. Upload at most {MAX_PAGES} pages.')
    if not reader.pages:
        raise ValueError('This PDF has no pages.')
    pages, warnings, total = [], [], 0
    for number, page in enumerate(reader.pages, 1):
        try:
            contents = page.get_contents()
            if contents and len(contents.get_data()) > 4 * 1024 * 1024:
                raise ValueError('Page content is too complex for safe native extraction.')
            text = (page.extract_text(extraction_mode='layout') or '').replace('\x00', '').strip()
        except Exception:
            pages.append({'page': number, 'text': '', 'status': 'unreadable'})
            warnings.append(f'Page {number} could not be extracted.')
            continue
        if len(text) > MAX_PAGE_CHARS or total + len(text) > MAX_TEXT_CHARS:
            raise ValueError('The extracted document exceeds the text budget. Split the PDF into smaller documents.')
        total += len(text)
        readable = len(re.sub(r'\s', '', text)) >= 12
        pages.append({'page': number, 'text': text, 'status': 'readable' if readable else 'unreadable'})
        if not readable:
            warnings.append(f'Page {number} has little or no readable text; it may be scanned. OCR is not enabled.')
    count = sum(page['status'] == 'readable' for page in pages)
    warnings.append('Native text extraction does not interpret images, charts or table structure. Check the original PDF for these.')
    return {'pages': pages, 'page_count': len(pages),
            'text_status': 'ready' if count == len(pages) else 'partial' if count else 'unreadable',
            'warnings': warnings}


async def extract_pdf(data: bytes) -> dict:
    if _extraction_slots.locked():
        raise PdfProcessorBusy('Another PDF is being processed. Try again in a few seconds.')
    async with _extraction_slots:
        return await _extract_pdf_worker(data)


async def _extract_pdf_worker(data: bytes) -> dict:
    process = await asyncio.create_subprocess_exec(sys.executable, str(Path(__file__).resolve()),
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
    try:
        async with asyncio.timeout(18):
            stdout, _ = await process.communicate(data)
    except BaseException:
        if process.returncode is None:
            process.kill()
        await process.wait()
        raise
    if process.returncode != 0 or not stdout:
        raise ValueError('This PDF could not be safely processed. Try a smaller or text-exported PDF.')
    result = json.loads(stdout)
    if 'error' in result:
        raise ValueError(result['error'])
    return result


def tokens(text: str) -> list[str]:
    normalized = unicodedata.normalize('NFKC', text).casefold()
    words = re.findall(r'[^\W_]+', normalized)
    # CJK bigrams make the lexical baseline useful without whitespace tokenization.
    for run in re.findall(r'[\u3040-\u30ff\u3400-\u9fff]+', normalized):
        words.extend(run[i:i + 2] for i in range(len(run) - 1))
    return words


def document_chunks(document: dict) -> list[dict]:
    chunks = []
    for page in document.get('pages', []):
        if page.get('status') != 'readable':
            continue
        text = page.get('text', '')
        for start in range(0, len(text), CHUNK_CHARS - 160):
            chunks.append({'sourceId': f'document:{document["id"]}:page:{page["page"]}',
                'documentId': document['id'], 'page': page['page'], 'text': text[start:start + CHUNK_CHARS]})
    return chunks


def lexical_rank(chunks: list[dict], query: str, limit: int = 6) -> list[dict]:
    """BM25-like lexical ranking, exact page queries, deduplication and diversity."""
    wanted = set(tokens(query))
    requested_pages = {int(value) for value in re.findall(r'\b(?:p(?:age)?\.?\s*)(\d+)\b', query, re.I)}
    if re.search(r'\b(last|final)\s+page\b', query, re.I) and chunks:
        requested_pages.add(max(chunk.get('page', 0) for chunk in chunks))
    bags = [Counter(tokens(chunk['text'])) for chunk in chunks]
    avg = sum(sum(bag.values()) for bag in bags) / max(len(bags), 1)
    frequency = Counter(token for bag in bags for token in wanted if token in bag)
    ranked = []
    for index, (chunk, bag) in enumerate(zip(chunks, bags)):
        size = sum(bag.values())
        score = 0.0
        for token in wanted:
            tf = bag[token]
            if tf:
                idf = math.log(1 + (len(chunks) - frequency[token] + .5) / (frequency[token] + .5))
                score += idf * tf * 2.2 / (tf + 1.2 * (.25 + .75 * size / max(avg, 1)))
        if chunk.get('page') in requested_pages:
            score += 100
        ranked.append((score, -index, chunk))
    ranked.sort(key=lambda item: (item[0], item[1]), reverse=True)
    selected, source_counts, seen = [], Counter(), set()
    for score, _, chunk in ranked:
        fingerprint = ' '.join(chunk['text'].split())
        if fingerprint in seen or source_counts[chunk['sourceId']] >= 2:
            continue
        selected.append({**chunk, 'retrievalScore': round(score, 4)})
        seen.add(fingerprint)
        source_counts[chunk['sourceId']] += 1
        if len(selected) >= limit:
            break
    return selected


def coverage(document: dict, passages: list[dict], scope: str) -> dict:
    readable = [page['page'] for page in document.get('pages', []) if page.get('status') == 'readable']
    return {'scope': scope, 'pagesUsed': sorted({chunk['page'] for chunk in passages if 'page' in chunk}),
            'totalPages': document['page_count'], 'readablePages': readable,
            'unreadablePages': [page['page'] for page in document.get('pages', []) if page.get('status') != 'readable'],
            'representation': 'native_text' if scope == 'focused' else 'all_readable_text_or_page_notes'}


if __name__ == '__main__':
    import resource
    # RLIMIT_AS is supported on Render/Linux. macOS has a very large process
    # virtual footprint; CPU/deadline still apply there, memory limit is Linux-only.
    if sys.platform.startswith('linux'):
        resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CPU, (15, 15))
    resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
    try:
        raw = sys.stdin.buffer.read(MAX_PDF_BYTES + 1)
        if len(raw) > MAX_PDF_BYTES:
            raise ValueError('The PDF exceeds the 8 MiB limit.')
        result = extract_native(raw)
    except ValueError as error:
        result = {'error': str(error)}
    except Exception:
        result = {'error': 'The PDF is damaged or cannot be safely extracted. Export it again as a text PDF.'}
    sys.stdout.write(json.dumps(result, ensure_ascii=False))
