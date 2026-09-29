import assert from "node:assert/strict";
import test from "node:test";
import {buildReviewQuestions,hydrateReviewWords,type CatalogWord,type WeakWordSnapshot} from "./reviewPolicy.ts";
import type {WordImage} from "./content.ts";
const snapshot:WeakWordSnapshot={id:"stored-row-id",word:"bank",definition:"Old definition",example:"Old example",explanation:"Old explanation",source_category:"word-intermediate",source_lesson_id:"word-intermediate-lesson-2",source_lesson_number:2,mistake_count:7,last_mistaken_at:"2026-09-29T00:00:00Z"};
const picture=(name:string,alt:string):WordImage=>({src:`/vocabstream/images/${name}.svg`,alt,width:480,height:320,source:"ProjectFluence original",sourceUrl:`/vocabstream/images/${name}.svg`,creator:"ProjectFluence",license:"CC0-1.0"});
const catalog:CatalogWord[]=[
  {word:"bank",meaning:"land beside a river",japaneseMeaning:"川岸",example:"They sat on the bank.",definitionType:"image",image:picture("river","川のそばの土地"),sourceCategory:"word-intermediate",sourceLessonId:"word-intermediate-lesson-1",sourceLessonNumber:1},
  {word:"bank",meaning:"an organization that keeps money",japaneseMeaning:"銀行",example:"I deposited money at the bank.",definitionType:"image",image:picture("finance","お金を預ける建物"),meaningDistractors:["forest","hospital"],sentencePractice:{prompt:"She deposited her savings at the ____.",distractors:["forest","hospital"],reviewNote:"Only a bank accepts a savings deposit."},sourceCategory:"word-intermediate",sourceLessonId:"word-intermediate-lesson-2",sourceLessonNumber:2},
  {word:"forest",meaning:"a large area of trees",sourceCategory:"word-intermediate",sourceLessonId:"word-intermediate-lesson-2",sourceLessonNumber:2},
  {word:"hospital",meaning:"a place providing medical treatment",sourceCategory:"word-intermediate",sourceLessonId:"word-intermediate-lesson-2",sourceLessonNumber:2},
];
test("review resolves exact source lesson and uses corrections without rewriting stored identity or counts",()=>{
  const [word]=hydrateReviewWords([snapshot],[...catalog].reverse());
  assert.equal(word.definition,"an organization that keeps money");assert.equal(word.example,"I deposited money at the bank.");assert.equal(word.explanation,undefined);
  assert.equal(word.japaneseMeaning,"銀行");assert.equal(word.historical,false);assert.equal(word.id,snapshot.id);assert.equal(word.mistakeCount,7);assert.equal(word.sourceLessonId,snapshot.source_lesson_id);
  assert.equal(word.image?.src,"/vocabstream/images/finance.svg");
  const questions=buildReviewQuestions([word],catalog);assert.equal(questions.length,2);
  assert.deepEqual(new Set(questions.map(question=>question.promptMode)),new Set(["image","sentence"]));
});
test("missing or changed source entries keep historical meaning snapshots without borrowing current media or sentence questions",()=>{
  const old={...snapshot,source_lesson_id:"word-intermediate-lesson-99",source_lesson_number:99};
  const [word]=hydrateReviewWords([old],catalog);assert.equal(word.historical,true);assert.equal(word.definition,"Old definition");assert.equal(word.example,"Old example");assert.equal(word.image,undefined);
  const questions=buildReviewQuestions([word],catalog);assert.equal(questions.length,1);assert.equal(questions[0].questionType,"meaning");assert.equal(questions[0].prompt,"Old definition");
});

