# Project Fluence — Technical Depth Plan for Information Retrieval, Memory Management, ML, Recommender Systems, and Software Engineering

## Goal

The goal is to evolve **Project Fluence** from a set of AI-powered language-learning applications into a technically substantial **personalized information retrieval, learner-memory, and recommendation platform**.

The strongest story is:

> **Event data → structured memory → hybrid retrieval → learned ranking → cross-app personalization → rigorous offline/online evaluation**

Rather than adding more LLM calls simply for complexity, Fluence should demonstrate depth in:

- Information Retrieval
- Memory Management
- Machine Learning
- Recommender Systems
- Longitudinal Personalization
- Evaluation
- Software Engineering
- Experimentation and Observability

The key architectural idea is to make **SpeakWise, VidMatch, and VocabStream producers and consumers of a shared learner model**.

---

# 1. Target Architecture

```text
                         Project Fluence
                               │
                 ┌─────────────┴─────────────┐
                 │                           │
          Content Retrieval            Learner Memory
                 │                           │
      BM25 / Dense / Hybrid        Events / Episodes / State
                 │                           │
          Candidate Retrieval         Memory Retrieval
                 └─────────────┬─────────────┘
                               │
                        Feature Generation
                               │
                         Learned Ranker
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
        VidMatch           VocabStream         SpeakWise
       next video          next review        personalized
      recommendation        question           tutoring
```

The eventual system should support:

1. Content retrieval
2. Learner-memory retrieval
3. Longitudinal learner-state modeling
4. Personalized recommendation
5. Learned ranking
6. Cross-application feedback loops
7. Reproducible evaluation

---

# 2. Current Baseline

## SpeakWise

SpeakWise currently has two memory layers:

### Short-term conversation memory

- The browser keeps the current chat in React state.
- The latest 12 messages are sent with each request.
- The backend accepts at most 16 messages.
- Each message is truncated to 4,000 characters.
- Memory disappears when the page/session resets.

### Long-term learner memory

Authenticated lesson results are stored in Supabase.

When a lesson finishes, an LLM converts the conversation into a structured summary containing:

- strengths
- weaknesses
- recommendations
- useful vocabulary
- reusable mistake patterns

The summary and mistake aggregates are then persisted.

At the beginning of a future session, SpeakWise retrieves:

- 5 recent SpeakWise lesson summaries
- 10 most frequent/recent SpeakWise mistake patterns
- 8 recent VocabStream lesson-progress records
- 12 recent incorrect VocabStream question attempts
- 6 recent VidMatch video-history records

The resulting JSON is inserted directly into the LLM system prompt.

### Current limitation

There is currently:

- no embedding retrieval
- no semantic ranking
- no task-aware memory retrieval
- no explicit temporal scoring
- no memory confidence model
- no contradiction handling
- no memory consolidation

Relevance is largely left to the LLM after bounded SQL retrieval.

---

## VidMatch

VidMatch currently performs two broad operations.

### Content ingestion

1. YouTube Data API search returns video IDs.
2. A second request retrieves:
   - title
   - description
   - tags
   - duration
   - caption availability
   - views
   - likes
3. The app infers:
   - CEFR level
   - skills
   - topics
   - accent
4. A heuristic quality score rewards:
   - captions
   - descriptions
   - tags
   - suitable duration
   - views
   - likes
5. Accepted videos are upserted into Supabase.

The system stores whether captions exist, but does **not** retrieve or index full transcripts.

### Recommendation

VidMatch retrieves up to 100 catalog entries ordered by quality and creation time, then filters using:

- exact CEFR level
- optional caption requirement
- any matching selected skill
- any matching selected topic
- exact accent match

It returns up to 12 videos, normally 6.

### Similar-video scoring

Current manually weighted score:

- Same level: +24
- Each shared skill: +18
- Each shared topic: +16
- Same accent: +10
- Same caption status: +4
- Shared tags: +4 each, up to six
- Quality contributes up to +10

### Current limitation

Viewing history does not alter the main recommendation ranking.

History is used for:

- history display
- similar-video actions
- SpeakWise context

The schema contains `click_count`, but the current history endpoint does not increment it.

---

## VocabStream

VocabStream currently retrieves learning content primarily from static lesson JSON files.

