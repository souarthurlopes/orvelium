const {test,after}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const ts=require('typescript');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orvelium-auth-config-'));const file=path.join(dir,'config.cjs');fs.writeFileSync(file,ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/supabase/config.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText);const {parseSupabaseConfig,isUuid,getSupabaseConfig,supabaseCookieOptions}=require(file);after(()=>fs.rmSync(dir,{recursive:true,force:true}));
const base={url:'https://project-example.supabase.co',key:'sb_publishable_example',siteUrl:'https://orvelium.example'};
const jwt=role=>Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.signature';
test('unconfigured demo works; public publishable and legacy anon keys are accepted',()=>{assert.equal(parseSupabaseConfig({}),null);assert.equal(parseSupabaseConfig(base).url,base.url);assert.equal(supabaseCookieOptions(parseSupabaseConfig(base)).secure,true);assert.equal(supabaseCookieOptions(parseSupabaseConfig({...base,siteUrl:'http://localhost:3000'})).secure,false);assert.equal(supabaseCookieOptions(parseSupabaseConfig(base)).sameSite,'lax');assert.equal(parseSupabaseConfig({...base,key:jwt('anon')}).publishableKey,jwt('anon'));assert.ok(parseSupabaseConfig({...base,url:'http://127.0.0.1:54321',siteUrl:'http://localhost:3000'}));});
test('privileged keys and credentials in URLs are rejected without echoing values',()=>{for(const key of ['sb_secret_test_private_marker',jwt('service_role'),jwt('authenticated'),'not-a-key']){assert.throws(()=>parseSupabaseConfig({...base,key}),error=>!error.message.includes(key));}for(const url of ['http://project.supabase.co','https://user:password@project.supabase.co','https://project.supabase.co/path','https://project.supabase.co/?token=private'])assert.throws(()=>parseSupabaseConfig({...base,url}));});
test('redirect origin must be a clean HTTPS application origin or local development origin',()=>{for(const siteUrl of ['javascript:alert(1)','https://attacker.example/path','https://app.example?next=https://attacker.example','http://production.example'])assert.throws(()=>parseSupabaseConfig({...base,siteUrl}));assert.throws(()=>parseSupabaseConfig({url:base.url}));});
test('production requires an explicit application origin before public config is used',()=>{const before={NODE_ENV:process.env.NODE_ENV,NEXTPUBLICSUPABASEURL:process.env.NEXTPUBLICSUPABASEURL,NEXTPUBLICSUPABASEPUBLISHABLEKEY:process.env.NEXTPUBLICSUPABASEPUBLISHABLEKEY,NEXTPUBLICSITEURL:process.env.NEXTPUBLICSITEURL};try{process.env.NODE_ENV='production';process.env.NEXTPUBLICSUPABASEURL=base.url;process.env.NEXTPUBLICSUPABASEPUBLISHABLEKEY=base.key;delete process.env.NEXTPUBLICSITEURL;assert.throws(()=>getSupabaseConfig(),/origem pública/);}finally{for(const [key,value]of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}});
test('UUID validation does not accept names, paths, nulls or injected SQL',()=>{assert.equal(isUuid('10000000-0000-4000-8000-000000000001'),true);for(const value of ['Empresa Exemplo',null,'../other',"' or 1=1 --",''])assert.equal(isUuid(value),false);});
function withPublicEnvironment(values, run) {
  const names = ['NODE_ENV','NEXTPUBLICSUPABASEURL','NEXTPUBLICSUPABASEPUBLISHABLEKEY','NEXTPUBLICSITEURL'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    for (const name of names) {
      if (values[name] === undefined) delete process.env[name];
      else process.env[name] = values[name];
    }
    return run();
  } finally {
    for (const [name,value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}
const configured = {NODE_ENV:'production',NEXTPUBLICSUPABASEURL:base.url,NEXTPUBLICSUPABASEPUBLISHABLEKEY:base.key,NEXTPUBLICSITEURL:base.siteUrl};
function nextConfig() {
  const source = fs.readFileSync(path.join(__dirname,'../next.config.ts'),'utf8');
  const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const result = {exports:{}};
  require('node:vm').runInNewContext(compiled,{exports:result.exports,module:result,require(name){assert.equal(name,'./lib/supabase/config');return {getSupabaseConfig};}});
  return result.exports.default;
}
test('Vercel variable names provide the complete configuration and public browser mapping',()=>{
  withPublicEnvironment(configured,()=>{
    assert.deepEqual(getSupabaseConfig(),{url:base.url,publishableKey:base.key,siteUrl:base.siteUrl});
    assert.deepEqual(JSON.parse(JSON.stringify(nextConfig().env)),{
      NEXTPUBLICSUPABASEURL:base.url,
      NEXTPUBLICSUPABASEPUBLISHABLEKEY:base.key,
      NEXTPUBLICSITEURL:base.siteUrl,
    });
  });
  withPublicEnvironment({NODE_ENV:'production'},()=>{
    assert.equal(getSupabaseConfig(),null);
    assert.ok(Object.values(nextConfig().env).every(value=>value===''));
  });
});
test('Next preflight rejects privileged Vercel keys and invalid origins before browser exposure',()=>{
  for(const key of ['sb_secret_private_test_marker',jwt('service_role')]) {
    withPublicEnvironment({...configured,NEXTPUBLICSUPABASEPUBLISHABLEKEY:key},()=>{
      assert.throws(()=>nextConfig(),error=>!error.message.includes(key));
    });
  }
  withPublicEnvironment({...configured,NEXTPUBLICSITEURL:'https://app.example/path'},()=>assert.throws(()=>nextConfig()));
  withPublicEnvironment({...configured,NEXTPUBLICSITEURL:undefined},()=>assert.throws(()=>nextConfig(),/origem pública/));
});
