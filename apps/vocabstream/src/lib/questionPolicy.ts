import type { LearningQuestion, LessonWord, WordImage } from "./content.ts";

export type QuestionSource = { category: string; lessonId?: string; lessonNumber?: number | null };
const bounded = (value: unknown, max: number): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max;
export const normalizeWord = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ");
const normalizeDefinition = (value?: string) => value ? normalizeWord(value).replace(/[。.!?;:]+$/u, "").trim() : "";
const synonyms = (word: LessonWord) => new Set((word.synonyms ?? "").split(/[,;\/、\n]+/).map(normalizeWord).filter(value => value && !["-", "—", "none", "n/a"].includes(value)));

export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i=result.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]]; }
  return result;
}

/** Runtime validation is also used when old lessons do not have image metadata. */
export function validWordImage(value: unknown): WordImage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const image=value as Partial<WordImage>;
  if (!bounded(image.src,300) || !/^\/vocabstream\/images\/[A-Za-z0-9_/-]+\.(?:svg|png|webp|jpe?g)$/.test(image.src)
    || image.src.includes("..") || !bounded(image.alt,500) || !bounded(image.source,200) || !bounded(image.sourceUrl,1000)
    || !bounded(image.creator,200) || !["CC0-1.0","CC-BY-4.0"].includes(image.license??"") || !Number.isInteger(image.width) || !Number.isInteger(image.height)
    || (image.width??0)<1 || (image.width??0)>4096 || (image.height??0)<1 || (image.height??0)>4096) return undefined;
  if (image.license==="CC-BY-4.0" && (!bounded(image.credit,300) || image.licenseUrl!=="https://creativecommons.org/licenses/by/4.0/")) return undefined;
  try {
    const url=new URL(image.sourceUrl,"https://local.invalid");
    if (url.username || url.password || (url.origin==="https://local.invalid" ? !image.sourceUrl.startsWith("/vocabstream/images/") : url.protocol!=="https:")) return undefined;
  } catch { return undefined; }
  return image as WordImage;
}

function conflictingMeaning(target: LessonWord, other: LessonWord) {
  const meaning=normalizeDefinition(target.meaning),japanese=normalizeDefinition(target.japaneseMeaning);
  return normalizeWord(target.word)===normalizeWord(other.word)
    || (meaning && meaning===normalizeDefinition(other.meaning))
    || (japanese && japanese===normalizeDefinition(other.japaneseMeaning))
    || synonyms(target).has(normalizeWord(other.word)) || synonyms(other).has(normalizeWord(target.word));
}

function safeLabel(target:LessonWord, choice:unknown) : choice is string {
  return bounded(choice,200) && normalizeWord(choice)!==normalizeWord(target.word) && !synonyms(target).has(normalizeWord(choice));
}

/** Explicit choices fail closed; random choices only fill the uncurated meaning fallback. */
export function meaningChoices(word:LessonWord, catalog:readonly LessonWord[]):string[] {
  const grouped=new Map<string,LessonWord[]>();
  for(const item of catalog) {
    if(!bounded(item.word,200)) continue;
    const key=normalizeWord(item.word);grouped.set(key,[...(grouped.get(key)??[]),item]);
  }
  const safe=(choice:unknown):choice is string=>safeLabel(word,choice) && !(grouped.get(normalizeWord(choice))??[]).some(item=>conflictingMeaning(word,item));
  if(word.meaningDistractors!==undefined) {
    const pair=word.meaningDistractors;
    if(!Array.isArray(pair)||pair.length!==2||!pair.every(safe)||new Set(pair.map(normalizeWord)).size!==2) return [];
    return shuffle([word.word,...pair]);
  }
  const pool=shuffle([...grouped.values()].map(items=>items[0].word).filter(safe));
  return pool.length ? shuffle([word.word,...pool.slice(0,2)]) : [];
}