Its durable memory consists of:

- `vocabstream_lesson_attempts`
- `vocabstream_question_attempts`
- `vocabstream_user_lesson_progress`
- `vocabstream_user_mistakes`

Current personalized review:

1. Retrieve mistakes ordered by count and recency.
2. Hydrate them using the static lesson catalog.
3. Create definition and example-sentence questions.
4. Prefer distractors from:
   - the same lesson
   - then the same category

### Current limitation

This is cumulative mistake-frequency memory rather than a true spaced-repetition or learner-state system.

- Correct answers do not decrement weak-word records.
- Incorrect replay answers increase mistake counts.
- Review selection is shuffled.
- There is no explicit forgetting model.
- There is no estimated probability of recall.

---

# 3. Build a Proper Learner Memory System

This is one of the highest-value upgrades because it directly supports both Fluence and future agent-memory research.

The current pattern is roughly:

```text
SELECT recent memories
→ concatenate JSON
→ put everything into prompt
→ let LLM decide what matters
```

Replace this with a genuine learner-memory architecture.

---

## 3.1 Raw Event Store

Never throw away the original behavioral evidence.

Example schema:

```text
learner_events

user_id
event_type
source_app
entity_id
timestamp
payload
session_id
```

Possible event types:

```text
VOCAB_INCORRECT
VOCAB_CORRECT
VIDEO_IMPRESSION
VIDEO_CLICKED
VIDEO_COMPLETED
SPEAKWISE_ERROR
SPEAKWISE_CORRECTION
SPEAKWISE_LESSON_COMPLETED
GOAL_CHANGED
SKILL_ASSESSED
```

This creates an append-only behavioral foundation from which higher-level learner state can be derived.

---

## 3.2 Derived Learner State

Create a structured state table.

```text
learner_skill_state

user_id
skill
mastery_score
confidence
evidence_count
last_updated
```

Example:

```text
past_tense:
    mastery = 0.58
    confidence = 0.82
```

Possible skill dimensions:

- grammar
- vocabulary
- speaking
- pronunciation
- listening
- topic familiarity
- academic presentation
- conversational fluency

This allows retrieval and recommendation to operate on explicit learner state rather than only raw history.

---

## 3.3 Long-Term Memory Store

Create a memory table such as:

```text
learner_memories

memory_id
user_id
memory_type
content
embedding
importance
confidence
created_at
last_seen
source_event_ids
version
superseded_by
```

Possible memory types:

- persistent mistake
- learning preference
- long-term goal
- topic interest
- skill weakness
- successful learning strategy
- recent learning episode
- assessment result

Examples:

```text
Persistent mistake:
"Often forgets articles before singular nouns."

Goal:
"Wants to improve academic presentation English."

Preference:
"Prefers science and technology videos."

Learning episode:
"Struggled with past-perfect during SpeakWise lesson."
```

This creates a much richer architecture than storing only LLM-generated summaries.

---

# 4. Replace Recency-Based Memory Retrieval

SpeakWise currently retrieves fixed numbers of recent records.

For example:

```text
5 summaries
10 mistakes
8 progress records
12 incorrect attempts
6 videos
```

The problem is that recency is not equivalent to relevance.

Instead, memory retrieval should become an IR problem.

---

## 4.1 Query Construction

Suppose the current SpeakWise task is:

> "Let's practice explaining my research."

Construct a retrieval query such as:

```text
task = speaking
topic = research
skills = academic explanation
recent_errors = article usage, past tense
```

This query can be built using:

- explicit task metadata
- current conversation
- learner goal
- current app state
- current skill focus

---

## 4.2 Sparse Retrieval

Use BM25 or PostgreSQL full-text search over textual memories.

This provides lexical matching and a strong interpretable baseline.

---

## 4.3 Dense Retrieval

Create memory embeddings and retrieve with cosine similarity.

```text
cosine(query_embedding, memory_embedding)
```

This allows semantic matching even where exact words differ.

---

## 4.4 Metadata Filtering

Apply structured constraints such as:

```text
user_id = current_user
memory_type IN (...)
confidence > threshold
created_at > temporal_cutoff
```

Possible metadata filters:

- memory type
- task
- topic
- app source
- confidence
- recency
- skill
- source reliability

---

