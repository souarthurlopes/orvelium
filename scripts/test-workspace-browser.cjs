// Isolated visual/interaction test of the real workspace components with fake Auth/forms.
// The temporary fixture is never part of the Next app or a production auth bypass.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const ts=require('typescript');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'orvelium-workspace-test-'));
const output=process.env.WORKSPACE_TEST_OUTPUT||path.join(os.tmpdir(),'orvelium-workspace-qa');fs.mkdirSync(output,{recursive:true});
const write=(name,content)=>fs.writeFileSync(path.join(temp,name),content);
const sources={page:'app/painel/page.tsx',shell:'components/workspace/shell.tsx',modules:'components/workspace/modules.ts',ui:'components/ui.tsx'};
for(const [name,file]of Object.entries(sources))write(name+'.cjs',ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText);
write('link.cjs',`exports.__esModule=true;exports.default=({href,children,...props})=>require('react').createElement('a',{href,...props},children);`);
write('auth.cjs',`exports.requireCompany=async()=>{const companies=[{id:'company-a',name:'Empresa Alfa'},{id:'company-b',name:'Empresa Beta'}];const active=companies.find(c=>c.id===new URLSearchParams(location.search).get('empresa'))||companies[0];return{active,companies,profile:{full_name:'Pessoa Exemplo'},role:'owner'}};`);
write('forms.cjs',`const React=require('react');exports.SelectCompanyForm=({companies,active})=>React.createElement('form',{onSubmit:event=>{event.preventDefault();const url=new URL(location.href);url.searchParams.set('empresa',new FormData(event.currentTarget).get('company'));location.href=url.pathname+url.search;}},React.createElement('label',null,'Empresa ativa da conta',React.createElement('select',{name:'company',defaultValue:active},companies.map(c=>React.createElement('option',{key:c.id,value:c.id},c.name)))),React.createElement('button',{className:'button'},'Usar empresa selecionada'));exports.SignOutButton=()=>React.createElement('button',{className:'button'},'Sair da conta');`);
write('entry.cjs',`const React=require('react');const {createRoot}=require('react-dom/client');const Dashboard=require('./page.cjs').default;(async()=>{const modulo=new URLSearchParams(location.search).get('modulo');createRoot(document.getElementById('root')).render(await Dashboard({searchParams:Promise.resolve({modulo})}));})();`);
async function bundle(){const nextWebpack=require('next/dist/compiled/webpack/webpack');nextWebpack.init();await new Promise((resolve,reject)=>{const compiler=nextWebpack.webpack({mode:'development',devtool:false,entry:path.join(temp,'entry.cjs'),output:{path:temp,filename:'bundle.js'},resolve:{modules:[path.join(root,'node_modules'),'node_modules'],alias:{'next/link':path.join(temp,'link.cjs'),'@/lib/supabase/auth':path.join(temp,'auth.cjs'),'@/components/workspace/shell':path.join(temp,'shell.cjs'),'@/components/workspace/modules':path.join(temp,'modules.cjs'),'@/components/ui':path.join(temp,'ui.cjs'),'@/components/account/forms':path.join(temp,'forms.cjs'),'./modules':path.join(temp,'modules.cjs')}},optimization:{minimize:false}});compiler.run((error,stats)=>compiler.close(()=>error?reject(error):stats.hasErrors()?reject(new Error(stats.toString({all:false,errors:true}))):resolve()));});}
(async()=>{
 let server,browser;
 try{
  await bundle();
  const css=fs.readdirSync(path.join(root,'.next/static/css')).filter(name=>name.endsWith('.css')).map(name=>`<link rel="stylesheet" href="/_next/static/css/${name}">`).join('');
  server=http.createServer((request,response)=>{
   const pathname=new URL(request.url,'http://localhost').pathname;
   if(pathname==='/bundle.js'){response.setHeader('Content-Type','text/javascript');response.end(fs.readFileSync(path.join(temp,'bundle.js')));return;}
   if(pathname.startsWith('/_next/static/')){const file=path.resolve(root,'.next',pathname.slice('/_next/'.length));const base=path.resolve(root,'.next/static')+path.sep;if(file.startsWith(base)&&fs.existsSync(file)){response.setHeader('Content-Type',file.endsWith('.css')?'text/css':'font/woff2');response.end(fs.readFileSync(file));return;}response.writeHead(404).end();return;}
   response.setHeader('Content-Type','text/html; charset=utf-8');response.end(`<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1">${css}<div id="root"></div><script src="/bundle.js"></script></html>`);
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const base=`http://127.0.0.1:${server.address().port}`;
  await page.goto(base+'/painel');await page.getByRole('heading',{name:'Seu negócio em perspectiva.'}).waitFor();
  await page.evaluate(()=>localStorage.setItem('orvelium.clients.v1:Empresa%20Alfa',JSON.stringify({version:1,clients:[{name:'LOCAL DATA MUST NOT APPEAR'}]})));
  await page.reload();await page.getByRole('heading',{name:'Seu negócio em perspectiva.'}).waitFor();
  assert.equal(await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link').count(),8);
  assert.equal(await page.locator('.metrics article').count(),4);assert.deepEqual(await page.locator('.metrics article>strong').allTextContents(),['—','—','—','—']);
  for(const text of ['DADOS FICTÍCIOS','Studio Orvelium','48.250','LOCAL DATA MUST NOT APPEAR'])assert.equal(await page.getByText(text,{exact:false}).count(),0);
  await page.screenshot({path:path.join(output,'workspace-desktop.png'),fullPage:true});
  for(const name of ['Financeiro','Clientes','Estoque','Orçamentos','Serviços','Funcionários','RDO']){await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link',{name,exact:true}).click();await page.getByRole('heading',{name:name+' na sua empresa'}).waitFor();assert.equal(await page.getByText('LOCAL DATA MUST NOT APPEAR').count(),0);}
  await page.getByText('Trocar empresa',{exact:true}).click();await page.getByLabel('Empresa ativa da conta').selectOption('company-b');await page.getByRole('button',{name:'Usar empresa selecionada'}).click();await page.getByText('Este módulo ainda não está disponível para Empresa Beta.').waitFor();assert.equal(await page.locator('.workspace-company>strong').textContent(),'Empresa Beta');
  for(const width of [390,320]){
   await page.setViewportSize({width,height:844});await page.goto(base+'/painel');await page.getByRole('heading',{name:'Seu negócio em perspectiva.'}).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Overview overflow '+width);
   await page.getByRole('button',{name:'Abrir menu'}).click();await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link',{name:'Clientes',exact:true}).click();await page.getByRole('heading',{name:'Clientes na sua empresa'}).waitFor();assert.equal(await page.getByRole('button',{name:'Abrir menu'}).getAttribute('aria-expanded'),'false');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Module overflow '+width);
   await page.getByRole('button',{name:'Abrir menu'}).click();await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'Abrir menu'}).getAttribute('aria-expanded'),'false');
  }
  await page.goto(base+'/painel');await page.getByRole('heading',{name:'Seu negócio em perspectiva.'}).waitFor();await page.screenshot({path:path.join(output,'workspace-mobile.png'),fullPage:true});assert.deepEqual(errors,[]);
  console.log('PASS: real workspace components with isolated fake Auth/forms; sidebar, 8 modules, empty metrics, company rendering, no local/demo data, 320/390 px, mobile menu/Escape, no JS errors. Real authentication and company RPC remain covered separately, not by this fixture.');
 }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
