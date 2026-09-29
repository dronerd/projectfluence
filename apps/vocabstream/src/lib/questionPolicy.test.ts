import assert from "node:assert/strict";
import test from "node:test";
import {buildWordQuestions,meaningChoices,sentenceChoices,validWordImage} from "./questionPolicy.ts";
import type {LessonWord,WordImage} from "./content.ts";
const source={category:"word-beginner",lessonId:"word-beginner-lesson-1",lessonNumber:1};
const target:LessonWord={word:"happy",meaning:"feeling pleased",japaneseMeaning:"うれしい",synonyms:"glad; joyful",example:"She is happy."};
const pool:LessonWord[]=[target,{word:"pleased",meaning:" Feeling pleased. "},{word:"cheerful",meaning:"bright and positive",japaneseMeaning:"うれしい"},{word:"glad",meaning:"delighted"},{word:"joyful",meaning:"showing joy"},{word:"delighted",meaning:"very pleased",synonyms:"happy"},{word:"tired",meaning:"needing rest"},{word:"angry",meaning:"feeling strong displeasure"}];
const image:WordImage={src:"/vocabstream/images/happy.svg",alt:"笑顔の人",width:480,height:320,source:"ProjectFluence original",sourceUrl:"/vocabstream/images/happy.svg",creator:"ProjectFluence",license:"CC0-1.0"};

test("meaning choices exclude duplicate definitions, Japanese meanings and synonyms in either direction",()=>{
  for(let i=0;i<20;i++)assert.deepEqual(new Set(meaningChoices(target,pool)),new Set(["happy","tired","angry"]));
});
test("bad explicit meaning choices suppress the question instead of silently generating replacements",()=>{
  for(const pair of [["glad","tired"],["tired","TIRED"],["happy","angry"],["pleased","angry"]]) {
    const word={...target,meaningDistractors:pair as [string,string]};
    assert.equal(buildWordQuestions(word,pool,source).length,0);
  }
  assert.deepEqual(new Set(meaningChoices({...target,meaningDistractors:["tired","angry"]},pool)),new Set(["happy","tired","angry"]));
});
test("an ambiguous repeated spelling cannot be rescued by a different safe catalog occurrence",()=>{
  assert.ok(!meaningChoices(target,[...pool,{word:"tired",meaning:"feeling pleased"}]).includes("tired"));
});
test("sentence practice requires a reviewed single blank and two distinct nonanswer choices",()=>{
  const valid={prompt:"The artist creates ____ for a gallery.",distractors:["rain","bread"] as [string,string],reviewNote:"The artist and gallery context selects art."};
  const word={word:"art",meaning:"creative work",example:"Arthur creates artwork."};
  assert.equal(sentenceChoices(word),undefined);
  assert.ok(sentenceChoices({...word,sentencePractice:valid}));
  for(const change of [{prompt:"____ and ____"},{prompt:"_____"},{prompt:"____"},{prompt:"The art is ____."},{reviewNote:""},{distractors:["rain","RAIN"] as [string,string]},{distractors:["art","bread"] as [string,string]}]) {
    assert.equal(sentenceChoices({...word,sentencePractice:{...valid,...change}}),undefined);
  }
  assert.ok(sentenceChoices({...word,sentencePractice:{...valid,prompt:"Arthur creates ____ for a gallery."}}),"a substring in Arthur is not the whole answer art");
});
test("optional licensed images expose image mode without changing text-only compatibility or progress identity",()=>{
  assert.ok(validWordImage(image));
  const question=buildWordQuestions({...target,definitionType:"image",image},pool,source)[0];
  assert.equal(question.promptMode,"image");assert.equal(question.image?.src,image.src);assert.equal(question.id,"meaning-happy");
  assert.equal(buildWordQuestions(target,pool,source)[0].promptMode,"text");
  for(const patch of [{src:"https://tracking.example/image.png"},{src:"/vocabstream/images/../private.png"},{license:"unknown"},{creator:""},{width:0}])assert.equal(validWordImage({...image,...patch}),undefined);
  assert.equal(buildWordQuestions({...target,definitionType:"image",image:{...image,alt:"happy"}},pool,source)[0].promptMode,"text","visual fallback must not reveal the English answer");
});
