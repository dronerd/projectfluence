import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { allCourses, courseLessonNumbers, idiomCourses, vocabularyCourses } from "./catalog.ts";
import { makeLessonQuestions } from "./learning.ts";
import type { LessonData } from "./content.ts";

const data = new URL("../../../../public/vocabstream/data/", import.meta.url);
test("existing courses retain all addresses; new expressions use appended lesson numbers", async () => {
  assert.equal(new Set(allCourses.map(course => course.id)).size, allCourses.length);
  const baseline = JSON.parse(await readFile(new URL("../../../../scripts/vocabstream-baseline.json", import.meta.url), "utf8"));
  for (const [id, level] of Object.entries(baseline.courseLevels)) {
    assert.equal(allCourses.find(course => course.id === id)?.level, level, `${id}: original course level changed`);
  }
  for (const course of vocabularyCourses) {
    assert.equal(courseLessonNumbers(course).length, 100);
    assert.deepEqual(courseLessonNumbers(course, true), courseLessonNumbers(course), "stale archive state cannot empty a word course");
  }
  for (const course of idiomCourses) {
    assert.deepEqual(courseLessonNumbers(course), [51, 52, 53, 54, 55]);
    assert.deepEqual(courseLessonNumbers(course, true), Array.from({ length: 50 }, (_, i) => i + 1));
  }
});

test("every advertised lesson exists and every new item has a usable reviewed choice set", async () => {
  let newItems = 0;
  for (const course of allCourses) {
    const names = await readdir(new URL(`${course.id}/`, data));
    assert.equal(names.filter(name => /^Lesson\d+\.json$/.test(name)).length, course.lessons);
    for (const number of courseLessonNumbers(course)) {
      const lesson: LessonData = JSON.parse(await readFile(new URL(`${course.id}/Lesson${number}.json`, data), "utf8"));
      if (course.id.startsWith("word-")) continue;
      assert.equal(lesson.words.length, 10);
      assert.equal(lesson.lesson_id, `${course.id}-lesson-${number}`);
      const questions = makeLessonQuestions(lesson, `${course.id}-lesson-${number}`);
      assert.equal(questions.filter(question => question.questionType === "meaning").length, 10);
      assert.equal(questions.filter(question => question.questionType === "quiz").length, lesson.words.filter(word => word.sentencePractice).length);
      for (const word of lesson.words) {
        assert.equal(word.meaningDistractors?.length, 2);
        if (course.id.startsWith("idioms-")) { assert.ok(word.word.includes(" ")); assert.ok(word.expressionType); }
        else assert.equal(word.domain, course.id.replace("specialized-", ""));
      }
      newItems += lesson.words.length;
    }
  }
  assert.equal(newItems, 380);
});

test("the complete corpus produces valid options and never silently drops reviewed practice or illustrations", async () => {
  let inspected = 0;
  for (const course of allCourses) {
    for (let number = 1; number <= course.lessons; number++) {
      const lesson: LessonData = JSON.parse(await readFile(new URL(`${course.id}/Lesson${number}.json`, data), "utf8"));
      const questions = makeLessonQuestions(lesson, `${course.id}-lesson-${number}`);
      assert.equal(new Set(questions.map(question => question.id)).size, questions.length);
      for (const question of questions) {
        assert.equal(new Set(question.choices.map(choice => choice.normalize("NFKC").toLowerCase())).size, question.choices.length);
        assert.equal(question.choices[question.answerIndex], question.correctAnswer);
      }
      for (const word of lesson.words) {
        const own = questions.filter(question => question.word === word.word);
        if (word.meaningDistractors) assert.ok(own.some(question => question.questionType === "meaning"), `${course.id}/${number}/${word.word}: explicit meaning pair rejected`);
        if (word.sentencePractice) assert.ok(own.some(question => question.questionType === "quiz"), `${course.id}/${number}/${word.word}: curated gap rejected`);
        if (word.image) assert.ok(own.some(question => question.promptMode === "image"), `${course.id}/${number}/${word.word}: image rejected`);
        inspected++;
      }
    }
  }
  assert.equal(inspected, 6379);
});
