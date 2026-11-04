// Real PostgreSQL functions/RLS and production adapter; no remote database or Auth calls.
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),ts=require('typescript');const {PGlite}=require('@electric-sql/pglite');
const db=new PGlite();const temp=fs.mkdtempSync(path.join(os.tmpdir(),'orvelium-quotes-db-'));
for(const name of ['quotes/types','quotes/supabase-repository','clients/types']){fs.mkdirSync(path.dirname(path.join(temp,name)),{recursive:true});fs.writeFileSync(path.join(temp,name+'.js'),ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText);}
const {createSupabaseQuoteRepository}=require(path.join(temp,'quotes/supabase-repository.js'));const {totals,duplicateInput}=require(path.join(temp,'quotes/types.js'));
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',member='10000000-0000-4000-8000-000000000003',viewer='10000000-0000-4000-8000-000000000004',pending='10000000-0000-4000-8000-000000000005';
let a,b,clientA,clientA2,clientB,first;
async function as(user,sql,args=[]){await db.exec(`set role ${user?'authenticated':'anon'}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);try{return await db.query(sql,args);}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");}}
// PostgREST encodes DATE as YYYY-MM-DD and timestamps as ISO strings; PGlite uses Date objects.
function wire(row){const value=JSON.parse(JSON.stringify(row));for(const key of ['date','valid_until'])if(row[key] instanceof Date)value[key]=row[key].toISOString().slice(0,10);return value;}
function sdk(user){return{rpc(name,args){let singular=false;return{single(){singular=true;return this;},async then(resolve){try{
 let sql,values;if(name==='create_quote'){sql='select * from public.create_quote($1,$2::jsonb)';values=[args.p_company_id,JSON.stringify(args.p_input)];}
 else if(name==='update_quote'){sql='select * from public.update_quote($1,$2,$3,$4::jsonb)';values=[args.p_company_id,args.p_quote_id,args.p_revision,JSON.stringify(args.p_input)];}
 else{assert.equal(name,'remove_quote');sql='select public.remove_quote($1,$2,$3)';values=[args.p_company_id,args.p_quote_id,args.p_revision];}
 const rows=(await as(user,sql,values)).rows.map(wire);resolve({data:singular?rows[0]:null,error:singular&&rows.length!==1?{code:'PGRST116'}:null});
 }catch(error){resolve({data:null,error:{code:error.code||'unknown'}});}}};},from(table){assert.equal(table,'quotes');let company,offset=0,limit=250;return{select(){return this;},eq(field,value){assert.equal(field,'company_id');company=value;return this;},order(field){assert.equal(field,'number');return this;},range(start,end){offset=start;limit=Math.min(250,end-start+1);return this;},async then(resolve){try{const count=Number((await as(user,'select count(*) from public.quotes where company_id=$1',[company])).rows[0].count);const data=(await as(user,`select * from public.quotes where company_id=$1 order by number desc limit ${limit} offset ${offset}`,[company])).rows.map(wire);resolve({data,error:null,count});}catch(error){resolve({data:null,error:{code:error.code||'unknown'},count:null});}}};}};}
const repo=(user,company=a)=>createSupabaseQuoteRepository(sdk(user),company);
function input(client=clientA,patch={}){return {clientId:client,date:'2026-01-01',validUntil:'2099-12-31',status:'draft',items:[{id:'one',description:'Serviço',quantityMilli:1500,unit:'h',unitPriceCents:101},{id:'two',description:'Material',quantityMilli:2000,unit:'un',unitPriceCents:1000}],discount:{kind:'fixed',value:152},notes:'Observação',paymentTerms:'50% na contratação',...patch};}
async function denied(user,sql,args=[],codes=['42501']){await assert.rejects(as(user,sql,args),error=>codes.includes(error.code));}
after(async()=>{await db.close();fs.rmSync(temp,{recursive:true,force:true});});
test('incremental migration preserves existing companies/clients and enables RLS without direct writes',async()=>{
 await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;grant usage on schema auth to anon,authenticated;create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}'::jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant execute on function auth.uid() to anon,authenticated;`);
 for(const f of fs.readdirSync(path.join(__dirname,'../supabase/migrations')).filter(n=>n.endsWith('.sql')&&n<'20261104000100_quotes.sql').sort())await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',f),'utf8'));
 for(const id of [owner,other,member,viewer,pending])await db.query('insert into auth.users(id,email_confirmed_at) values($1,case when $2::boolean then now() else null end)',[id,id!==pending]);
 a=(await as(owner,"select public.create_company('Mesmo nome',null) as id")).rows[0].id;b=(await as(other,"select public.create_company('Mesmo nome',null) as id")).rows[0].id;
 await as(owner,"select public.add_company_member($1,$2,'member')",[a,member]);await as(owner,"select public.add_company_member($1,$2,'viewer')",[a,viewer]);await as(other,"select public.add_company_member($1,$2,'admin')",[b,member]);
 async function client(user,company,name,document){return(await as(user,"insert into public.clients(company_id,type,name,document) values($1,'individual',$2,$3) returning id",[company,name,document])).rows[0].id;}
 clientA=await client(owner,a,'Cliente Original','11111111111');clientA2=await client(owner,a,'Cliente Alternativo','22222222222');clientB=await client(other,b,'Cliente Outra Empresa','11111111111');
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261104000100_quotes.sql'),'utf8'));
 assert.equal((await as(owner,'select * from public.clients')).rows.length,2);assert.equal((await as(other,'select * from public.clients')).rows[0].id,clientB);
 assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.quotes'::regclass")).rows[0].relrowsecurity,true);assert.equal((await db.query("select count(*) from pg_policies where schemaname='public' and tablename='quotes'")).rows[0].count,4);
});
test('adapter binds UUID, assigns atomic number/revision and generates authoritative snapshots/totals',async()=>{
 first=await repo(owner).create({...input(),number:999,revision:99,company_id:b,clientSnapshot:{name:'Forged'},companySnapshot:{name:'Forged'},total:1});
 assert.equal(first.number,1);assert.equal(first.revision,1);assert.equal(first.clientSnapshot.name,'Cliente Original');assert.equal(first.companySnapshot.name,'Mesmo nome');assert.equal(first.issuedAt,null);assert.deepEqual(totals(first),{subtotal:2152,discount:152,total:2000});
 const stored=(await as(owner,'select * from public.quotes where id=$1',[first.id])).rows[0];assert.equal(stored.company_id,a);assert.equal(stored.created_by,owner);assert.equal(stored.total_cents,2000);
});
test('database exact arithmetic matches half-up JS arithmetic for fixed and percent discounts',async()=>{
 for(const value of [0,1250,5000,10000]){const quote=await repo(owner).create(input(clientA,{discount:{kind:'percent',value}}));const stored=(await as(owner,'select * from public.quotes where id=$1',[quote.id])).rows[0];assert.equal(stored.discount_cents,totals(quote).discount);assert.equal(stored.total_cents,totals(quote).total);}
 const one=await repo(owner).create(input(clientA,{items:[{id:'one-cent',description:'Item',unit:'un',quantityMilli:1000,unitPriceCents:1}],discount:{kind:'percent',value:5000}}));assert.equal(totals(one).discount,1);
});
test('numbering is per UUID company, is not reused after deletion and does not consume failed writes',async()=>{
 const own=await repo(other,b).create(input(clientB));assert.equal(own.number,1);
 const newest=(await repo(owner).list())[0];await repo(owner).remove(newest.id,newest.revision);const next=await repo(owner).create(input());assert.equal(next.number,newest.number+1);
 const before=(await db.query('select last_number from private.quote_counters where company_id=$1',[a])).rows[0].last_number;
 await db.exec(`create function private.reject_test_quote() returns trigger language plpgsql as $$begin raise exception 'test failure'; end$$;create trigger reject_test_quote before insert on public.quotes for each row execute function private.reject_test_quote();`);
 await assert.rejects(repo(owner).create(input()));await db.exec('drop trigger reject_test_quote on public.quotes;drop function private.reject_test_quote()');
 assert.equal((await db.query('select last_number from private.quote_counters where company_id=$1',[a])).rows[0].last_number,before);assert.equal((await repo(owner).create(input())).number,before+1);
});
test('RLS rejects outsiders and RPCs reject foreign client/quote UUIDs even for multi-company members',async()=>{
 assert.equal((await repo(other,a).list()).length,0);await assert.rejects(repo(other,a).create(input()),/permissão/);
 await assert.rejects(repo(member,a).create(input(clientB)),/indisponível/);await assert.rejects(repo(owner).update((await repo(other,b).list())[0].id,input(),1),/indisponível/);
 await assert.rejects(repo(owner).remove((await repo(other,b).list())[0].id,1),/indisponível/);
 await denied(other,"update public.quotes set company_id=$1 where id=$2",[b,first.id]);
});
test('viewers read only; members create/edit but cannot delete; admins act only in their company',async()=>{
 assert.ok((await repo(viewer).list()).length>0);await assert.rejects(repo(viewer).create(input()),/permissão/);await assert.rejects(repo(viewer).update(first.id,input(),1),/permissão/);await assert.rejects(repo(viewer).remove(first.id,1),/permissão/);
 const memberQuote=await repo(member).create(input());await repo(member).update(memberQuote.id,input(),1);await assert.rejects(repo(member).remove(memberQuote.id,2),/permissão/);
 const adminQuote=await repo(member,b).create(input(clientB));await repo(member,b).remove(adminQuote.id,1);
 await assert.rejects(repo(null).list(),/permissão/);await assert.rejects(repo(null).create(input()),/permissão/);
});
test('direct DML, counter manipulation and internal helper execution are denied even to owner API sessions',async()=>{
 await denied(owner,'update public.quotes set revision=999 where id=$1',[first.id]);await denied(owner,'delete from public.quotes where id=$1',[first.id]);await denied(owner,"insert into public.quotes(company_id,number) values($1,999)",[a]);
 await denied(owner,'select * from private.quote_counters');await denied(owner,'update private.quote_counters set last_number=1');
 await denied(owner,'select private.validate_quote_input($1::jsonb)',[JSON.stringify(input())]);await denied(owner,'select private.capture_quote_client($1,$2)',[a,clientA]);await denied(owner,"select private.require_quote_access($1,'create')",[a]);
 const f=(await db.query("select p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('create_quote','update_quote','remove_quote','has_quotes_access') and p.prosecdef and n.nspname in ('public','private')")).rows;assert.equal(f.length,4);assert.ok(f.every(row=>row.proconfig.some(value=>value.startsWith('search_path='))));
});
test('optimistic revisions prevent stale edits/deletions and preserve previous committed data',async()=>{
 const updated=await repo(owner).update(first.id,input(clientA,{notes:'New revision'}),first.revision);assert.equal(updated.revision,2);
 await assert.rejects(repo(owner).update(first.id,input(),1),/outra sessão/);await assert.rejects(repo(owner).remove(first.id,1),/outra sessão/);assert.equal((await repo(owner).list()).find(q=>q.id===first.id).notes,'New revision');first=updated;
});
test('draft client data refreshes on save; issued snapshots survive edits/deletion and return to draft',async()=>{
 const draft=await repo(owner).create(input());await as(owner,"update public.clients set name='Cliente Atualizado' where id=$1",[clientA]);
 const refreshed=await repo(owner).update(draft.id,input(),1);assert.equal(refreshed.clientSnapshot.name,'Cliente Atualizado');
 const issued=await repo(owner).update(draft.id,input(clientA,{status:'sent'}),2);assert.ok(issued.issuedAt);
 await as(owner,"update public.clients set name='Nome Posterior' where id=$1",[clientA]);
 await assert.rejects(repo(owner).update(issued.id,input(clientA2,{status:'sent'}),issued.revision),/emitida/);
 await as(owner,'delete from public.clients where id=$1',[clientA]);
 const preserved=await repo(owner).update(issued.id,input(clientA,{status:'draft'}),issued.revision);assert.equal(preserved.clientSnapshot.name,'Cliente Atualizado');assert.equal(preserved.issuedAt,issued.issuedAt);
 await assert.rejects(repo(owner).update(first.id,input(),first.revision),/indisponível/);
 const duplicated=duplicateInput(preserved,[]);assert.equal(duplicated.clientId,'');await assert.rejects(repo(owner).create(duplicated));
 const copy=await repo(owner).create({...duplicated,clientId:clientA2});assert.equal(copy.status,'draft');assert.equal(copy.issuedAt,null);assert.equal(copy.clientSnapshot.name,'Cliente Alternativo');assert.notEqual(copy.id,preserved.id);
 await repo(owner).remove(copy.id,copy.revision);assert.equal((await as(owner,'select id from public.clients where id=$1',[clientA2])).rows.length,1);
});
test('database rejects malformed JSON, unsafe numeric values, duplicate items and invalid status/date/discount',async()=>{
 const valid=input(clientA2);const bad=[null,{}, {...valid,items:[]},{...valid,items:[valid.items[0],valid.items[0]]},{...valid,items:[{...valid.items[0],quantityMilli:1.5}]},{...valid,items:[{...valid.items[0],unitPriceCents:-1}]},{...valid,items:[{...valid.items[0],quantityMilli:1000000000,unitPriceCents:10000000000}]},{...valid,discount:{kind:'fixed',value:999999}},{...valid,discount:{kind:'percent',value:10001}},{...valid,validUntil:'2025-01-01'},{...valid,status:'owner'},{...valid,status:'expired'},{...valid,notes:{text:'bad'}}];
 for(const payload of bad)await denied(owner,'select * from public.create_quote($1,$2::jsonb)',[a,JSON.stringify(payload)],['22023']);
 for(const payload of [null,{}, {...valid,items:null},{...valid,clientId:'not-a-uuid'}])await assert.rejects(repo(owner).create(payload));
});
test('fresh sessions see persisted quotes; revocation and unconfirmed email block subsequent operations',async()=>{
 const q=await repo(owner).create(input(clientA2));assert.equal((await repo(owner).list()).find(row=>row.id===q.id).id,q.id);
 await as(owner,'select public.remove_company_member($1,$2)',[a,member]);assert.equal((await repo(member).list()).length,0);await assert.rejects(repo(member).create(input(clientA2)),/permissão/);
 await db.query("insert into public.company_memberships(company_id,user_id,role) values($1,$2,'member')",[a,pending]);assert.equal((await repo(pending).list()).length,0);await assert.rejects(repo(pending).create(input(clientA2)),/permissão/);
});
test('listing paginates beyond PostgREST caps and preserves company isolation',async()=>{
 await db.query(`insert into public.quotes(company_id,number,client_id,client_snapshot,company_snapshot,date,valid_until,status,items,discount_kind,discount_value,subtotal_cents,discount_cents,total_cents,notes,payment_terms,issued_at)
 select q.company_id,10000+n,q.client_id,q.client_snapshot,q.company_snapshot,q.date,q.valid_until,q.status,q.items,q.discount_kind,q.discount_value,q.subtotal_cents,q.discount_cents,q.total_cents,q.notes,q.payment_terms,q.issued_at
 from (select * from public.quotes where company_id=$1 limit 1) q cross join generate_series(1,1005) n`,[b]);
 const rows=await repo(other,b).list();assert.equal(rows.length,1006);assert.equal(new Set(rows.map(q=>q.id)).size,1006);assert.ok((await repo(owner).list()).every(q=>q.companySnapshot.name==='Mesmo nome'));
});
test('competing requests receive distinct numbers and only one stale-revision update commits',async()=>{
 await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
 try{
  const created=await Promise.all([db.query('select * from public.create_quote($1,$2::jsonb)',[a,JSON.stringify(input(clientA2))]),db.query('select * from public.create_quote($1,$2::jsonb)',[a,JSON.stringify(input(clientA2))])]);
  const rows=created.map(result=>result.rows[0]);assert.notEqual(rows[0].number,rows[1].number);
  const updated=await Promise.allSettled([db.query('select * from public.update_quote($1,$2,$3,$4::jsonb)',[a,rows[0].id,1,JSON.stringify(input(clientA2,{notes:'A'}))]),db.query('select * from public.update_quote($1,$2,$3,$4::jsonb)',[a,rows[0].id,1,JSON.stringify(input(clientA2,{notes:'B'}))])]);
  assert.equal(updated.filter(result=>result.status==='fulfilled').length,1);assert.equal(updated.find(result=>result.status==='rejected').reason.code,'40001');
 }finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");}
});
