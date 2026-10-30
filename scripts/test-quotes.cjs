const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');const os=require('node:os');const path=require('node:path');const ts=require('typescript');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'orvelium-quotes-tests-'));
for(const [folder,names] of [['clients',['types','local-repository']],['quotes',['types','local-repository','pdf']]]){
 fs.mkdirSync(path.join(output,folder));
 for(const name of names){const source=fs.readFileSync(path.join(__dirname,`../lib/${folder}/${name}.ts`),'utf8');fs.writeFileSync(path.join(output,folder,`${name}.js`),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText);}
}
after(()=>fs.rmSync(output,{recursive:true,force:true}));
const {createLocalClientRepository}=require(path.join(output,'clients/local-repository.js'));
const {emptyClient}=require(path.join(output,'clients/types.js'));
const {createLocalQuoteRepository,quoteStorageKey}=require(path.join(output,'quotes/local-repository.js'));
const {parseDecimal,totals,lineSubtotal,validateQuote,effectiveStatus,duplicateInput,today}=require(path.join(output,'quotes/types.js'));
const {whatsappUrl}=require(path.join(output,'quotes/pdf.js'));
const store=new Map();let failWrite=false;
global.window={localStorage:{getItem:key=>store.get(key)??null,setItem:(key,value)=>{if(failWrite)throw new Error('Quota');store.set(key,value)}}};
async function fixture(name){const clients=createLocalClientRepository(name);const client=await clients.create({...emptyClient,name:'Cliente Exemplo',document:'00000000000',email:'cliente@example.com',address:'Rua Exemplo, 100'});const repo=createLocalQuoteRepository(name,clients);return{repo,clients,client,input:{clientId:client.id,date:'2026-01-01',validUntil:'2026-12-31',status:'draft',items:[{id:crypto.randomUUID(),description:'Serviço fictício',quantityMilli:1500,unit:'h',unitPriceCents:101}],discount:{kind:'fixed',value:2},notes:'Observação fictícia',paymentTerms:'Sem pagamento real'}};}
test('decimal parsing is exact and rejects ambiguity, negatives and excess precision',()=>{
 assert.equal(parseDecimal('0,10'),10);assert.equal(parseDecimal('0.20'),20);assert.equal(parseDecimal('1,125',3),1125);
 for(const value of ['1.000,00','-1','1.001','1e2','Infinity','', '9007199254740992'])assert.equal(parseDecimal(value),null);
});
test('integer subtotals use half-up rounding; percentage discount and fixed discount',()=>{
 const items=[{quantityMilli:1500,unitPriceCents:101}];assert.equal(lineSubtotal(items[0]),152);
 assert.deepEqual(totals({items,discount:{kind:'fixed',value:2}}),{subtotal:152,discount:2,total:150});
 assert.deepEqual(totals({items:[{quantityMilli:1000,unitPriceCents:10001}],discount:{kind:'percent',value:1250}}),{subtotal:10001,discount:1250,total:8751});
 assert.equal(lineSubtotal({quantityMilli:5,unitPriceCents:100}),1);
 assert.throws(()=>totals({items,discount:{kind:'fixed',value:153}}));assert.throws(()=>totals({items,discount:{kind:'percent',value:10001}}));
 assert.throws(()=>lineSubtotal({quantityMilli:NaN,unitPriceCents:1}));assert.throws(()=>lineSubtotal({quantityMilli:1e12,unitPriceCents:1e12}));
});
test('dates, item count, zero quantity, invalid prices and status are validated',async()=>{
 const {input}=await fixture('validation');assert.equal(validateQuote(input),null);
 for(const patch of [{clientId:''},{date:'2026-02-30'},{validUntil:'2025-01-01'},{status:'other'},{items:[]},{items:[{...input.items[0],quantityMilli:0}]},{items:[{...input.items[0],unitPriceCents:-1}]},{items:[{...input.items[0],description:' '}]}])assert.ok(validateQuote({...input,...patch}));
});
test('CRUD, persistence, numbering, duplication and deletion preserve client',async()=>{
 const {repo,input,client,clients}=await fixture('crud');const q=await repo.create(input);assert.equal(q.number,1);assert.equal(q.clientId,client.id);
 assert.equal((await createLocalQuoteRepository('crud').list())[0].id,q.id);
 const changed=await repo.update(q.id,{...input,notes:'Atualizado'},q.revision);assert.equal(changed.revision,2);
 const duplicate=duplicateInput(changed,await clients.list());assert.equal(duplicate.status,'draft');assert.notEqual(duplicate.items[0].id,q.items[0].id);assert.equal(duplicate.items[0].unitPriceCents,q.items[0].unitPriceCents);
 const copy=await repo.create(duplicate);assert.equal(copy.number,2);assert.notEqual(copy.id,q.id);await repo.remove(copy.id,copy.revision);
 assert.equal((await repo.create(input)).number,3);assert.equal((await clients.list()).length,1);
});
test('workspace boundaries reject client IDs from another company',async()=>{
 const {repo,input}=await fixture('scopeA');assert.deepEqual(await createLocalQuoteRepository('scopeB').list(),[]);
 await assert.rejects(createLocalQuoteRepository('scopeB').create(input),/Cliente não encontrado/);await repo.create(input);assert.equal((await repo.list()).length,1);
});
test('issued snapshots are immutable after client edits or deletion',async()=>{
 const {repo,input,clients,client}=await fixture('issued');const q=await repo.create({...input,status:'sent'});assert.ok(q.issuedAt);
 await clients.update(client.id,{...client,name:'Cliente Alterado',address:'Outro endereço fictício'});
 let changed=await repo.update(q.id,{...input,status:'approved'},q.revision);assert.equal(changed.clientSnapshot.name,'Cliente Exemplo');assert.equal(changed.clientSnapshot.address,'Rua Exemplo, 100');
 await clients.remove(client.id);changed=await repo.update(q.id,{...input,status:'rejected'},changed.revision);assert.equal(changed.clientSnapshot.name,'Cliente Exemplo');
 assert.equal((await repo.list())[0].clientId,client.id);assert.equal(duplicateInput(changed,[]).clientId,'');await assert.rejects(repo.create(duplicateInput(changed,[])),/Selecione/);
 await assert.rejects(repo.update(q.id,{...input,clientId:'other'},changed.revision),/não pode ser trocado/);
});
test('draft snapshots refresh from real repository, removed clients must be reselected',async()=>{
 const {repo,input,clients,client}=await fixture('draft');const q=await repo.create(input);await clients.update(client.id,{...client,name:'Cliente Atualizado'});
 const changed=await repo.update(q.id,input,q.revision);assert.equal(changed.clientSnapshot.name,'Cliente Atualizado');await clients.remove(client.id);await assert.rejects(repo.update(q.id,input,changed.revision),/Cliente não encontrado/);
});
test('expiry respects inclusive validity and final decisions',()=>{
 assert.equal(effectiveStatus({status:'sent',validUntil:'2026-01-02'},'2026-01-02'),'sent');assert.equal(effectiveStatus({status:'sent',validUntil:'2026-01-02'},'2026-01-03'),'expired');
 for(const status of ['approved','rejected','draft'])assert.equal(effectiveStatus({status,validUntil:'2026-01-01'},'2026-01-03'),status);
 assert.match(today(),/^\d{4}-\d{2}-\d{2}$/);
});
test('stale revisions cannot overwrite or delete newer proposals',async()=>{
 const {repo,input}=await fixture('revision');const q=await repo.create(input);await repo.update(q.id,input,q.revision);
 await assert.rejects(repo.update(q.id,input,q.revision),/outra aba/);await assert.rejects(repo.remove(q.id,q.revision),/mudou/);
});
test('corrupt quote storage is preserved and mutations are blocked',async()=>{
 const {repo,input}=await fixture('corrupt');const key=quoteStorageKey('corrupt');store.set(key,'{invalid');await assert.rejects(repo.list(),/preservados/);await assert.rejects(repo.create(input),/preservados/);assert.equal(store.get(key),'{invalid');
});
test('failed writes do not consume numbers or lose previous data',async()=>{
 const {repo,input}=await fixture('quota');const q=await repo.create(input);const raw=store.get(quoteStorageKey('quota'));failWrite=true;
 try{await assert.rejects(repo.remove(q.id,q.revision),/Não foi possível salvar/);}finally{failWrite=false;}
 assert.equal(store.get(quoteStorageKey('quota')),raw);assert.equal((await repo.create(input)).number,2);
});
test('WhatsApp contains only a truthful text summary, no fabricated public link',async()=>{
 const {repo,input}=await fixture('whatsapp');const q=await repo.create(input);const url=new URL(whatsappUrl(q));assert.equal(url.hostname,'wa.me');const text=url.searchParams.get('text');assert.match(text,/ORC-000001/);assert.match(text,/não inclui arquivo ou link público/);assert.match(text,/anexado manualmente/);assert.ok(!text.includes('http'));
});
