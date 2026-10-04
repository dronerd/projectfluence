#!/usr/bin/env node
/** Exports every answer substitution for editorial review. It does not certify semantics. */
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exampleGapChoices, normalizeWord, sentenceChoices } from "../apps/vocabstream/src/lib/questionPolicy.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/vocabstream/data");
const reviewed = [], generated = [], errors = [];
for (const category of (await readdir(root)).sort()) {
  for (const filename of (await readdir(path.join(root, category))).filter(name => /^Lesson\d+\.json$/.test(name)).sort()) {
    const lesson = JSON.parse(await readFile(path.join(root, category, filename), "utf8"));
    for (const word of lesson.words) {
      const location = `${category}/${filename}:${word.word}`;
      if (!word.sentencePractice) {
        const gap = exampleGapChoices(word, lesson.words);
        if (!gap) {
          errors.push({ location, reason: "No usable example sentence gap or distinct option set." });
          continue;
        }
        generated.push({
          location, prompt: gap.prompt, correctAnswer: gap.answer,
          substitutions: gap.choices.map(answer => ({ answer, sentence: gap.prompt.replace("____", answer), intended: answer === gap.answer })),
          reason: "Automatically generated; context and alternative answers need editorial review.",
          unique_answer: null,
        });
        continue;
      }
      const practice = word.sentencePractice;
      const valid = sentenceChoices(word);
      const alternatives = Array.isArray(practice.distractors) ? practice.distractors : [];
      const synonyms = (word.synonyms ?? "").split(/[,;\/、]+/).map(normalizeWord);
      const likelyAlternatives = alternatives.filter(choice => synonyms.includes(normalizeWord(choice)));
      if (!valid) errors.push({ location, reason: "Malformed gap or unsafe/revealed/duplicate answer labels." });
      if (likelyAlternatives.length) errors.push({ location, reason: "A listed synonym may also answer the question." });
      reviewed.push({
        location, correctAnswer: word.word, prompt: practice.prompt,
        substitutions: [word.word, ...alternatives].map(answer => ({ answer, sentence: practice.prompt.replace("____", answer), intended: answer === word.word })),
        editorialReason: practice.reviewNote,
        // Static string checks cannot prove grammar, naturalness or unique semantic correctness.
        unique_answer: valid && !likelyAlternatives.length ? null : false,
        plausible_alternatives: likelyAlternatives,
        reason: valid ? "Structurally valid. Check all completed sentences against the editorial reason." : "Fails structural checks.",
        suggested_fix: valid ? "If another answer is reasonable, sharpen the context or replace it; do not merely mark it wrong." : "Repair the gap/choices or remove sentencePractice until reviewed.",
      });
    }
  }
}
const report = { reviewedItems: reviewed.length, generatedItems: generated.length, errors, reviewed, ...(process.argv.includes("--include-generated") ? { generated } : {}) };
const outputIndex = process.argv.indexOf("--output");
if (outputIndex >= 0) {
  if (!process.argv[outputIndex + 1]) throw new Error("--output requires a file path");
  await writeFile(process.argv[outputIndex + 1], JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify({ reviewedItems: reviewed.length, generatedItems: generated.length, errors, semanticCertification: false }, null, 2));
if (errors.length) process.exitCode = 1;
