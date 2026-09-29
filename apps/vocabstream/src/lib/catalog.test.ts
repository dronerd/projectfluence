import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { allCourses, courseLessonNumbers, idiomCourses, vocabularyCourses, displayLessonNumber, lessonLabel } from "./catalog.ts";
import { meaningChoices, normalizeWord } from "./questionPolicy.ts";
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
    assert.deepEqual(courseLessonNumbers(course), Array.from({ length: 10 }, (_, i) => 51 + i));
    assert.deepEqual(courseLessonNumbers(course, true), Array.from({ length: 50 }, (_, i) => i + 1));
  }
});

test("idioms display from Lesson 1 without reusing legacy progress identities", () => {
  for (const course of idiomCourses) {
    assert.deepEqual(courseLessonNumbers(course).map(number => displayLessonNumber(course.id, number)), Array.from({ length: 10 }, (_, i) => i + 1));
    assert.equal(lessonLabel(course.id, 51), "Lesson 1");
    assert.equal(lessonLabel(course.id, 60), "Lesson 10");
    assert.equal(lessonLabel(course.id, 1), "以前の Lesson 1");
    assert.equal(lessonLabel(course.id, 50), "以前の Lesson 50");
  }
  assert.equal(lessonLabel("word-beginner", 51), "Lesson 51");
  assert.equal(lessonLabel("specialized-it", 1), "Lesson 1");
});

test("every advertised lesson exists and every new item has a usable reviewed choice set", async () => {
  let newItems = 0;
  for (const course of allCourses) {
    const currentWords = [];
    const names = await readdir(new URL(`${course.id}/`, data));
    assert.equal(names.filter(name => /^Lesson\d+\.json$/.test(name)).length, course.lessons);
    for (const number of courseLessonNumbers(course)) {
      const lesson: LessonData = JSON.parse(await readFile(new URL(`${course.id}/Lesson${number}.json`, data), "utf8"));
      if (course.id.startsWith("word-")) continue;
      assert.equal(lesson.words.length, 10);
      assert.equal(lesson.lesson_id, `${course.id}-lesson-${number}`);
      assert.equal(lesson.title, lessonLabel(course.id, number));
      const questions = makeLessonQuestions(lesson, `${course.id}-lesson-${number}`);
      assert.equal(questions.filter(question => question.questionType === "meaning").length, 10);
      assert.equal(questions.filter(question => question.questionType === "quiz").length, lesson.words.filter(word => word.sentencePractice).length);
      for (const word of lesson.words) {
        assert.equal(word.meaningDistractors?.length, 2);
        if (course.id.startsWith("idioms-")) { assert.ok(word.word.includes(" ")); assert.ok(word.expressionType); }
        else assert.equal(word.domain, course.id.replace("specialized-", ""));
        currentWords.push(word);
      }
      newItems += lesson.words.length;
    }
    assert.equal(new Set(currentWords.map(word => normalizeWord(word.word))).size, currentWords.length, `${course.id}: duplicated current curriculum headword`);
    for (const word of currentWords) assert.equal(meaningChoices(word, currentWords).length, 3, `${course.id}/${word.word}: choices must work in review as well as lessons`);
  }
  assert.equal(newItems, 880);
});

test("the complete corpus produces valid options and never silently drops reviewed practice or illustrations", async () => {
  let inspected = 0, images = 0;
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
        if (word.image) { assert.ok(own.some(question => question.promptMode === "image"), `${course.id}/${number}/${word.word}: image rejected`); images++; }
        inspected++;
      }
    }
  }
  assert.equal(inspected, 6879);
  assert.equal(images, 70);
});