## 4.5 Temporal Scoring

Use a recency function such as:

\[
R(m) = e^{-\lambda \Delta t}
\]

where:

- \(m\) is a memory
- \(\Delta t\) is age
- \(\lambda\) controls decay

Different memory classes could use different decay rates.

For example:

- permanent learning goals decay slowly
- temporary preferences decay faster
- recent mistake episodes decay moderately

---

## 4.6 Memory Utility Score

Combine multiple signals:

\[
Score(m)=
w_1 SemanticSimilarity
+w_2 Recency
+w_3 Frequency
+w_4 Importance
+w_5 TaskMatch
+w_6 Confidence
-w_7 Staleness
\]

Possible signals:

- semantic similarity
- BM25 score
- recency
- occurrence frequency
- memory importance
- task compatibility
- current skill relevance
- confidence
- source reliability
- evidence count
- staleness
- contradiction risk

This converts SpeakWise memory retrieval into a real ranking problem.

---

# 5. Add Memory Consolidation

Memory consolidation adds significant depth.

Suppose SpeakWise observes:

```text
Lesson 1: missing articles
Lesson 2: missing articles
Lesson 3: article mistake again
Lesson 4: article mistake again
```

Rather than retaining four independent long-term memories, consolidate them.

```text
episodic observations
        ↓
cluster similar memories
        ↓
aggregate evidence
        ↓
persistent learner memory
```

Example consolidated memory:

```text
pattern: missing articles before singular nouns
count: 7
confidence: 0.91
first_seen: ...
last_seen: ...
supporting_events: [...]
```

If performance later improves:

```text
mastery ↑
error frequency ↓
```

the memory should become less prominent.

Useful concepts to demonstrate:

- episodic memory
- semantic memory
- memory consolidation
- memory decay
- confidence
- provenance
- versioning
- supersession
- temporal validity

---

# 6. Add Memory Versioning and Contradiction Handling

The system should distinguish historical facts from current learner state.

Example:

```text
Old:
CEFR = B1

New:
CEFR = B2
```

The old record should not simply disappear, but it should no longer be treated as current truth.

Possible representation:

```text
memory_id
version
valid_from
valid_to
superseded_by
status
```

Possible status values:

```text
ACTIVE
SUPERSEDED
STALE
CONTRADICTED
ARCHIVED
```

This provides a strong technical connection to safe and reliable long-horizon memory systems.

---

# 7. Make VidMatch a Real Information Retrieval System

This is likely the single biggest IR upgrade available.

Right now VidMatch mostly retrieves metadata.

The next step should be full **transcript-level retrieval**.

---

## 7.1 Transcript Ingestion

For each video, store:

```text
YouTube metadata
+
transcript
+
title
+
description
+
tags
```

Then split transcripts into passages.

```text
video
 ├── chunk 1
 ├── chunk 2
 ├── chunk 3
 └── chunk n
```

A reasonable starting point:

- 100–300 tokens per chunk
- small overlap
- retain timestamps

Schema:

```text
video_chunks

video_id
chunk_id
text
start_time
end_time
embedding
tsvector
```

---

# 8. Build Retrieval Baselines

Implement several retrieval systems and compare them experimentally.

---

## 8.1 Baseline A — BM25

```text
query
  ↓
BM25
  ↓
top 100 passages
```

This provides:

- strong lexical retrieval
- interpretable scores
- a standard IR baseline

---

## 8.2 Baseline B — Dense Retrieval

```text
query
  ↓
embedding
  ↓
pgvector cosine search
```

Dense retrieval improves semantic recall.

Potential use:

- sentence-transformer style embeddings
- OpenAI embeddings if convenient
- eventually fine-tuned bi-encoder embeddings

---

## 8.3 Baseline C — Hybrid Retrieval

Combine sparse and dense rankings using Reciprocal Rank Fusion.

\[
RRF(d)=
\sum_r \frac{1}{k+rank_r(d)}
\]

Pipeline:

```text
BM25 ranking
+
Dense ranking
↓
RRF
↓
Hybrid ranking
```

This gives a strong IR experiment:

```text
Metadata baseline       nDCG@10 = ...
BM25                    nDCG@10 = ...
Dense                   nDCG@10 = ...
Hybrid                   nDCG@10 = ...
```