export function sentenceChoices(word:LessonWord):{prompt:string;choices:string[]}|undefined {
  const practice=word.sentencePractice;
  if(!practice || !bounded(practice.prompt,1500) || !bounded(practice.reviewNote,1500) || !Array.isArray(practice.distractors)
    || practice.distractors.length!==2 || !practice.distractors.every(choice=>safeLabel(word,choice))
    || new Set(practice.distractors.map(normalizeWord)).size!==2) return undefined;
  const blanks=practice.prompt.match(/_+/g);
  if(blanks?.length!==1 || blanks[0]!=="____" || !/[\p{L}\p{N}]/u.test(practice.prompt.replace("____",""))) return undefined;
  const escaped=word.word.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  // An unrelated substring is safe; a revealed whole answer is not a scored gap.
  if(new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`,"iu").test(practice.prompt)) return undefined;
  return {prompt:practice.prompt,choices:shuffle([word.word,...practice.distractors])};
}

const irregularFirstWords:Record<string,string[]>={
  go:["went","gone"],pay:["paid"],fall:["fell","fallen"],come:["came"],overcome:["overcame"],bring:["brought"],throw:["threw","thrown"],
  run:["ran"],take:["took","taken"],get:["got","gotten"],buy:["bought"],sell:["sold"],make:["made"],
  do:["did","done"],be:["was","were","been"],have:["had"],keep:["kept"],sweep:["swept"],show:["shown"],
  learn:["learnt","learned"],write:["wrote","written"],speak:["spoke","spoken"],eat:["ate","eaten"],
  drink:["drank","drunk"],choose:["chose","chosen"],find:["found"],build:["built"],lead:["led"],
  leave:["left"],grow:["grew","grown"],know:["knew","known"],think:["thought"],fight:["fought"],
  teach:["taught"],catch:["caught"],seek:["sought"],lie:["lay","lain"],rise:["rose","risen"],
};

/** Returns the original example with the actual spoken or written form removed. */
export function exampleGap(word:LessonWord):{prompt:string;answer:string}|undefined {
  if(!bounded(word.example,1500))return undefined;
  const override=word.exampleGap;
  if(override) {
    if(!bounded(override.prompt,1500)||!bounded(override.answer,200)||!/[A-Za-z]/.test(override.answer)
      ||override.prompt.match(/_+/g)?.length!==1||!override.prompt.includes("____")
      ||override.prompt.replace("____",override.answer)!==word.example)return undefined;
    return override;
  }
  if(!bounded(word.word,200))return undefined;
  const first=word.word.split(" ")[0],rest=word.word.slice(first.length);
  const variants=[word.word,...(word.forms??"").split(",").map(value=>value.trim()),first+"s",first+"es",first+"ed",first+"ing"];
  if(first.endsWith("e"))variants.push(first.slice(0,-1)+"ing",first+"d");
  if(first.endsWith("y"))variants.push(first.slice(0,-1)+"ies",first.slice(0,-1)+"ied");
  if(first.length>2 && /[^aeiou][aeiou][^aeiouwxy]$/i.test(first)) {
    variants.push(first+first.at(-1)+"ed",first+first.at(-1)+"ing");
  }
  variants.push(...(irregularFirstWords[first.toLowerCase()]??[]));
  const candidates=[word.word,...variants.slice(1).map(value=>value.includes(" ")?value:value+rest)].filter(Boolean);
  for(const candidate of new Set(candidates)) {
    const escaped=candidate.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const match=new RegExp(`(^|[^\\p{L}\\p{N}])(${escaped})(?=$|[^\\p{L}\\p{N}])`,"iu").exec(word.example);
    if(!match)continue;
    const start=match.index+match[1].length,answer=match[2];
    return {prompt:word.example.slice(0,start)+"____"+word.example.slice(start+answer.length),answer};
  }
  return undefined;
}

export function exampleGapChoices(word:LessonWord,catalog:readonly LessonWord[]):{prompt:string;answer:string;choices:string[]}|undefined {
  const gap=exampleGap(word);
  if(!gap)return undefined;
  const labels=meaningChoices(word,catalog).filter(choice=>normalizeWord(choice)!==normalizeWord(word.word));
  const distractors=labels.map(label=>{
    const other=catalog.find(item=>normalizeWord(item.word)===normalizeWord(label));
    return normalizeWord(gap.answer)===normalizeWord(word.word)?label:(other&&exampleGap(other)?.answer)||label;
  });
  const unique=[...new Map(distractors.filter(choice=>normalizeWord(choice)!==normalizeWord(gap.answer)).map(choice=>[normalizeWord(choice),choice])).values()];
  if(unique.length<2)return undefined;
  return {...gap,choices:shuffle([gap.answer,...unique.slice(0,2)])};
}

export function hasExampleQuestion(word:LessonWord,catalog:readonly LessonWord[]):boolean {
  return Boolean(sentenceChoices(word)||exampleGapChoices(word,catalog));
}

export function buildWordQuestions(word:LessonWord,catalog:readonly LessonWord[],source:QuestionSource,idSuffix=normalizeWord(word.word)):LearningQuestion[] {
  if(!bounded(word.word,200))return [];
  const result:LearningQuestion[]=[];
  const image=validWordImage(word.image);
  const useImage=word.imageRole!=="supporting" && (word.definitionType==="image"||word.definitionType==="image+text") && image && !image.alt.toLowerCase().includes(word.word.toLowerCase());
  const definition=word.meaning||word.japaneseMeaning||image?.alt||"";
  const common={word:word.word,correctAnswer:word.word,definition,definitionType:word.definitionType,imageRole:word.imageRole,...(image?{image}:{}),example:word.example,explanation:word.explanation,japaneseMeaning:word.japaneseMeaning,synonyms:word.synonyms,antonyms:word.antonyms,forms:word.forms,usageNote:word.usageNote,expressionType:word.expressionType,sourceCategory:source.category,sourceLessonId:source.lessonId,sourceLessonNumber:source.lessonNumber??null};
  const choices=meaningChoices(word,catalog);
  if(definition && choices.length>=2) result.push({...common,id:`meaning-${idSuffix}`,questionType:"meaning",prompt:useImage?"画像に合う英語を選んでください。":definition,promptMode:useImage?"image":"text",...(useImage?{image}:{}),choices,answerIndex:choices.indexOf(word.word)});
  const sentence=sentenceChoices(word);
  if(sentence)result.push({...common,id:`quiz-${idSuffix}`,questionType:"quiz",prompt:sentence.prompt,promptMode:"sentence",choices:sentence.choices,answerIndex:sentence.choices.indexOf(word.word)});
  else {
    const gap=exampleGapChoices(word,catalog);
    if(gap)result.push({...common,id:`quiz-${idSuffix}`,questionType:"quiz",prompt:gap.prompt,promptMode:"sentence",choices:gap.choices,correctAnswer:gap.answer,answerIndex:gap.choices.indexOf(gap.answer),showMeaningHint:Boolean(word.japaneseMeaning)});
  }
  return result;
}
