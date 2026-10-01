import {NextRequest,NextResponse} from 'next/server';
import {discoverYoutubeCandidates} from '@/apps/vidmatch/src/services/youtubeVideoService';
import {apiError,readJsonBody,isPlainObject,ApiError} from '@/app/api/_lib/http';
import {secureTokenMatches} from '@/app/api/_lib/supabaseAuth';
export const runtime='nodejs';
export const maxDuration=300;
export async function POST(request:NextRequest){
  const token=process.env.VIDMATCH_INGEST_TOKEN;
  if(!token)return NextResponse.json({error:'Video discovery is not configured.'},{status:503});
  if(!secureTokenMatches(request,token))return NextResponse.json({error:'Unauthorized.'},{status:401});
  try{
    const body=await readJsonBody(request,4096);
    if(!isPlainObject(body)||typeof body.query!=='string'||!body.query.trim()||body.query.length>300)throw new ApiError(400,'Include a search query of 1–300 characters.','INVALID_SEARCH');
    if(Object.keys(body).some(key=>!['query','runKey'].includes(key)))throw new ApiError(400,'Search discovery accepts query and optional runKey. Level assignments require an editorial review.','INVALID_SEARCH');
    if(body.runKey!==undefined&&(typeof body.runKey!=='string'||!/^manual-[A-Za-z0-9_-]{8,100}$/.test(body.runKey)))throw new ApiError(400,'runKey must start with manual- followed by 8–100 letters, digits, dashes or underscores.','INVALID_RUN_KEY');
    const result=await discoverYoutubeCandidates(body.query.trim(),body.runKey as string|undefined);
    return NextResponse.json({ok:true,result},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return apiError(error,'vidmatch.discovery');}
}