---

# 9. Add Semantic Reranking

After candidate retrieval, add a reranker.

```text
query
   ↓
BM25 + dense
   ↓
100 candidates
   ↓
cross-encoder reranker
   ↓
top 10
```

This creates a modern multi-stage retrieval system.

Pipeline:

```text
Candidate generation
    BM25
    Dense
    Hybrid RRF

Candidate reranking
    Cross Encoder

Personalized reranking
    Learner state
```

This is technically much stronger than asking an LLM to rank all videos directly.

---

# 10. Add Query Expansion

Potential advanced IR improvement:

Given:

```text
"videos for explaining machine learning research"
```

generate related retrieval terms such as:

```text
academic presentation
research explanation
machine learning
technical vocabulary
presentation English
```

Compare:

```text
original query
vs
expanded query
```

Evaluate whether expansion improves:

- Recall@K
- nDCG@K
- diversity

Query expansion can initially use deterministic methods or an LLM, but it should be evaluated as an IR technique rather than treated as automatically beneficial.

---

# 11. Add Diversification

Pure ranking can result in nearly identical recommendations.

Add a diversity objective such as Maximum Marginal Relevance.

\[
MMR =
\lambda Rel(d,q)
-
(1-\lambda)\max_{d' \in S}Sim(d,d')
\]

This can reduce redundancy across:

- topics
- creators
- vocabulary
- video styles
- accents
- difficulty levels

This demonstrates understanding beyond simple relevance ranking.

---

# 12. Personalized Retrieval

The same search query should produce different results for different learners.

Example query:

> "machine learning"

### User A

```text
CEFR B1
struggles with listening speed
likes technology
```

### User B

```text
CEFR C1
wants academic vocabulary
already understands ML concepts
```

Their rankings should differ.

Possible ranking features:

```text
BM25 score
dense similarity
cross-encoder score

CEFR difference
topic-interest similarity
skill-deficit match
vocabulary difficulty
speech rate
video duration
caption availability
prior exposure
completion history
content novelty
video quality
```

This is where classical IR transitions naturally into personalized recommendation.

---

# 13. Train a Learning-to-Rank Model

This is the ML addition that should be prioritized before training a large neural model.

For each:

```text
(user, query, video)
```

create features such as:

```text
bm25_score
embedding_score
reranker_score

level_match
topic_match
skill_match

previous_clicks
previous_completion
watch_time

weakness_overlap
goal_overlap
vocabulary_overlap

video_quality
duration
views
captions
novelty
```

Possible relevance labels:

```text
0 = shown but ignored
1 = clicked
2 = watched substantially
3 = completed
4 = completed + positively rated
```

A strong first learned ranker:

```text
LightGBM LambdaRank
```

or:

```text
XGBoost ranking
```

Final recommendation pipeline:

```text
Retrieval
    ↓
100 candidates

Semantic reranking
    ↓
30 candidates

ML personalized ranker
    ↓
6 recommendations
```

This provides a strong combined **IR + ML + RecSys** portfolio project.

---

# 14. Train a Neural Retrieval Model Later

This should be a stretch goal after the classical system works.

A possible architecture:

```text
User tower                     Video tower

learner state                  transcript
recent mistakes               title
interests                     topic
history                       level

       ↓                           ↓
 embedding                    embedding
       └──────── cosine ──────────┘
```

Training data:

```text
positive:
user watched/completed video

negative:
video was shown but skipped
```

Potential objective:

- contrastive loss
- InfoNCE
- sampled softmax

Compare:

```text
BM25
Dense pretrained
Hybrid
Two-tower personalized retrieval
Hybrid + learned reranking
```

This provides legitimate recommender-system ML experience.

---

# 15. Upgrade VocabStream Beyond Mistake Counting

Current logic is approximately:

```text
wrong answer
→ mistake_count += 1
```

This is useful as a baseline but relatively shallow.

Convert vocabulary review into a ranking problem.

Estimate:

\[
P(correct \mid user, word, time)
\]

Possible features:

```text
number_previous_attempts
correct_attempts
incorrect_attempts
time_since_last_seen
time_since_last_error
word difficulty
lesson difficulty
recent SpeakWise usage
recent video occurrences
current mastery estimate
```

Then:

