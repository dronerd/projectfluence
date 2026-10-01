import 'server-only';
import {getRequiredEnv} from '@/app/api/_lib/supabaseAuth';
import {YoutubeProvider,ServiceFailure} from './curation/provider';
import {CatalogStore} from './curation/store';
import {parseManifest, runWorker, checkCatalogHealth} from './curation/worker';
import reviews from '../../catalog/reviews.json';
export type {VidMatchVideo,VidMatchLevel,VidMatchSkill,VidMatchTopic} from './videoContract';
/** Search requests stage candidates for review; a search query can never assign a learner level. */
export async function discoverYoutubeCandidates(query?: string, runKey?: string, deadlineAt?:number) {
  const store=new CatalogStore(getRequiredEnv('SUPABASE_URL'),getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const provider=new YoutubeProvider(getRequiredEnv('YOUTUBE_API_KEY'),{maxSearchCalls:4});
  return runWorker(store,provider,parseManifest(reviews),{runKey:runKey??`manual-${crypto.randomUUID()}`,queries:query?[query]:undefined,discover:true,deadlineAt});
}
export async function maintainYoutubeCatalog() {
  const store=new CatalogStore(getRequiredEnv('SUPABASE_URL'),getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const run=await store.rpc<{run_id:string;lease_token:string;claimed:boolean;status:string}>('begin_vidmatch_ingestion_run',{p_run_key:`health-${new Date().toISOString().slice(0,10)}`,p_evaluator_version:'provider-health-v1',p_config:{batch:50},p_lease_seconds:300});
  if(!run.claimed)return {claimed:false,status:run.status};
  const auth={p_run_id:run.run_id,p_lease_token:run.lease_token};
  try{
    const result=await checkCatalogHealth(store,new YoutubeProvider(getRequiredEnv('YOUTUBE_API_KEY')));
    await store.rpc('finish_vidmatch_ingestion_run',{...auth,p_status:'completed',p_metrics:result});
    return result;
  }catch(error){
    await store.rpc('finish_vidmatch_ingestion_run',{...auth,p_status:'failed',p_metrics:{},p_error_code:error instanceof ServiceFailure?error.code:'HEALTH_CHECK_FAILED'},{retry:false}).catch(()=>{});
    throw error;
  }
}
