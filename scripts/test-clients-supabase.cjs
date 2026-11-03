// Real PostgreSQL/RLS + the production repository. SDK transport/auth are simulated.
// All DDL and records exist only in an embedded temporary PGlite database.
const {test,after}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),ts=require('typescript');
const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'orvelium-clients-db-'));
for(const name of ['types','supabase-repository'])fs.writeFileSync(path.join(temp,name+'.js'),ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/clients',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText);
const {createSupabaseClientRepository,countActiveClients}=require(path.join(temp,'supabase-repository.js'));
const {emptyClient}=require(path.join(temp,'types.js'));
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',member='10000000-0000-4000-8000-000000000003',viewer='10000000-0000-4000-8000-000000000004',pending='10000000-0000-4000-8000-000000000005';
let companyA,companyB,clientA,clientB;
async function as(user,sql,params=[]){
 await db.exec(`set role ${user?'authenticated':'anon'}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);
 try{return await db.query(sql,params);}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");}
}
async function denied(user,sql,params=[],code='42501'){await assert.rejects(as(user,sql,params),error=>error.code===code);}
const input={...emptyClient,name:'Pessoa Remota',document:'000.000.000-00',phone:'(11) 99999-9999'};
// Minimal PostgREST query builder backed by actual SQL roles/RLS, with a 250-row cap.
function sdk(user){return {from(table){assert.equal(table,'clients');let operation='select',values,filters=[],orders=[],offset=0,limit=250,single=false,head=false;
 const query={
  select(columns,options){head=!!options?.head;return this;},
  insert(row){operation='insert';values=row;return this;},update(row){operation='update';values=row;return this;},delete(){operation='delete';return this;},
  eq(field,value){filters.push([field,value]);return this;},order(field){orders.push(field);return this;},range(start,end){offset=start;limit=Math.min(250,end-start+1);return this;},single(){single=true;return this;},
  async then(resolve,reject){
   try{
    let count=null;const params=[];const bind=value=>{params.push(value);return '$'+params.length};
    const where=()=>filters.length?' where '+filters.map(([field,value])=>{assert.ok(['id','company_id','status'].includes(field));return field+'='+bind(value)}).join(' and '):'';
    let sql;
    if(operation==='select'){
     const filter=where();count=Number((await as(user,'select count(*) from public.clients'+filter,params)).rows[0].count);
     sql='select * from public.clients'+filter+(orders.length?' order by '+orders.join(','):'')+` limit ${limit} offset ${offset}`;
    }else if(operation==='insert'){
     const fields=Object.keys(values);sql='insert into public.clients('+fields.join(',')+') values('+fields.map(field=>bind(values[field])).join(',')+') returning *';
    }else if(operation==='update'){
     sql='update public.clients set '+Object.entries(values).map(([field,value])=>field+'='+bind(value)).join(',')+where()+' returning *';
    }else sql='delete from public.clients'+where()+' returning *';
    const rows=(await as(user,sql,params)).rows;
    resolve(single?(rows.length===1?{data:rows[0],error:null,count}:{data:null,error:{code:'PGRST116'},count}):{data:head?null:rows,error:null,count});
   }catch(error){resolve({data:null,error:{code:error.code||'unknown'},count:null});}
  },
 };return query;}};}
after(async()=>{await db.close();fs.rmSync(temp,{recursive:true,force:true});});
test('incremental migration preserves existing tables and creates RLS/least-privilege grants',async()=>{
 await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;grant usage on schema auth to anon,authenticated;create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}'::jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant execute on function auth.uid() to anon,authenticated;`);
 const files=fs.readdirSync(path.join(__dirname,'../supabase/migrations')).filter(name=>name.endsWith('.sql')).sort();
 for(const file of files.filter(name=>name!=='20261103000100_clients.sql'))await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
 for(const user of [owner,other,member,viewer,pending])await db.query('insert into auth.users(id,email_confirmed_at) values($1,case when $2::boolean then now() else null end)',[user,user!==pending]);
 companyA=(await as(owner,"select public.create_company('Mesmo nome',null) as id")).rows[0].id;
 companyB=(await as(other,"select public.create_company('Mesmo nome',null) as id")).rows[0].id;
 await as(owner,"select public.add_company_member($1,$2,'member')",[companyA,member]);await as(owner,"select public.add_company_member($1,$2,'viewer')",[companyA,viewer]);await as(other,"select public.add_company_member($1,$2,'admin')",[companyB,member]);
 const before=(await db.query('select count(*) from public.company_memberships')).rows[0].count;
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261103000100_clients.sql'),'utf8'));
 assert.equal((await db.query('select count(*) from public.company_memberships')).rows[0].count,before);
 assert.equal((await as(owner,'select id from public.companies where id=$1',[companyA])).rows[0].id,companyA);
 assert.notEqual(companyA,companyB);
 assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.clients'::regclass")).rows[0].relrowsecurity,true);
 assert.equal((await db.query("select count(*) from pg_policies where schemaname='public' and tablename='clients'")).rows[0].count,4);
 assert.equal((await db.query("select has_function_privilege('anon','private.has_clients_access(uuid,text)','execute') as allowed")).rows[0].allowed,false);
});
test('repository creates normalized persisted records; fresh sessions/devices read the same database',async()=>{
 const repo=createSupabaseClientRepository(sdk(owner),companyA);
 clientA=await repo.create({...input,company_id:companyB,created_by:other,id:other});
 assert.equal(clientA.document,'00000000000');assert.equal(clientA.phone,'11999999999');
 const row=(await as(owner,'select * from public.clients where id=$1',[clientA.id])).rows[0];assert.equal(row.company_id,companyA);assert.equal(row.created_by,owner);assert.notEqual(row.id,other);
 await assert.rejects(createSupabaseClientRepository(sdk(null),companyA).list(),/permissão/);
 assert.equal((await createSupabaseClientRepository(sdk(owner),companyA).list())[0].id,clientA.id);
 await repo.update(clientA.id,{...input,name:'Editado',status:'inactive'});assert.equal((await createSupabaseClientRepository(sdk(member),companyA).list())[0].name,'Editado');assert.equal(await countActiveClients(sdk(owner),companyA),0);
});
test('unique documents are enforced per UUID company including normalized create and update',async()=>{
 const repo=createSupabaseClientRepository(sdk(owner),companyA);
 await assert.rejects(repo.create({...input,document:'00000000000'}),/Já existe/);
 clientB=await createSupabaseClientRepository(sdk(other),companyB).create(input);assert.notEqual(clientA.id,clientB.id);
 const second=await repo.create({...input,document:'11111111111'});
 await assert.rejects(repo.update(second.id,input),/Já existe/);await repo.remove(second.id);
 await denied(owner,'insert into public.clients(company_id,type,name,document) values($1,$2,$3,$4)',[companyA,'individual','Duplicate','00000000000'],'23505');
});
test('foreign company IDs and record UUIDs cannot be read, edited, removed or inserted by outsiders',async()=>{
 assert.equal((await as(other,'select * from public.clients where company_id=$1',[companyA])).rows.length,0);
 assert.equal((await as(other,"update public.clients set name='Attack' where id=$1 returning id",[clientA.id])).rows.length,0);
 assert.equal((await as(other,'delete from public.clients where id=$1 returning id',[clientA.id])).rows.length,0);
 await denied(other,"insert into public.clients(company_id,type,name,document) values($1,'individual','Attack','11111111111')",[companyA]);
 const repo=createSupabaseClientRepository(sdk(owner),companyA);
 await assert.rejects(repo.update(clientB.id,input),/não encontrado/);await assert.rejects(repo.remove(clientB.id),/não encontrado/);
 assert.equal((await repo.list()).length,1);assert.equal((await createSupabaseClientRepository(sdk(owner),companyB).list()).length,0);
});
test('viewer is read-only; member writes but cannot delete; admin deletes only in own company',async()=>{
 assert.equal((await createSupabaseClientRepository(sdk(viewer),companyA).list()).length,1);
 await assert.rejects(createSupabaseClientRepository(sdk(viewer),companyA).create({...input,document:'11111111111'}),/permissão/);
 await assert.rejects(createSupabaseClientRepository(sdk(viewer),companyA).update(clientA.id,input),/não encontrado/);
 await assert.rejects(createSupabaseClientRepository(sdk(viewer),companyA).remove(clientA.id),/não encontrado/);
 const memberRepo=createSupabaseClientRepository(sdk(member),companyA);const row=await memberRepo.create({...input,document:'22222222222'});await memberRepo.update(row.id,{...input,document:'22222222222',name:'Member edit'});await assert.rejects(memberRepo.remove(row.id),/não encontrado/);
 await createSupabaseClientRepository(sdk(member),companyB).remove(clientB.id);assert.equal((await createSupabaseClientRepository(sdk(other),companyB).list()).length,0);
 await createSupabaseClientRepository(sdk(owner),companyA).remove(row.id);
});
test('API roles cannot overwrite IDs, company ownership, authorship or timestamps',async()=>{
 for(const [field,value]of [['company_id',companyB],['id',other],['created_by',other],['created_at','2000-01-01'],['updated_at','2000-01-01']])await denied(owner,`update public.clients set ${field}=$1 where id=$2`,[value,clientA.id]);
 await denied(owner,"insert into public.clients(id,company_id,type,name,document) values($1,$2,'individual','Spoof','33333333333')",[other,companyA]);
 const before=(await as(owner,'select updated_at from public.clients where id=$1',[clientA.id])).rows[0].updated_at;
 await as(owner,"update public.clients set name='Timestamp verified' where id=$1",[clientA.id]);const after=(await as(owner,'select updated_at from public.clients where id=$1',[clientA.id])).rows[0].updated_at;assert.ok(after>=before);
});
test('database and adapter reject invalid fields, malformed runtime payloads and raw IDs',async()=>{
 const repo=createSupabaseClientRepository(sdk(owner),companyA);
 for(const patch of [{document:'12'},{phone:'abc'},{email:'bad'},{state:'XX'},{name:' '},{notes:'x'.repeat(2001)}])await assert.rejects(repo.create({...input,...patch}));
 for(const bad of [null,{}, {name:12}])await assert.rejects(repo.create(bad),/Revise/);
 await assert.rejects(repo.remove('other-company-name'),/inválido/);
 for(const [field,value]of [['document','bad'],['phone','1'],['email','invalid'],['state','XX'],['name',' '],['type','bad'],['status','bad'],['notes','x'.repeat(2001)]])await denied(owner,`update public.clients set ${field}=$1 where id=$2`,[value,clientA.id],'23514');
});
test('revoked memberships and unconfirmed accounts lose database access immediately',async()=>{
 await as(owner,'select public.remove_company_member($1,$2)',[companyA,member]);assert.equal((await createSupabaseClientRepository(sdk(member),companyA).list()).length,0);
 await assert.rejects(createSupabaseClientRepository(sdk(member),companyA).create({...input,document:'33333333333'}),/permissão/);
 await db.query("insert into public.company_memberships(company_id,user_id,role) values($1,$2,'member')",[companyA,pending]);
 assert.equal((await as(pending,'select * from public.clients where company_id=$1',[companyA])).rows.length,0);await denied(pending,"insert into public.clients(company_id,type,name,document) values($1,'individual','Pending','33333333333')",[companyA]);
});
test('listing paginates past PostgREST row caps without truncation',async()=>{
 await db.query("insert into public.clients(company_id,type,name,document) select $1,'individual','Paginated '||n,lpad(n::text,11,'0') from generate_series(1,1005) as n",[companyB]);
 const rows=await createSupabaseClientRepository(sdk(other),companyB).list();assert.equal(rows.length,1005);assert.equal(await countActiveClients(sdk(other),companyB),1005);assert.equal(new Set(rows.map(row=>row.id)).size,1005);
 assert.equal((await createSupabaseClientRepository(sdk(owner),companyA).list()).length,1);
});
