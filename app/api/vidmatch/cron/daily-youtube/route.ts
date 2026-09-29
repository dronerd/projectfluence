import {NextRequest,NextResponse} from 'next/server';
import {discoverYoutubeCandidates,maintainYoutubeCatalog} from '@/apps/vidmatch/src/services/youtubeVideoService';
import {apiError} from '@/app/api/_lib/http';
import {secureTokenMatches} from '@/app/api/_lib/supabaseAuth';
export const runtime='nodejs';
export const maxDuration=300;
export async function GET(request:NextRequest){
  // Share one request budget across health and discovery, leaving a minute for final RPCs.
  const deadlineAt=Date.now()+240_000;
  const secret=process.env.CRON_SECRET;
  if(!secret)return NextResponse.json({error:'Scheduled ingestion is not configured.'},{status:503});
  if(!secureTokenMatches(request,secret))return NextResponse.json({error:'Unauthorized.'},{status:401});
  try{
    // Maintain availability first. Configuration/API failures never masquerade as catalog success.
    const health=await maintainYoutubeCatalog();
    const discovery=deadlineAt-Date.now()<60_000
      ?{status:'partial',claimed:false,reason:'REQUEST_BUDGET_REACHED'}
      :await discoverYoutubeCandidates(undefined,`daily-${new Date().toISOString().slice(0,10)}`,deadlineAt);
    return NextResponse.json({ok:true,health,discovery},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return apiError(error,'vidmatch.cron');}
}