\[
P(forgetting) = 1 - P(correct)
\]

Use predicted forgetting risk when deciding what to review.

---

# 16. Compare Vocabulary Review Algorithms

Build multiple baselines.

```text
Mistake frequency
→ Spaced repetition heuristic
→ SM-2
→ FSRS-like heuristic
→ ML predicted recall
```

Evaluate which produces:

- better delayed recall
- lower review burden
- faster mastery
- fewer redundant reviews

This produces a clean machine-learning and ranking experiment.

---

# 17. Add Knowledge Tracing

A more research-oriented extension is learner-state modeling through knowledge tracing.

Possible starting point:

### Bayesian Knowledge Tracing

For each skill, estimate:

```text
P(skill mastered)
P(guess)
P(slip)
P(learn)
```

This creates a probabilistic representation of learner mastery.

Potential later extensions:

- Deep Knowledge Tracing
- Transformer-based knowledge tracing
- skill graph modeling

This is optional, but it could become a strong ML research extension.

---

# 18. Make the Applications Affect Each Other

Currently the memory flow is mostly one-way.

```text
VocabStream ──┐
              ├──→ SpeakWise
VidMatch ─────┘

SpeakWise ─X→ VidMatch
SpeakWise ─X→ VocabStream
VocabStream ─X→ VidMatch
```

Replace this with a shared learner-state architecture.

```text
              Unified Learner State
                      ↕
       ┌──────────────┼──────────────┐
       ↓              ↓              ↓
  SpeakWise       VidMatch      VocabStream
       ↕              ↕              ↕
       └──────────────┼──────────────┘
```

Example:

```text
SpeakWise detects:
repeated difficulty with past-perfect tense
```

This should influence VidMatch:

```text
recommend videos containing
past-perfect examples
```

and VocabStream:

```text
increase related review
```

Later:

```text
VocabStream performance ↑
        ↓
learner mastery ↑
        ↓
SpeakWise stops emphasizing it
```

This demonstrates real longitudinal personalization.

---

# 19. Create a Unified Learner Representation

A possible unified state object:

```json
{
  "user_id": "...",
  "goals": [],
  "topic_interests": [],
  "skill_state": {},
  "vocabulary_state": {},
  "recent_activity": [],
  "persistent_mistakes": [],
  "content_history": [],
  "preferences": {},
  "confidence": {},
  "last_updated": "..."
}
```

This object should be derived from persistent tables rather than manually stored as one giant JSON blob.

Advantages:

- queryability
- versioning
- explainability
- easier experiments
- feature generation
- model training

---

# 20. Evaluation Must Become a First-Class Component

Create a dedicated evaluation structure.

```text
evaluation/
    ir/
    recommendation/
    memory/
    learner_model/
    datasets/
    qrels/
    experiments/
```

Every major algorithmic improvement should have a measurable baseline.

---

# 21. Build an IR Benchmark

Create perhaps 50–100 realistic information needs.

Example:

```text
User:
B2 English
interested in AI
struggles with academic listening

Information need:
video explaining neural networks
with intermediate vocabulary
and captions
```

Label videos:

```text
0 = irrelevant
1 = somewhat relevant
2 = relevant
3 = highly relevant
```

Metrics:

- Precision@K
- Recall@K
- MRR
- MAP
- nDCG@K

Example result table:

| Retrieval system | nDCG@10 | Recall@20 | Latency |
|---|---:|---:|---:|
| Metadata rules | ... | ... | ... |
| BM25 | ... | ... | ... |
| Dense | ... | ... | ... |
| Hybrid | ... | ... | ... |
| Hybrid + reranker | ... | ... | ... |
| Personalized ranker | ... | ... | ... |

This is one of the most important parts of making the project look like serious IR work.

---

# 22. Create a Memory Benchmark

Create synthetic learner histories where the correct memory is known.

---

## 22.1 Recency

```text
Old:
user wants business English

New:
user changed goal to academic English
```

Expected behavior:

- retrieve the new goal
- suppress the old goal as current truth

---

## 22.2 Contradiction

```text
previous level: B1
latest assessment: B2
```

Expected behavior:

- B2 should be current
- B1 can remain in provenance/history
- B1 should not drive current personalization

---

## 22.3 Long-Tail Memory

