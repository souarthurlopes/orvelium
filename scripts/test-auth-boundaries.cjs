const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
function load(file,mocks){
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const module={exports:{}};
 require('node:vm').runInNewContext(code,{module,exports:module.exports,Error,TextEncoder,URL,require(name){if(name in mocks)return mocks[name];throw new Error('Unexpected import: '+name);}});
 return module.exports;
}
function redirect(location){throw Object.assign(new Error('redirect'),{digest:'NEXT_REDIRECT',location});}
const confirmed={id:'user-a',email_confirmed_at:'2026-01-01'};
function fixture({user=confirmed,authError=null,throws=false,companies=[{id:'company-a',name:'Empresa real A'},{id:'company-b',name:'Empresa real B'}],memberships=[{company_id:'company-a',role:'owner'},{company_id:'company-b',role:'viewer'}],active='company-a',queryError=null}={}){
 const client={auth:{async getUser(){if(throws)throw new Error('unavailable');return {data:{user},error:authError};}},from(table){const data={profiles:{id:'user-a',full_name:'Pessoa real'},companies,company_memberships:memberships,user_preferences:{active_company_id:active}}[table];const result={data,error:queryError};const chain={select(){return this},eq(){return this},order(){return Promise.resolve(result)},single(){return Promise.resolve(result)},maybeSingle(){return Promise.resolve(result)},then(resolve,reject){return Promise.resolve(result).then(resolve,reject)}};return chain;}};
 const auth=load('lib/supabase/auth.ts',{'server-only':{},'next/navigation':{redirect},'./config':{supabaseConfigured:()=>true},'./server':{createClient:async()=>client}});
 return {auth,client};
}
async function redirects(promise,to){await assert.rejects(promise,error=>error.location===to);}
test('absent, expired, unconfirmed and failed Auth never open the dashboard',async()=>{
 for(const options of [{user:null},{authError:{code:'jwt_expired'}},{throws:true}])await redirects(fixture(options).auth.requireCompany(),'/conta/entrar');
 await redirects(fixture({user:{id:'pending'}}).auth.requireCompany(),'/conta/entrar?status=confirme-email');
});
test('confirmed account without an active authorized company must select a company',async()=>{
 for(const options of [{active:null},{companies:[],memberships:[]},{active:'foreign-company'},{memberships:[]}])await redirects(fixture(options).auth.requireCompany(),'/conta/empresas');
});
test('company context requires current membership, honors selection and fails closed on database errors',async()=>{
 const a=await fixture().auth.requireCompany();assert.equal(a.active.id,'company-a');assert.equal(a.role,'owner');
 const b=await fixture({active:'company-b'}).auth.requireCompany();assert.equal(b.active.name,'Empresa real B');assert.equal(b.role,'viewer');
 await redirects(fixture({queryError:{code:'42501'}}).auth.requireCompany(),'/conta/empresas?status=acesso-indisponivel');
});
for(const route of ['callback','confirm']){
 test(route+': confirmation requires verified user; expired links and provider failures stay out',async()=>{
  let verified={data:{user:confirmed},error:null};let operationError=null;let calls=0;
  const client={auth:{exchangeCodeForSession:async()=>{calls++;return {error:operationError}},verifyOtp:async()=>{calls++;return {error:operationError}},getUser:async()=>verified}};
  const {GET}=load(`app/auth/${route}/route.ts`,{'@/lib/supabase/server':{createClient:async()=>client},'@/lib/supabase/redirect':{authRedirect:(_,destination)=>destination,recoveryRedirect:(_,id)=>'recovery:'+id}});
  const request=query=>({nextUrl:new URL('https://app.example/auth/'+route+query)});
  const success=route==='callback'?'?code=example&next=https://attacker.example':'?token_hash=example&type=email';
  assert.equal(await GET(request(success)),'/conta/empresas');
  assert.equal(await GET(request(success+'&flow=recovery')),'recovery:user-a');
  verified={data:{user:null},error:null};assert.equal(await GET(request(success)),'/conta/entrar?status=confirmacao-invalida');
  verified={data:{user:confirmed},error:{code:'bad_jwt'}};assert.equal(await GET(request(success)),'/conta/entrar?status=confirmacao-invalida');
  operationError={code:'otp_expired'};assert.equal(await GET(request(success)),'/conta/entrar?status=confirmacao-expirada');
  const before=calls;assert.equal(await GET(request('?error=access_denied&error_code=otp_expired')),'/conta/entrar?status=confirmacao-expirada');assert.equal(calls,before);
  assert.equal(await GET(request('?next=https://attacker.example')),'/conta/entrar?status=confirmacao-invalida');
 });
}
test('selection uses authorized RPC and logout clears the local session before redirect',async()=>{
 const calls=[];let error=null;
 const client={rpc:async(name,args)=>{calls.push([name,args]);return {error}},auth:{signOut:async(options)=>{calls.push(['logout',options]);return {error}}}};
 const actions=load('app/conta/actions.ts',{'next/headers':{cookies:async()=>({delete(){}})},'next/navigation':{redirect},'next/cache':{revalidatePath(){}},'@/lib/supabase/server':{createClient:async()=>client},'@/lib/supabase/auth':{requireAccount:async()=>({supabase:client})},'@/lib/supabase/config':{isUuid:value=>value==='company-b',getSupabaseConfig:()=>null}});
 await redirects(actions.selectCompanyAction({},new Map([['company_id','company-b']])),'/painel');assert.equal(calls[0][0],'set_active_company');assert.equal(calls[0][1].p_company_id,'company-b');
 error={code:'42501'};assert.ok((await actions.selectCompanyAction({},new Map([['company_id','company-b']]))).error);
 assert.ok((await actions.signOutAction({})).error);
 error=null;await redirects(actions.signOutAction({}),'/conta/entrar?status=sessao-encerrada');assert.equal(calls.at(-1)[1].scope,'local');
});

