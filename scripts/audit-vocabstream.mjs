#!/usr/bin/env node
/** Audit every lesson and protect the original identities while allowing appended courses. */
import { readFile, readdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.join(root, "public/vocabstream/data");
const baseline = JSON.parse(await readFile(path.join(root, "scripts/vocabstream-baseline.json"), "utf8"));
const errors = [];
const files = new Map();
const entries = [];
const normalize = (value) => (typeof value === "string" ? value : "").trim().toLowerCase().replace(/\s+/g, " ");
const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const issue = (location, message) => errors.push({ location, message });
const isText = (value) => typeof value === "string" && value.trim().length > 0;

for (const category of (await readdir(dataRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  const directory = path.join(dataRoot, category.name);
  const names = (await readdir(directory)).filter((name) => /^Lesson\d+\.json$/.test(name)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  for (const name of names) {
    const relativePath = `public/vocabstream/data/${category.name}/${name}`;
    let lesson;
    try { lesson = JSON.parse(await readFile(path.join(directory, name), "utf8")); }
    catch { issue(relativePath, "Lesson must be valid JSON."); continue; }
    files.set(relativePath, lesson);
    if (!isText(lesson.lesson_id) || !isText(lesson.title) || !Array.isArray(lesson.words) || !lesson.words.length) {
      issue(relativePath, "Lesson requires lesson_id, title, and a nonempty words array.");
      continue;
    }
    for (const [index, word] of lesson.words.entries()) {
      const location = `${relativePath}#${index + 1}`;
      if (!word || typeof word !== "object") { issue(location, "Entry must be an object."); continue; }
      for (const field of ["word", "meaning", "japaneseMeaning", "example"]) {
        if (!isText(word[field])) issue(location, `Missing ${field}.`);
      }
      for (const field of ["synonyms", "antonyms", "forms", "explanation", "usageNote", "domain"]) {
        if (word[field] !== undefined && typeof word[field] !== "string") issue(location, `${field} must be a string.`);
      }
      if (!isText(word.word)) continue;
      const aliases = new Set([normalize(word.word), ...(typeof word.synonyms === "string" ? word.synonyms : "").split(/[,;]/).map(normalize)].filter(Boolean));
      const validateDistractors = (values, label) => {
        if (!Array.isArray(values) || values.length !== 2 || !values.every(isText) || new Set(values.map(normalize)).size !== 2 || values.some((value) => aliases.has(normalize(value)))) {
          issue(location, `${label} requires two distinct distractors, excluding the target and its listed synonyms.`);
        }
      };
      if (word.sentencePractice !== undefined) {
        const practice = word.sentencePractice;
        if (!practice || typeof practice !== "object" || !isText(practice.prompt) || (practice.prompt.match(/____/g) || []).length !== 1 || !isText(practice.reviewNote)) {
          issue(location, "sentencePractice requires one ____ blank and an editorial reviewNote.");
        } else {
          if (practice.prompt.replace("____", "").trim().length < 12) issue(location, "Sentence practice requires meaningful context.");
          validateDistractors(practice.distractors, "sentencePractice");
        }
      }
      if (word.meaningDistractors !== undefined) validateDistractors(word.meaningDistractors, "meaningDistractors");
      if (word.image) {
        const image = word.image;
        if (!["src", "alt", "source", "sourceUrl", "creator"].every((field) => isText(image[field])) || !["CC0-1.0", "CC-BY-4.0"].includes(image.license) || !Number.isFinite(image.width) || image.width <= 0 || !Number.isFinite(image.height) || image.height <= 0) issue(location, "Image requires provenance, a supported license, alternative text, and positive dimensions.");
        if (image.license === "CC-BY-4.0" && (!isText(image.credit) || image.licenseUrl !== "https://creativecommons.org/licenses/by/4.0/")) issue(location, "CC BY artwork requires displayed attribution and the license URL.");
        if (typeof image.src !== "string" || !image.src.startsWith("/vocabstream/images/") || image.src.includes("..")) issue(location, "Image source must remain inside the public VocabStream image directory.");
        else { try { await access(path.join(root, "public", image.src)); } catch { issue(location, "Image source does not exist."); } }
      }
      if (word.definitionType && !["text", "image", "image+text"].includes(word.definitionType)) issue(location, "Unsupported definitionType.");
      if (word.imageRole !== undefined && !["meaning", "supporting"].includes(word.imageRole)) issue(location, "Unsupported imageRole.");
      if (word.imageRole && !word.image) issue(location, "An image role requires image metadata.");
      if (word.imageRole === "supporting" && word.definitionType !== "image+text") issue(location, "Supporting diagrams must retain their text definition.");
      if (["image", "image+text"].includes(word.definitionType) && !word.image) issue(location, "Visual definitions require image metadata.");
      entries.push({ category: category.name, lessonNumber: Number(name.match(/\d+/)[0]), position: index + 1, path: relativePath, ...word });
    }
  }
}

for (const original of baseline.files) {
  const lesson = files.get(original.path);
  if (!lesson) { issue(original.path, "An original lesson was removed."); continue; }
  if (lesson.lesson_id !== original.lessonId) issue(original.path, "Original lesson_id changed.");
  if (JSON.stringify(lesson.words?.map((word) => word.word)) !== JSON.stringify(original.words)) issue(original.path, "Original word string, position, or entry count changed.");
}
for (const entry of entries.filter((entry) => entry.duplicateOf)) {
  const reference = entry.duplicateOf;
  const target = entries.find((candidate) => candidate.category === reference.category && candidate.lessonNumber === reference.lessonNumber && candidate.word === reference.word);
  if (!target || target === entry || target.category !== entry.category || normalize(target.word) !== normalize(entry.word) || normalize(target.meaning) !== normalize(entry.meaning) || target.japaneseMeaning !== entry.japaneseMeaning) {
    issue(`${entry.path}#${entry.position}`, "duplicateOf must point to the same documented sense in another entry of this course.");
  }
}

const groups = (values, key) => {
  const result = new Map();
  for (const value of values) { const id = key(value); result.set(id, [...(result.get(id) || []), value]); }
  return result;
};
const categories = {};
for (const [category, rows] of groups(entries, (entry) => entry.category)) {
  const wordGroups = groups(rows, (entry) => normalize(entry.word));
  const senseGroups = groups(rows, (entry) => `${normalize(entry.word)}\0${normalize(entry.meaning)}`);
  categories[category] = {
    lessons: new Set(rows.map((entry) => entry.lessonNumber)).size, entries: rows.length,
    uniqueHeadwords: wordGroups.size, exactWordAndDefinitionPairs: senseGroups.size,
    repeatedWordOccurrences: rows.length - wordGroups.size, repeatedSenseOccurrences: rows.length - senseGroups.size,
    curatedSentencePractice: rows.filter((entry) => entry.sentencePractice).length,
    reviewedDuplicateReferences: rows.filter((entry) => entry.duplicateOf).length,
    images: rows.filter((entry) => entry.image).length,
  };
}
const lessonContent = groups([...files.entries()], ([, lesson]) => fingerprint(lesson.words));
const repeatedLessons = [...lessonContent.values()].filter((group) => group.length > 1).map((group) => ({ count: group.length, paths: group.map(([name]) => name) }));
const withinLessonDuplicates = [...groups(entries, (entry) => `${entry.path}\0${normalize(entry.word)}`).values()].filter((group) => group.length > 1).map((group) => ({ path: group[0].path, word: group[0].word, positions: group.map((entry) => entry.position) }));
const report = {
  files: files.size, entries: entries.length, originalFilesProtected: baseline.files.length,
  originalEntriesProtected: baseline.files.reduce((count, file) => count + file.words.length, 0),
  categories, repeatedLessons, withinLessonDuplicates, errors,
  limitations: "Every entry is structurally inspected. Duplicate counts compare strings, not independently reviewed linguistic senses. Semantics and distractor ambiguity require editorial review. Existing scaffold idiom lessons are retained for historical identity.",
};
const outputIndex = process.argv.indexOf("--output");
if (outputIndex >= 0) {
  const output = process.argv[outputIndex + 1];
  if (!output) throw new Error("--output requires a file path");
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ files: report.files, entries: report.entries, originalEntriesProtected: report.originalEntriesProtected, categories, errors }, null, 2));
if (errors.length) process.exitCode = 1;