```text
user repeatedly made article mistakes
but has not made one for several sessions
```

Expected behavior:

- retain the pattern
- reduce its retrieval priority
- potentially mark the skill as improving

---

## 22.4 Irrelevance

Current task:

```text
academic presentation
```

Memory:

```text
old restaurant vocabulary lesson
```

Expected behavior:

- irrelevant memory should not be retrieved

---

# 23. Memory Evaluation Metrics

Possible metrics:

```text
Memory Recall@K
Memory Precision@K
MRR
nDCG@K
Contradiction rejection rate
Stale-memory rate
Irrelevant-memory rate
Prompt tokens used
Memory retrieval latency
Downstream answer quality
```

Additional useful measurements:

- percentage of prompt context actually used
- duplicate memory rate
- memory compression ratio
- memory consolidation accuracy
- retrieval stability across paraphrased queries

---

# 24. Evaluate Recommendation Quality

Recommendation metrics could include:

- Precision@K
- Recall@K
- nDCG@K
- Hit Rate
- Mean Reciprocal Rank
- Coverage
- Diversity
- Novelty
- Calibration

Eventually, with real usage data:

- click-through rate
- watch-time
- completion rate
- return rate
- learning outcome improvement

---

# 25. Build an IR and Memory Debugging Dashboard

This is a strong software-engineering and demo component.

Create an internal page such as:

```text
/experiments
```

Allow input of:

```text
User
Query
Current task
```

Then display rankings.

Example:

```text
BM25
────────────────
video A  13.81
video B  12.92

Dense
────────────────
video B  .883
video D  .857

Hybrid
────────────────
video B  .041
video A  .037

Reranker
────────────────
video B  .92
video D  .87

Personalized Ranker
────────────────
video D  .91
video B  .84
```

Also display retrieved learner memories:

```text
Retrieved Learner Memories

[0.91] Difficulty: articles
[0.87] Goal: academic presentation
[0.72] Interest: machine learning
```

This makes the system observable rather than hiding everything behind LLM output.

---

# 26. Add Ranking Explanation

For each recommendation, show why it was selected.

Example:

```text
Recommended because:

+ High semantic relevance
+ Matches learner topic interest: AI
+ Appropriate CEFR difficulty
+ Contains captions
+ Addresses recent listening weakness
- Similar video watched recently
```

This makes the recommendation system:

- interpretable
- debuggable
- easier to evaluate
- easier to discuss in interviews

---

# 27. Add Proper Impression Logging

Do not only store clicks.

You need to know what users were actually shown.

Schema:

```text
recommendation_impression

user_id
request_id
item_id
rank
retrieval_method
score
timestamp
experiment_id
```

Then interaction table:

```text
recommendation_interaction

request_id
item_id
clicked
watch_time
completed
liked
timestamp
```

This prevents the fundamental ambiguity between:

> The user did not click the video.

and:

> The user was never shown the video.

This is critical for training recommenders.

---

# 28. Add Experiment Tracking

Every retrieval or ranking request should optionally log:

```text
experiment_id
retrieval_version
embedding_model
reranker_version
ranker_version
feature_version
```

Possible tooling:

- MLflow
- Weights & Biases
- lightweight custom experiment tables

This allows reproducible comparison across algorithms.

---

# 29. Engineering Architecture

Keep most of the existing stack.

```text
Frontend
Next.js / React

        ↓

FastAPI
--------------------------------
Retrieval Service
Memory Service
Recommendation Service
ML Inference Service
--------------------------------

        ↓

Supabase PostgreSQL
+ pgvector
+ Postgres FTS

        ↓

Async workers
--------------------------------
transcript ingestion
embedding generation
memory consolidation
feature generation
model training
--------------------------------
```

Recommended initial stack:

- Next.js
- React
- FastAPI
- Supabase
- PostgreSQL
- pgvector
- PostgreSQL full-text search
- OpenAI API where useful
- LightGBM / XGBoost
- PyTorch for neural experiments

---

# 30. Postgres First, OpenSearch Later

Initially use:

```text
PostgreSQL FTS
+
pgvector
```

This avoids unnecessary infrastructure complexity.

Later, once the benchmark exists, compare:

```text
Postgres retrieval
vs
OpenSearch BM25
```