test('authenticated dashboard renders only the selected real company and no local metrics',async()=>{
 const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
 for(const active of ['company-a','company-b']){
  const context=await fixture({active}).auth.requireCompany();
  const {default:Dashboard}=load('app/painel/page.tsx',{
   'react/jsx-runtime':require('react/jsx-runtime'),
   'next/link':{default:({href,children})=>React.createElement('a',{href},children)},
   'lucide-react':require('lucide-react'),
   '@/components/workspace/modules':load('components/workspace/modules.ts',{'lucide-react':require('lucide-react')}),
   '@/components/workspace/shell':{WorkspaceShell:({children,company,fullName,role})=>React.createElement('main',{'data-company':company.id},React.createElement('header',null,company.name+' '+fullName+' '+role),children)},
   '@/components/account/forms':{SelectCompanyForm:()=>null},
   '@/lib/supabase/auth':{requireCompany:async()=>context},
  });
  const html=renderToStaticMarkup(await Dashboard({searchParams:Promise.resolve({})}));
  assert.ok(html.includes(context.active.name));assert.ok(html.includes(active));
  for(const value of ['Studio Orvelium','DADOS FICTÍCIOS','48.250','128','localStorage','Empresa real '+(active==='company-a'?'B':'A')])assert.ok(!html.includes(value),value);
  assert.ok(html.includes('Clientes ativos: indisponível'));
  const clients=renderToStaticMarkup(await Dashboard({searchParams:Promise.resolve({modulo:'clientes'})}));
  assert.ok(clients.includes('Nenhuma contagem está disponível'));
  assert.ok(clients.includes('Clientes na sua empresa'));
  assert.ok(!clients.includes('Novo cliente'));
 }
});
function actionFixture(){
 let failure=null;let marker='user-a';let signedOut=false;const calls=[];
 const client={auth:{
  signUp:async input=>{calls.push(['signup',input]);return {error:failure}},
  signInWithPassword:async input=>{calls.push(['login',input]);return {error:failure}},
  resend:async input=>{calls.push(['resend',input]);return {error:failure}},
  resetPasswordForEmail:async(email,options)=>{calls.push(['recover',{email,options}]);return {error:failure}},
  updateUser:async input=>{calls.push(['password',input]);return {error:failure}},
  signOut:async()=>{signedOut=true;return {error:failure}},
 }};
 const store={get:()=>marker?{value:marker}:undefined,delete(){marker=null}};
 const actions=load('app/conta/actions.ts',{'next/headers':{cookies:async()=>store},'next/navigation':{redirect},'next/cache':{revalidatePath(){}},'@/lib/supabase/server':{createClient:async()=>client},'@/lib/supabase/auth':{requireAccount:async()=>({user:confirmed,supabase:client})},'@/lib/supabase/config':{isUuid:()=>false,getSupabaseConfig:()=>({siteUrl:'https://app.example'})}});
 return {actions,calls,setFailure(value){failure=value},setMarker(value){marker=value},signedOut:()=>signedOut};
}
const form=values=>new Map(Object.entries(values));
const signup={email:'test@example.invalid',password:'fictional-password-123',password_confirmation:'fictional-password-123',full_name:'Pessoa Exemplo'};
test('signup validates all fields and matching passwords, then requests confirmation',async()=>{
 const {actions,calls}=actionFixture();
 for(const values of [{...signup,password_confirmation:'different'},{...signup,email:'invalid'},{...signup,full_name:''},{...signup,password:'short'}])assert.ok((await actions.signUpAction({},form(values))).error);
 assert.equal(calls.length,0);
 assert.ok((await actions.signUpAction({},form(signup))).message.includes('confirmação foi enviado'));
 assert.equal(calls[0][1].options.emailRedirectTo,'https://app.example/auth/callback');assert.equal(calls[0][1].options.data.full_name,'Pessoa Exemplo');
});
test('login uses Supabase and errors do not redirect into protected content',async()=>{
 const f=actionFixture();f.setFailure({status:400});assert.ok((await f.actions.signInAction({},form(signup))).error);
 f.setFailure(null);await redirects(f.actions.signInAction({},form(signup)),'/painel');assert.equal(f.calls[0][0],'login');
});
test('resend and password recovery use fixed safe destinations and generic feedback',async()=>{
 const f=actionFixture();
 assert.ok((await f.actions.resendConfirmationAction({},form({email:'invalid'}))).error);assert.equal(f.calls.length,0);
 assert.ok((await f.actions.resendConfirmationAction({},form(signup))).message);
 assert.equal(f.calls[0][1].type,'signup');assert.equal(f.calls[0][1].options.emailRedirectTo,'https://app.example/auth/callback');
 assert.ok((await f.actions.requestPasswordResetAction({},form(signup))).message);assert.equal(f.calls[1][1].options.redirectTo,'https://app.example/auth/callback?flow=recovery');
 f.setFailure({status:429});assert.match((await f.actions.resendConfirmationAction({},form(signup))).error,/Aguarde/);assert.match((await f.actions.requestPasswordResetAction({},form(signup))).error,/Aguarde/);
});
test('new password requires verified account and matching recovery marker; success clears marker and signs out',async()=>{
 const f=actionFixture();f.setMarker(null);assert.ok((await f.actions.updatePasswordAction({},form(signup))).error);
 f.setMarker('other-user');assert.ok((await f.actions.updatePasswordAction({},form(signup))).error);assert.equal(f.calls.length,0);
 f.setMarker('user-a');assert.ok((await f.actions.updatePasswordAction({},form({...signup,password_confirmation:'different'}))).error);
 f.setFailure({code:'session_expired'});assert.ok((await f.actions.updatePasswordAction({},form(signup))).error);
 f.setFailure(null);await redirects(f.actions.updatePasswordAction({},form(signup)),'/conta/entrar?status=senha-atualizada');assert.equal(f.signedOut(),true);
 assert.ok((await f.actions.updatePasswordAction({},form(signup))).error);
});
test('recovery marker is short-lived, private, bound to the verified user and never a substitute for Auth',()=>{
 const {NextResponse}=require('next/server');
 const {recoveryRedirect}=load('lib/supabase/redirect.ts',{'next/server':{NextResponse},'./config':{getSupabaseConfig:()=>({siteUrl:'https://app.example'})}});
 const response=recoveryRedirect({nextUrl:new URL('https://app.example/auth/confirm')},'user-a');
 assert.equal(response.headers.get('location'),'https://app.example/conta/nova-senha');
 const marker=response.cookies.get('orvelium-recovery');
 assert.equal(marker.value,'user-a');assert.equal(marker.httpOnly,true);assert.equal(marker.secure,true);assert.equal(marker.sameSite,'lax');assert.equal(marker.maxAge,900);
 assert.match(response.headers.get('cache-control'),/no-store/);
});
