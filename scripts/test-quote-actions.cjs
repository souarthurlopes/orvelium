// Tests real server-action code with verified context/repository doubles; no network.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
class QuoteRepositoryError extends Error{}
function load(options={}){
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../app/painel/quote-actions.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const calls=[];const invalidations=[];let active='company-a';
 const row={id:'quote-a',name:'Remote'};
 const repository=Object.fromEntries(['list','create','update','remove'].map(operation=>[operation,async(...args)=>{calls.push([operation,...args]);if(options.failure)throw options.failure;return operation==='list'?[row]:row;}]));
 const exports={};
 const mocks={'next/cache':{revalidatePath:value=>{if(options.cacheFailure)throw new Error('cache failed');invalidations.push(value);}},'@/lib/supabase/auth':{requireCompany:async()=>{if(options.authFailure)throw options.authFailure;return{active:{id:active},supabase:{verified:true}};}},'@/lib/quotes/supabase-repository':{QuoteRepositoryError,createSupabaseQuoteRepository(supabase,id){assert.equal(supabase.verified,true);assert.equal(id,active);return repository;}}};
 require('node:vm').runInNewContext(code,{exports,Error,require(name){assert.ok(name in mocks,name);return mocks[name];}});
 return{actions:exports,calls,invalidations,setActive(id){active=id}};
}
test('every quote action binds to active UUID and rejects stale/cross-company operations before repository access',async()=>{
 const f=load();
 for(const [name,args]of [['listQuotesAction',[]],['createQuoteAction',[{}]],['updateQuoteAction',['quote-a',{},1]],['removeQuoteAction',['quote-a',1]]]){
  assert.match((await f.actions[name]('company-b',...args)).error,/empresa ativa mudou/);
 }
 assert.equal(f.calls.length,0);
 assert.equal((await f.actions.listQuotesAction('company-a')).data[0].id,'quote-a');
 await f.actions.createQuoteAction('company-a',{name:'create'});await f.actions.updateQuoteAction('company-a','quote-a',{name:'update'},7);assert.equal((await f.actions.removeQuoteAction('company-a','quote-a',7)).data,null);
 assert.deepEqual(f.calls.map(call=>call[0]),['list','create','update','remove']);assert.deepEqual(f.invalidations,['/painel','/painel','/painel']);
 f.setActive('company-b');assert.ok((await f.actions.listQuotesAction('company-a')).error);assert.equal((await f.actions.listQuotesAction('company-b')).data.length,1);
});
test('missing/expired account and revoked company context redirect rather than reporting success',async()=>{
 const redirect=Object.assign(new Error('redirect'),{digest:'NEXT_REDIRECT'});const f=load({authFailure:redirect});
 for(const name of ['listQuotesAction','createQuoteAction','updateQuoteAction','removeQuoteAction'])await assert.rejects(f.actions[name]('company-a','id',{}),error=>error===redirect);
 assert.equal(f.calls.length,0);
});
test('only safe repository errors are returned; unexpected SDK errors never expose internals',async()=>{
 const safe=load({failure:new QuoteRepositoryError('Já existe um cliente com esse número nesta empresa.')});assert.match((await safe.actions.createQuoteAction('company-a',{})).error,/Já existe/);
 const internal=load({failure:new Error('sensitive internal detail')});const reply=await internal.actions.createQuoteAction('company-a',{});assert.ok(reply.error);assert.ok(!reply.error.includes('sensitive'));assert.equal(reply.data,undefined);
});

test('cache refresh failure never reports a committed quote write as failed',async()=>{const f=load({cacheFailure:true});const response=await f.actions.createQuoteAction('company-a',{});assert.equal(response.data.id,'quote-a');assert.equal(response.error,undefined);});
