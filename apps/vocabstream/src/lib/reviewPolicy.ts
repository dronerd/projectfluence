import type { LearningQuestion, LessonWord } from "./content.ts";
import { buildWordQuestions, normalizeWord, sentenceChoices, shuffle } from "./questionPolicy.ts";

export type WeakWordSnapshot={
  id?:string;
  word:string;definition:string|null;example:string|null;explanation:string|null;
  source_category:string;source_lesson_id:string|null;source_lesson_number:number|null;
  mistake_count:number;last_mistaken_at:string;
};
export type CatalogWord=LessonWord & {sourceCategory:string;sourceLessonId:string;sourceLessonNumber:number};
export type ReviewWord=LessonWord & {
  id?:string;
  definition:string;sourceCategory:string;sourceLessonId?:string;sourceLessonNumber?:number|null;
  mistakeCount:number;lastMistakenAt?:string;
  /** Snapshot-only records can be reviewed for meaning, but cannot invent current media or gaps. */
  historical:boolean;
};

export function exactCatalogWord(row:WeakWordSnapshot,catalog:readonly CatalogWord[]):CatalogWord|undefined {
  const matches=catalog.filter(item=>item.sourceCategory===row.source_category && normalizeWord(item.word)===normalizeWord(row.word));
  if(row.source_lesson_id) {
    const byId=matches.filter(item=>item.sourceLessonId===row.source_lesson_id);
    if(byId.length===1)return byId[0];
    // A valid explicit lesson identity must not silently resolve to a different lesson number.
    if(byId.length || /^.+-lesson-\d+$/.test(row.source_lesson_id))return undefined;
  }
  if(row.source_lesson_number!==null) {
    const byNumber=matches.filter(item=>item.sourceLessonNumber===row.source_lesson_number);
    if(byNumber.length===1)return byNumber[0];
  }
  return undefined;
}

export function hydrateReviewWords(rows:readonly WeakWordSnapshot[],catalog:readonly CatalogWord[]):ReviewWord[] {
  return rows.map(row=>{
    const current=exactCatalogWord(row,catalog);
    const identity={id:row.id,word:row.word,sourceCategory:row.source_category,sourceLessonId:row.source_lesson_id??undefined,sourceLessonNumber:row.source_lesson_number,mistakeCount:Number(row.mistake_count)||1,lastMistakenAt:row.last_mistaken_at};
    if(current) return {...current,...identity,definition:current.meaning||current.japaneseMeaning||"",historical:false};
    return {...identity,meaning:row.definition??"",definition:row.definition??"",example:row.example??undefined,explanation:row.explanation??undefined,historical:true};
  });
}

export function buildReviewQuestions(weakWords:readonly ReviewWord[],catalog:readonly CatalogWord[]):LearningQuestion[] {
  const categories=new Map<string,CatalogWord[]>();
  for(const item of catalog) {
    const category=categories.get(item.sourceCategory);
    if(category)category.push(item);
    else categories.set(item.sourceCategory,[item]);
  }
  const meanings:LearningQuestion[]=[],sentences:LearningQuestion[]=[];
  for(const word of shuffle(weakWords)) {
    const needsMeaning=meanings.length<20;
    // Once meanings are full, cheaply skip rows that cannot supply a reviewed sentence.
    if(!needsMeaning && (word.historical || sentences.length>=20 || !sentenceChoices(word)))continue;
    // Meaning ambiguity checks still include every sense in the category. Sentence-only
    // targets use their reviewed choices and need no category-wide distractor generation.
    const pool=needsMeaning?(categories.get(word.sourceCategory)??[]):[];
    const id=[word.sourceCategory,word.sourceLessonId??word.sourceLessonNumber??"historical",normalizeWord(word.word)].join("-");
    const questions=buildWordQuestions(word,pool,{category:word.sourceCategory,lessonId:word.sourceLessonId,lessonNumber:word.sourceLessonNumber},id);
    for(const question of questions) {
      if(question.questionType==="meaning" && meanings.length<20)meanings.push(question);
      else if(question.questionType==="quiz" && !word.historical && sentences.length<20)sentences.push(question);
    }
    if(meanings.length===20 && sentences.length===20)break;
  }
  return shuffle([...meanings,...sentences]);
}
