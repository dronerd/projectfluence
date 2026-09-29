import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const source = path.join(path.dirname(fileURLToPath(import.meta.url)), "audit-vocabstream.mjs");
async function fixture(run) {
  const directory = await mkdtemp(path.join(tmpdir(), "vocab-audit-test-"));
  const relativePath = "public/vocabstream/data/word-beginner/Lesson1.json";
  const original = { lesson_id: "original-1", title: "Lesson 1", words: [
    { word: "apple", meaning: "a fruit", japaneseMeaning: "りんご", example: "I ate an apple.", synonyms: "" },
    { word: "knife", meaning: "a cutting tool", japaneseMeaning: "ナイフ", example: "Use a knife.", synonyms: "" },
  ] };
  try {
    await mkdir(path.join(directory, "scripts"), { recursive: true });
    await mkdir(path.dirname(path.join(directory, relativePath)), { recursive: true });
    await copyFile(source, path.join(directory, "scripts/audit-vocabstream.mjs"));
    await writeFile(path.join(directory, "scripts/vocabstream-baseline.json"), JSON.stringify({ files: [{ path: relativePath, lessonId: "original-1", words: ["apple", "knife"] }] }));
    const write = (lesson) => writeFile(path.join(directory, relativePath), JSON.stringify(lesson));
    await write(original);
    const audit = async () => {
      const output = path.join(directory, "report.json");
      const child = spawnSync(process.execPath, [path.join(directory, "scripts/audit-vocabstream.mjs"), "--output", output], { encoding: "utf8" });
      return { status: child.status, report: JSON.parse(await readFile(output, "utf8")) };
    };
    await run({ original, write, audit, directory });
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test("audit permits corrected definitions and appended lessons while protecting original identity", async () => fixture(async ({ original, write, audit, directory }) => {
  original.words[0].meaning = "a round fruit with seeds at its center";
  await write(original);
  await writeFile(path.join(directory, "public/vocabstream/data/word-beginner/Lesson2.json"), JSON.stringify({ ...original, lesson_id: "new-2", title: "Lesson 2" }));
  const result = await audit();
  assert.equal(result.status, 0);
  assert.equal(result.report.originalEntriesProtected, 2);
  assert.equal(result.report.entries, 4);
}));

test("audit rejects reordered words and changed lesson IDs", async () => fixture(async ({ original, write, audit }) => {
  original.lesson_id = "replacement";
  original.words.reverse();
  await write(original);
  const result = await audit();
  assert.equal(result.status, 1);
  assert.ok(result.report.errors.some((error) => error.message.includes("lesson_id changed")));
  assert.ok(result.report.errors.some((error) => error.message.includes("word string, position")));
}));

test("audit rejects malformed curated choices and dangling duplicate references", async () => fixture(async ({ original, write, audit }) => {
  original.words[0].sentencePractice = { prompt: "Pick this fruit for lunch.", distractors: ["apple", "knife"], reviewNote: "Reviewed" };
  original.words[1].meaningDistractors = ["KNIFE", "spoon"];
  original.words[1].duplicateOf = { category: "word-beginner", lessonNumber: 99, word: "knife" };
  await write(original);
  const result = await audit();
  assert.equal(result.status, 1);
  assert.ok(result.report.errors.some((error) => error.message.includes("one ____ blank")));
  assert.ok(result.report.errors.some((error) => error.message.includes("distinct distractors")));
  assert.ok(result.report.errors.some((error) => error.message.includes("duplicateOf")));
}));
