/** LOCAL TEST ONLY: Supabase Auth/PostgREST-shaped fixture backed by real ephemeral PostgreSQL/WASM.
 * No credentials, hosted accounts, network ingestion, or production user data are used.
 * This adapter is deliberately incomplete; unsupported PostgREST features fail loudly.
 * PGLITE_MODULE=/tmp/.../pglite/dist/index.js node scripts/speakwise-fixture-server.mjs
 */
import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
export const fixtureOwner = '00000000-0000-4000-8000-000000000001';
const fixtureOther = '00000000-0000-4000-8000-000000000002';
const port = Number(process.env.FLUENCE_FIXTURE_PORT || 3103);
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;`);
for (const file of (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(x => x.endsWith('.sql')).sort()) {
  await db.exec((await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8')).replaceAll(/create extension if not exists pgcrypto;/gi, ''));
}
await db.query('insert into auth.users(id,email) values ($1,$3),($2,$4)', [fixtureOwner, fixtureOther, 'learner@example.test', 'other@example.test']);
await db.exec(`insert into public.vidmatch_videos(video_id,title,channel_name,youtube_url,level,topics,skills,duration,description,availability_status,editorial_reviewed_at,provider_metadata_expires_at)
  values ('fixture0001','A city garden: a learning fixture','Fixture publisher','https://www.youtube.com/watch?v=fixture0001','B1',array['Environment'],array['vocabulary'],'PT4M','A synthetic catalog record used only in local tests.','active',now(),now()+interval '1 day');`);
await db.exec(`insert into public.vidmatch_text_content(id,title,content_type,source,url,body,level,topics,word_count)
 values('00000000-0000-4000-8000-000000000030','City gardens and water: synthetic article','article','Local fixture publisher','https://example.test/gardens','City gardens collect rainwater in blue barrels. Neighbors use this water for flowers. Each Saturday they check the water level and share the work.','B1',array['Environment'],26);`);

function providerOutput(body) {
 const policy=body.messages?.find(message=>message.role==='system')?.content || '';
 let data={};try{data=JSON.parse(body.messages?.at(-1)?.content || '{}');}catch{/* legacy plain text */}
 if(policy.includes('EVERY supplied passage'))return {notes:(data.passages || []).map(item=>({sourceId:item.sourceId,summary:item.text.slice(0,500)}))};
 if(policy.includes('reusable guided reading artifact')) {
  const sources=data.sourcePassages || data.sources || [];
  const wanted=data.settings?.lengthWords || data.lengthWords || 200;
  const sentence='The neighbors visit the city garden and collect rainwater for the flowers each Saturday. ';
  const passage=Array.from({length:Math.ceil(wanted/16)},()=>sentence).join(' ').trim();
  return {title:'The city garden',body:passage,sourceIds:sources.map(row=>row.sourceId).slice(0,2),vocabulary:['garden','water'],questions:[{id:'q1',prompt:'Where do the neighbors go?',answer:'They visit the city garden.',explanation:'The passage describes their visit.'},{id:'q2',prompt:'When do they collect rainwater?',answer:'Each Saturday.',explanation:'The passage names Saturday.'}]};
 }
 const message=data.message || '';
 const sources=data.sourcePassages || [];
 if(/practice (?:the word )?water/i.test(message))return {reply:'A practice activity is ready to request.',sourceIds:[],action:{type:'practice_vocabulary',word:'water'},observations:[]};
 if(/find (?:a |some )?(video|article|resource)/i.test(message))return {reply:'I can look for a resource.',sourceIds:[],action:{type:'search_content',query:'garden',contentType:'all'},observations:[]};
 if(/create (?:a )?reading script/i.test(message))return {reply:'I can prepare a reading script.',sourceIds:[],action:{type:'create_script',topic:'city gardens',kind:sources.length?'adaptation':'original',lengthWords:200},observations:[]};
 return {reply:sources.length?'The selected source describes a city garden and collecting rainwater. What would you like to explain in your own words?':'Hello! Tell me about something you enjoyed this week.',sourceIds:sources.slice(0,2).map(row=>row.sourceId),action:null,observations:[]};
}

const ident = value => { if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('Unsupported SQL identifier'); return `"${value}"`; };
const bodyValue = value => value !== null && typeof value === 'object' && !Array.isArray(value) ? JSON.stringify(value) : value;
function ownerFor(token) {
  if (token === 'fixture-valid') return fixtureOwner;
  if (token === 'fixture-other') return fixtureOther;
  try { const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); return token.endsWith('.fixture') && [fixtureOwner, fixtureOther].includes(claims.sub) ? claims.sub : null; } catch { return null; }
}
function where(params, values) {
  const filters = [];
  for (const [key, expression] of params) {
    if (['select','order','limit','offset','on_conflict'].includes(key)) continue;
    if (key === 'or') {
      const children = expression.replace(/^\(|\)$/g, '').split(',');
      const parts = children.map(part => { const dot = part.indexOf('.'); return where(new URLSearchParams([[part.slice(0,dot),part.slice(dot+1)]]), values); });
      filters.push(`(${parts.join(' or ')})`); continue;
    }
    if (key === 'vocabstream_lesson_attempts.user_id') {
      values.push(expression.slice(3)); filters.push(`lesson_attempt_id in (select id from public.vocabstream_lesson_attempts where user_id=$${values.length}::uuid)`); continue;
    }
    const field = key.includes('->>') ? (()=>{const [column,property]=key.split('->>');ident(property);return `${ident(column)}->>'${property}'`;})() : ident(key);
    const dot = expression.indexOf('.');
    const operator = expression.slice(0,dot), value = expression.slice(dot+1);
    if (operator === 'is') { if (!['null','true','false'].includes(value)) throw new Error('Unsupported is filter'); filters.push(`${field} is ${value}`); }
    else if (operator === 'in') {
      const terms = value.replace(/^\(|\)$/g,'').split(',').map(x => x.replace(/^"|"$/g,''));
      filters.push(`${field} in (${terms.map(term => { values.push(term); return `$${values.length}`; }).join(',')})`);
    } else if (operator === 'not' && value === 'is.null') filters.push(`${field} is not null`);
    else if (['eq','neq','gt','gte','lt','lte','ilike','like','cs','ov','wfts'].includes(operator)) {
      values.push(value); const p = `$${values.length}`;
      if (operator === 'wfts') filters.push(`${field} @@ websearch_to_tsquery('simple',${p})`);
      else filters.push(`${field} ${{eq:'=',neq:'<>',gt:'>',gte:'>=',lt:'<',lte:'<=',ilike:'ilike',like:'like',cs:'@>',ov:'&&'}[operator]} ${p}`);
    } else throw new Error(`Unsupported fixture filter ${key}: ${operator}`);
  }
  return filters.join(' and ') || 'true';
}
let databaseQueue = Promise.resolve();
const requests = [];
async function rest(req, url, body, owner) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner || '']);
  const service = req.headers.apikey === 'fixture-service';
  await db.exec(`set role ${service ? 'service_role' : 'authenticated'}`);
  try {
    const resource = url.pathname.slice('/rest/v1/'.length);
    if (resource.startsWith('rpc/')) {
      const name = resource.slice(4), args = Object.entries(body || {});
      const types = await db.query(`select p.proargnames names, array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t) types from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1`, [name]);
      const signature = types.rows[0];
      const parameters = args.map(([key,value]) => {
        const type = signature?.types?.[signature.names.indexOf(key)];
        return type === 'jsonb' || type === 'json' ? JSON.stringify(value) : bodyValue(value);
      });
      const result = await db.query(`select to_jsonb(public.${ident(name)}(${args.map(([key],i) => `${ident(key)} => $${i+1}`).join(',')})) result`, parameters);
      const rows = result.rows.map(row => row.result);
      return rows.length === 1 ? rows[0] : rows;
    }
    const table = ident(resource), values = [];
    const predicate = where(url.searchParams, values);
    if (req.method === 'GET') {
      const order = url.searchParams.get('order')?.split(',').map(part => { const [field,direction='asc'] = part.split('.'); return `${ident(field)} ${direction === 'desc' ? 'desc' : 'asc'}`; }).join(',');
      const limit = Math.min(1000, Math.max(0, Number(url.searchParams.get('limit') || 1000)));
      const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
      return (await db.query(`select * from public.${table} where ${predicate}${order ? ` order by ${order}` : ''} limit ${limit} offset ${offset}`, values)).rows;
    }
    if (req.method === 'DELETE') return (await db.query(`delete from public.${table} where ${predicate} returning *`, values)).rows;
    if (req.method === 'PATCH') {
      const pairs = Object.entries(body); pairs.forEach(([,value]) => values.push(bodyValue(value)));
      return (await db.query(`update public.${table} set ${pairs.map(([key],i) => `${ident(key)}=$${values.length-pairs.length+i+1}`).join(',')} where ${predicate} returning *`, values)).rows;
    }
    if (req.method === 'POST') {
      const rows = Array.isArray(body) ? body : [body]; if (!rows.length) return [];
      const columns = Object.keys(rows[0]); const args = [];
      const tuples = rows.map(row => `(${columns.map(column => { args.push(bodyValue(row[column])); return `$${args.length}`; }).join(',')})`);
      let conflict = '';
      if (req.headers.prefer?.includes('resolution=ignore-duplicates')) conflict = ' on conflict do nothing';
      if (req.headers.prefer?.includes('resolution=merge-duplicates')) {
        const keys = (url.searchParams.get('on_conflict') || 'id').split(',');
        conflict = ` on conflict (${keys.map(ident).join(',')}) do update set ${columns.filter(key => !keys.includes(key)).map(key => `${ident(key)}=excluded.${ident(key)}`).join(',')}`;
      }
      return (await db.query(`insert into public.${table}(${columns.map(ident).join(',')}) values ${tuples.join(',')}${conflict} returning *`,args)).rows;
    }
    throw new Error('Unsupported fixture method');
  } finally { await db.exec('reset role'); }
}
const server = http.createServer(async (req,res) => {
  const send = (status,body) => { res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS'}); res.end(JSON.stringify(body)); };
  try {
    if (req.method === 'OPTIONS') return send(204,{});
    const url = new URL(req.url,`http://127.0.0.1:${port}`);
    const chunks=[]; for await (const chunk of req) chunks.push(chunk);
    const raw=Buffer.concat(chunks).toString(), body=raw ? JSON.parse(raw) : null;
    const token = req.headers.authorization?.replace(/^Bearer /,'') || '';
    const owner = ownerFor(token);
    requests.push({path:url.pathname,method:req.method,owner,at:Date.now()});
    if (url.pathname === '/fixture/health') return send(200,{fixture:true,requests:requests.length});
    if (url.pathname === '/openai/v1/chat/completions') {
      if(token!=='fixture-provider')return send(401,{error:{message:'Invalid fixture provider key'}});
      const output=JSON.stringify(providerOutput(body));
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store'});
      res.write(`data: ${JSON.stringify({id:'fixture-completion',object:'chat.completion.chunk',created:1,model:'fixture',choices:[{index:0,delta:{content:output},finish_reason:null}]})}\n\n`);
      res.end('data: [DONE]\n\n');return;
    }
    if (url.pathname === '/auth/v1/user') return owner ? send(200,{id:owner,email:'learner@example.test',aud:'authenticated',is_anonymous:false,user_metadata:{}}) : send(401,{message:'Invalid fixture token'});
    if (!url.pathname.startsWith('/rest/v1/')) return send(404,{error:'Unknown fixture route'});
    if (!owner && req.headers.apikey !== 'fixture-service') return send(401,{error:'Fixture authentication required'});
    const operation = databaseQueue.then(() => rest(req,url,body,owner));
    databaseQueue = operation.catch(() => {});
    const result = await operation;
    return send(200,result);
  } catch (error) {
    console.error('FIXTURE_ERROR',error.code || '',error.message);
    return send(error.code === '42501' ? 403 : error.code === '22023' ? 400 : 500,{code:error.code || 'fixture_error',message:error.message});
  }
});
server.listen(port,'127.0.0.1',()=>console.log(`SPEAKWISE_FIXTURE_READY http://127.0.0.1:${port}; synthetic Auth/PostgREST adapter; real ephemeral SQL; no hosted data`));
async function close() { server.closeAllConnections(); server.close(); await db.close(); process.exit(0); }
process.on('SIGINT',close); process.on('SIGTERM',close);