test("previously saved words acquire current supporting images in review without changing progress identity",()=>{
  const current:CatalogWord={...catalog[1],definitionType:"image+text",imageRole:"supporting"};
  const updated=[catalog[0],current,...catalog.slice(2)];
  const [word]=hydrateReviewWords([snapshot],updated);
  assert.equal(word.imageRole,"supporting");assert.equal(word.image?.src,current.image?.src);
  assert.equal(word.id,snapshot.id);assert.equal(word.mistakeCount,snapshot.mistake_count);
  assert.equal(word.sourceLessonId,snapshot.source_lesson_id);
  const questions=buildReviewQuestions([word],updated);
  assert.deepEqual(new Set(questions.map(question=>question.promptMode)),new Set(["text","sentence"]));
  assert.ok(questions.every(question=>question.image?.src===current.image?.src));
});
test("legacy numeric source can resolve while ambiguous source-free words never select an arbitrary matching lesson",()=>{
  assert.equal(hydrateReviewWords([{...snapshot,source_lesson_id:"TOEFL-intermediate-2"}],catalog)[0].historical,false);
  assert.equal(hydrateReviewWords([{...snapshot,source_lesson_id:null,source_lesson_number:null}],catalog)[0].historical,true);
  assert.equal(hydrateReviewWords([snapshot],[...catalog,catalog[1]])[0].historical,true);
});

function reviewFixture(count:number) {
  const items:CatalogWord[]=Array.from({length:count},(_,index)=>({
    word:`term-${index}`,meaning:`Meaning number ${index}`,sourceCategory:snapshot.source_category,
    sourceLessonId:snapshot.source_lesson_id!,sourceLessonNumber:2,
    sentencePractice:{prompt:"Please choose the ____ for this reviewed example.",distractors:["forest","hospital"],reviewNote:"The distractors have been reviewed for this fixture."},
  }));
  const words=hydrateReviewWords(items.map(item=>({...snapshot,word:item.word})),items);
  let builds=0;
  // Meaning-choice access counts construction without depending on machine timing.
  for(const word of words)Object.defineProperty(word,"meaningDistractors",{get:()=>{builds+=1;return undefined;},configurable:true});
  return {items,words,builds:()=>builds};
}

test("review stops constructing questions when both randomized quotas are full",t=>{
  t.mock.method(Math,"random",()=>0.999999);
  const fixture=reviewFixture(100);
  const questions=buildReviewQuestions(fixture.words,fixture.items);
  assert.equal(questions.filter(question=>question.questionType==="meaning").length,20);
  assert.equal(questions.filter(question=>question.questionType==="quiz").length,20);
  assert.equal(fixture.builds(),20);
});

test("sparse reviewed sentences fill their own quota without building every historical or unreviewed row",t=>{
  t.mock.method(Math,"random",()=>0.999999);
  const fixture=reviewFixture(100);
  fixture.words.slice(0,20).forEach(word=>{word.historical=true;});
  fixture.words.slice(20,60).forEach(word=>{word.sentencePractice=undefined;});
  const questions=buildReviewQuestions(fixture.words,fixture.items);
  const sentences=questions.filter(question=>question.questionType==="quiz");
  assert.equal(questions.filter(question=>question.questionType==="meaning").length,20);
  assert.equal(sentences.length,20);
  assert.deepEqual(sentences.map(question=>question.word),fixture.words.slice(60,80).map(word=>word.word));
  assert.equal(fixture.builds(),40);
});

test("invalid early candidates do not starve later valid meanings or reviewed sentences",t=>{
  t.mock.method(Math,"random",()=>0.999999);
  const fixture=reviewFixture(70);
  for(const word of fixture.words.slice(0,25)) {
    Object.defineProperty(word,"meaningDistractors",{value:[word.word,"hospital"],configurable:true});
    word.sentencePractice={prompt:"This sentence has no gap.",distractors:["forest","hospital"],reviewNote:"Invalid fixture."};
  }
  fixture.words.slice(25,30).forEach(word=>{word.historical=true;});
  const questions=buildReviewQuestions(fixture.words,fixture.items);
  assert.equal(questions.filter(question=>question.questionType==="meaning").length,20);
  assert.equal(questions.filter(question=>question.questionType==="quiz").length,20);
  assert.ok(questions.every(question=>Number(question.word.slice(5))>=25));
  assert.ok(questions.filter(question=>question.questionType==="quiz").every(question=>Number(question.word.slice(5))>=30));
});