Possible reasons to introduce OpenSearch:

- larger indexes
- production-grade BM25
- advanced filters
- analyzers
- lexical search tuning
- search observability

This creates a convincing engineering decision rather than adding infrastructure only for appearance.

---

# 31. Async Indexing Pipeline

Content ingestion should become asynchronous.

Example:

```text
YouTube video discovered
        ↓
save metadata
        ↓
enqueue transcript ingestion
        ↓
fetch transcript
        ↓
clean transcript
        ↓
chunk transcript
        ↓
generate embeddings
        ↓
build lexical index
        ↓
mark searchable
```

This can be implemented using:

- background workers
- job queues
- retry logic
- idempotent tasks
- ingestion states

Example states:

```text
DISCOVERED
METADATA_READY
TRANSCRIPT_READY
EMBEDDING_READY
INDEXED
FAILED
```

This demonstrates practical software-engineering depth.

---

# 32. Add Data and Model Versioning

Store versions for:

- embeddings
- chunking strategies
- ranking models
- prompts
- memory summarizers
- recommendation features
- learner-state algorithms

Example:

```text
embedding_model_version
chunking_version
ranker_version
memory_schema_version
```

This enables meaningful ablation studies.

---

# 33. Add Typed APIs

Use strict typed request and response contracts.

Examples:

```text
POST /retrieve/videos
POST /retrieve/memories
POST /recommend/videos
POST /recommend/vocabulary
GET  /learner/state
GET  /experiments/{id}
```

Use:

- Pydantic
- TypeScript interfaces
- generated API clients if useful
- explicit schemas
- validation

This improves maintainability and demonstrates software-engineering maturity.

---

# 34. Add Tests

Important test layers:

## Unit tests

- ranking functions
- temporal decay
- consolidation logic
- feature extraction

## Integration tests

- Supabase reads/writes
- pgvector retrieval
- transcript indexing
- authentication

## Retrieval regression tests

For known queries:

```text
query X
must retrieve item Y in top 10
```

## Memory regression tests

Given a synthetic learner history:

```text
memory A should rank above memory B
```

## API tests

- invalid tokens
- missing fields
- database failures
- empty retrieval results

---

# 35. Add Failure Visibility

One existing issue is that Supabase read failures can become empty arrays, which can look like "no memory."

Instead distinguish:

```text
EMPTY_RESULT
DATABASE_ERROR
TABLE_MISSING
AUTH_ERROR
TIMEOUT
```

This is important both for engineering quality and memory-system reliability.

---

# 36. Add Data Quality Checks

For videos:

- transcript exists
- language correct
- metadata complete
- duplicate content
- invalid duration
- spam
- missing captions

For learner memory:

- duplicate memories
- invalid confidence
- impossible timestamps
- broken provenance
- contradictory active states

For recommendation logs:

- missing impressions
- orphan interactions
- invalid ranks
- duplicated request IDs

---

# 37. Suggested Development Progression

## Phase 1 — Retrieval Foundation

Build:

- transcript ingestion
- transcript chunking
- BM25
- embeddings
- hybrid RRF
- qrels
- Recall/MRR/nDCG evaluation

This creates the core IR portfolio component.

### Deliverable

A benchmark comparing:

```text
metadata rules
BM25
dense
hybrid
```

---

## Phase 2 — Real Learner Memory

Replace fixed recent-record retrieval with:

- event store
- structured memories
- embeddings
- temporal scoring
- task-aware retrieval
- provenance
- consolidation

### Deliverable

A memory retrieval benchmark comparing:

```text
recent-N SQL
semantic retrieval
semantic + temporal
semantic + temporal + metadata
```

---

## Phase 3 — Cross-App Learner State

Build:

```text
SpeakWise
↕
Unified learner state
↕
VidMatch + VocabStream
```

### Deliverable

Demonstrate that behavior in one application affects recommendations in the others.

---

## Phase 4 — Learning to Rank

Add:

- impression logging
- interaction logging
- feature extraction
- LightGBM LambdaRank

Compare against the manually weighted VidMatch ranking.

### Deliverable

```text
heuristic ranking
vs
learned ranking
```

with nDCG and engagement metrics.

---

## Phase 5 — Vocabulary Mastery Model

Implement:

```text
mistake frequency
→ spaced-repetition baseline
→ predicted recall model
```

### Deliverable

Evaluate how well each method predicts future errors and prioritizes review.

---

## Phase 6 — Advanced Retrieval

Add:

- cross-encoder reranking
- query expansion
- MMR/diversification
- multi-query retrieval
- personalized query construction

Potentially fine-tune the reranker.

---

## Phase 7 — Neural Recommendation

After the classical infrastructure is stable:

```text
two-tower user/video model
```

Compare:

```text
BM25
dense
hybrid
LambdaRank
two-tower
```

---

# 38. Most Important Four Upgrades

If implementation time is limited, prioritize these:

## 1. Transcript-Level Hybrid Retrieval

Implement:

```text
BM25
+
dense retrieval
+
RRF
```

and evaluate it using a real qrels benchmark.

This is the strongest direct IR improvement.

---

## 2. Structured Longitudinal Memory

Replace fixed recent SQL records with:

```text
event store
+
structured memories
+
semantic retrieval
+
temporal ranking
+
memory consolidation
```

This creates a serious agent-memory component.

---

## 3. Learning-to-Rank Recommender

Train a LightGBM LambdaRank model using:

- IR scores
- learner state
- history
- difficulty
- topic overlap
- content metadata

This is the strongest practical ML + recommender-system upgrade.

---

## 4. Experiment and Debug Dashboard

Show:

- BM25 results
- dense results
- RRF fusion
- reranker scores
- final personalized rank
- retrieved memories
- ranking features
- evaluation metrics

This makes all the technical depth visible.

---

# 39. Final Architecture Vision

```text
                         USER
                          │
              ┌───────────┴───────────┐
              │                       │
        Current intent          Learner history
              │                       │
              ↓                       ↓
      Query understanding      Memory retrieval
              │                       │
              └──────────┬────────────┘
                         ↓
                  Candidate retrieval
                 BM25 + dense retrieval
                         ↓
                     RRF fusion
                         ↓
                 Semantic reranker
                         ↓
              Personalized ML ranker
                         ↓
                  Recommendation
                         ↓
       ┌─────────────────┼────────────────┐
       ↓                 ↓                ↓
    VidMatch         VocabStream       SpeakWise
       │                 │                │
       └─────────────────┼────────────────┘
                         ↓
                  learner events
                         ↓
             longitudinal learner state
```

---

# 40. Final Portfolio Positioning

Instead of describing Fluence as:

> "An AI-powered language-learning application."

A stronger technical description is:

> **Project Fluence is a longitudinal personalized information retrieval and recommendation platform for language learning. It combines hybrid lexical-semantic retrieval, structured learner memory, temporal state modeling, learning-to-rank, and cross-application recommendation across conversational tutoring, vocabulary learning, and video retrieval.**

Possible technical keywords:

```text
Information Retrieval
BM25
Dense Retrieval
Hybrid Retrieval
RRF
Cross-Encoder Reranking
Learning to Rank
LightGBM LambdaRank
Recommendation Systems
Learner Modeling
Knowledge Tracing
Longitudinal Memory
Temporal Retrieval
Memory Consolidation
pgvector
PostgreSQL FTS
Supabase
FastAPI
Next.js
Experiment Tracking
Offline Evaluation
nDCG
MRR
Recall@K
```

---

# 41. Strong Final Research / Engineering Story

The complete project can be framed as answering:

> **How can a learning system retrieve the right content and the right learner memories at the right time, and use them to make personalized recommendations over long periods of interaction?**

The project would combine four technical layers:

```text
1. INFORMATION RETRIEVAL
   BM25
   dense retrieval
   hybrid fusion
   reranking

2. MEMORY MANAGEMENT
   event storage
   structured memory
   consolidation
   temporal scoring
   contradiction handling

3. MACHINE LEARNING + RECOMMENDATION
   learning to rank
   mastery prediction
   neural retrieval
   personalized recommendation

4. SOFTWARE ENGINEERING
   typed APIs
   asynchronous indexing
   versioning
   tests
   experiment tracking
   observability
```

This would turn Project Fluence from a collection of language-learning apps into a coherent technical system with substantial depth in:

- IR
- ML
- recommender systems
- agent memory
- longitudinal personalization
- production software engineering
