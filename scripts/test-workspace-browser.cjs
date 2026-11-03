// Isolated visual/interaction test of the real workspace components with fake Auth/forms.
// The temporary fixture is never part of the Next app or a production auth bypass.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const ts=require('typescript');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'orvelium-workspace-test-'));
const output=process.env.WORKSPACE_TEST_OUTPUT||path.join(os.tmpdir(),'orvelium-workspace-qa');fs.mkdirSync(output,{recursive:true});
const write=(name,content)=>fs.writeFileSync(path.join(temp,name),content);
const sources={page:'app/painel/page.tsx',shell:'components/workspace/shell.tsx',modules:'components/workspace/modules.ts',ui:'components/ui.tsx',remote:'components/clients/remote-clients-module.tsx','clients-module':'components/clients/clients-module.tsx','client-form':'components/clients/client-form.tsx','client-types':'lib/clients/types.ts','local-repository':'lib/clients/local-repository.ts',dialog:'components/dialog.tsx'};
for(const [name,file]of Object.entries(sources))write(name+'.cjs',ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText);
write('link.cjs',`exports.__esModule=true;exports.default=({href,children,...props})=>require('react').createElement('a',{href,...props},children);`);
write('auth.cjs',`exports.requireCompany=async()=>{const companies=[{id:'company-a',name:'Empresa Alfa'},{id:'company-b',name:'Empresa Beta'}];const active=companies.find(c=>c.id===new URLSearchParams(location.search).get('empresa'))||companies[0];return{active,companies,profile:{full_name:'Pessoa Exemplo'},role:new URLSearchParams(location.search).get('role')||'owner'}};`);
write('forms.cjs',`const React=require('react');exports.SelectCompanyForm=({companies,active})=>React.createElement('form',{onSubmit:event=>{event.preventDefault();const url=new URL(location.href);url.searchParams.set('empresa',new FormData(event.currentTarget).get('company'));location.href=url.pathname+url.search;}},React.createElement('label',null,'Empresa ativa da conta',React.createElement('select',{name:'company',defaultValue:active},companies.map(c=>React.createElement('option',{key:c.id,value:c.id},c.name)))),React.createElement('button',{className:'button'},'Usar empresa selecionada'));exports.SignOutButton=()=>React.createElement('button',{className:'button'},'Sair da conta');`);
write('count.cjs',`exports.countActiveClients=async()=>null;`);
write('client-actions.cjs',`async function call(operation,companyId,id,input){if(operation==='list'&&new URLSearchParams(location.search).has('failure'))return{error:'Conexão temporariamente indisponível.'};return (await fetch('/__fixture/clients',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,companyId,id,input,role:new URLSearchParams(location.search).get('role')||'owner'})})).json();}exports.listClientsAction=company=>call('list',company);exports.createClientAction=(company,input)=>call('create',company,null,input);exports.updateClientAction=(company,id,input)=>call('update',company,id,input);exports.removeClientAction=(company,id)=>call('remove',company,id);`);
write('entry.cjs',`const React=require('react');const {createRoot}=require('react-dom/client');const Dashboard=require('./page.cjs').default;(async()=>{const modulo=new URLSearchParams(location.search).get('modulo');createRoot(document.getElementById('root')).render(await Dashboard({searchParams:Promise.resolve({modulo})}));})();`);
async function bundle(){const nextWebpack=require('next/dist/compiled/webpack/webpack');nextWebpack.init();await new Promise((resolve,reject)=>{const compiler=nextWebpack.webpack({mode:'development',devtool:false,entry:path.join(temp,'entry.cjs'),output:{path:temp,filename:'bundle.js'},resolve:{modules:[path.join(root,'node_modules'),'node_modules'],alias:{'next/link':path.join(temp,'link.cjs'),'@/lib/supabase/auth':path.join(temp,'auth.cjs'),'@/components/workspace/shell':path.join(temp,'shell.cjs'),'@/components/workspace/modules':path.join(temp,'modules.cjs'),'@/components/ui':path.join(temp,'ui.cjs'),'@/components/account/forms':path.join(temp,'forms.cjs'),'./modules':path.join(temp,'modules.cjs'),'@/components/clients/remote-clients-module':path.join(temp,'remote.cjs'),'./clients-module':path.join(temp,'clients-module.cjs'),'./client-form':path.join(temp,'client-form.cjs'),'@/lib/clients/types':path.join(temp,'client-types.cjs'),'./types':path.join(temp,'client-types.cjs'),'@/lib/clients/local-repository':path.join(temp,'local-repository.cjs'),'@/components/dialog':path.join(temp,'dialog.cjs'),'@/lib/clients/supabase-repository':path.join(temp,'count.cjs'),'@/app/painel/client-actions':path.join(temp,'client-actions.cjs')}},optimization:{minimize:false}});compiler.run((error,stats)=>compiler.close(()=>error?reject(error):stats.hasErrors()?reject(new Error(stats.toString({all:false,errors:true}))):resolve()));});}
(async()=>{
 let server,browser;
 try{
  await bundle();
  const css=fs.readdirSync(path.join(root,'.next/static/css')).filter(name=>name.endsWith('.css')).map(name=>`<link rel="stylesheet" href="/_next/static/css/${name}">`).join('');
  const records=new Map();const {normalizeClient,validateClient}=require(path.join(temp,'client-types.cjs'));
  server=http.createServer((request,response)=>{
   const pathname=new URL(request.url,'http://localhost').pathname;
   if(pathname==='/__fixture/clients'){
    let body='';request.on('data',chunk=>body+=chunk);request.on('end',()=>{
     response.setHeader('Content-Type','application/json');
     try{
      const {operation,companyId,id,input,role}=JSON.parse(body);const rows=records.get(companyId)||[];let data=null;
      if(operation==='list')data=rows;
      else{
       if(role==='viewer'||(operation==='remove'&&role==='member'))throw new Error('Operação não permitida.');
       if(operation==='remove'){if(!rows.some(row=>row.id===id))throw new Error('Cliente não encontrado.');records.set(companyId,rows.filter(row=>row.id!==id));}
       else{
        const invalid=validateClient(input);if(invalid)throw new Error(invalid);const values=normalizeClient(input);
        if(rows.some(row=>row.id!==id&&row.document===values.document))throw new Error('Já existe um cliente com esse CPF/CNPJ nesta empresa.');
        const now=new Date().toISOString();const previous=operation==='update'?rows.find(row=>row.id===id):null;if(operation==='update'&&!previous)throw new Error('Cliente não encontrado.');
        data={...values,id:previous?.id||require('node:crypto').randomUUID(),createdAt:previous?.createdAt||now,updatedAt:now};records.set(companyId,previous?rows.map(row=>row.id===id?data:row):[...rows,data]);
       }
      }response.end(JSON.stringify({data}));
     }catch(error){response.end(JSON.stringify({error:error.message}));}
    });return;
   }
   if(pathname==='/bundle.js'){response.setHeader('Content-Type','text/javascript');response.end(fs.readFileSync(path.join(temp,'bundle.js')));return;}
   if(pathname.startsWith('/_next/static/')){const file=path.resolve(root,'.next',pathname.slice('/_next/'.length));const base=path.resolve(root,'.next/static')+path.sep;if(file.startsWith(base)&&fs.existsSync(file)){response.setHeader('Content-Type',file.endsWith('.css')?'text/css':'font/woff2');response.end(fs.readFileSync(file));return;}response.writeHead(404).end();return;}
   response.setHeader('Content-Type','text/html; charset=utf-8');response.end(`<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1">${css}<div id="root"></div><script src="/bundle.js"></script></html>`);
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const base=`http://127.0.0.1:${server.address().port}`;
  await page.addInitScript(()=>{const original=Storage.prototype.getItem;Storage.prototype.getItem=function(key){if(key.startsWith('orvelium.'))throw new Error('Remote UI must not read demonstration storage');return original.call(this,key);};});
  await page.goto(base+'/painel');await page.getByRole('heading',{name:'Seu negócio em perspectiva.'}).waitFor();
  await page.evaluate(()=>localStorage.setItem('orvelium.clients.v1:Empresa%20Alfa',JSON.stringify({version:1,clients:[{name:'LOCAL DATA MUST NOT APPEAR'}]})));
  await page.reload();await page.getByRole('heading',{name:'Seu negócio em perspectiva.'}).waitFor();
  assert.equal(await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link').count(),8);
  assert.equal(await page.locator('.metrics article').count(),4);assert.deepEqual(await page.locator('.metrics article>strong').allTextContents(),['—','—','—','—']);
  for(const text of ['DADOS FICTÍCIOS','Studio Orvelium','48.250','LOCAL DATA MUST NOT APPEAR'])assert.equal(await page.getByText(text,{exact:false}).count(),0);
  await page.screenshot({path:path.join(output,'workspace-desktop.png'),fullPage:true});
  for(const name of ['Financeiro','Estoque','Orçamentos','Serviços','Funcionários','RDO']){await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link',{name,exact:true}).click();await page.getByRole('heading',{name:name+' na sua empresa'}).waitFor();assert.equal(await page.getByText('LOCAL DATA MUST NOT APPEAR').count(),0);}
  await page.getByText('Trocar empresa',{exact:true}).click();await page.getByLabel('Empresa ativa da conta').selectOption('company-b');await page.getByRole('button',{name:'Usar empresa selecionada'}).click();await page.getByText('Este módulo ainda não está disponível para Empresa Beta.').waitFor();assert.equal(await page.locator('.workspace-company>strong').textContent(),'Empresa Beta');
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(base+'/painel?modulo=clientes');await page.getByRole('heading',{name:'Clientes.',exact:true}).waitFor();
  await page.getByRole('button',{name:'Novo cliente',exact:true}).click();let dialog=page.getByRole('dialog');
  await dialog.getByLabel('Nome completo').fill('Cliente Remoto');await dialog.getByLabel('CPF',{exact:false}).fill('12345678901');await dialog.getByRole('button',{name:'Salvar cliente'}).click();await page.getByRole('button',{name:'Ver detalhes de Cliente Remoto'}).waitFor();
  await page.getByRole('button',{name:'Novo cliente',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Nome completo').fill('Duplicado');await dialog.getByLabel('CPF',{exact:false}).fill('123.456.789-01');await dialog.getByRole('button',{name:'Salvar cliente'}).click();await dialog.getByRole('alert').filter({hasText:'Já existe'}).waitFor();await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByRole('button',{name:'Editar Cliente Remoto',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Nome completo').fill('Cliente Persistente');await dialog.getByRole('button',{name:'Salvar cliente'}).click();await page.getByRole('button',{name:'Ver detalhes de Cliente Persistente'}).waitFor();
  await page.getByRole('searchbox',{name:'Pesquisar clientes'}).fill('Inexistente');await page.getByRole('heading',{name:'Nenhum cliente encontrado'}).waitFor();await page.getByRole('button',{name:'Limpar pesquisa e filtros'}).click();
  await page.reload();await page.getByRole('button',{name:'Ver detalhes de Cliente Persistente'}).waitFor();assert.equal(await page.getByText('LOCAL DATA MUST NOT APPEAR').count(),0);
  await page.screenshot({path:path.join(output,'remote-clients-desktop.png'),fullPage:true});
  const device=await browser.newContext();const devicePage=await device.newPage();await devicePage.goto(base+'/painel?modulo=clientes');await devicePage.getByRole('button',{name:'Ver detalhes de Cliente Persistente'}).waitFor();await device.close();
  await page.goto(base+'/painel?modulo=clientes&empresa=company-b');await page.getByRole('heading',{name:'Seu primeiro relacionamento começa aqui.'}).waitFor();assert.equal(await page.getByText('Cliente Persistente').count(),0);
  await page.goto(base+'/painel?modulo=clientes&role=viewer');await page.getByRole('button',{name:'Ver detalhes de Cliente Persistente'}).waitFor();assert.equal(await page.getByRole('button',{name:'Novo cliente',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Editar Cliente Persistente',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Excluir Cliente Persistente',exact:true}).count(),0);
  await page.goto(base+'/painel?modulo=clientes&role=member');await page.getByRole('button',{name:'Editar Cliente Persistente',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Excluir Cliente Persistente',exact:true}).count(),0);
  await page.goto(base+'/painel?modulo=clientes&failure=1');await page.getByRole('alert').filter({hasText:'Conexão temporariamente indisponível.'}).waitFor();assert.equal(await page.getByText('Cliente Persistente').count(),0);assert.equal(await page.getByText('LOCAL DATA MUST NOT APPEAR').count(),0);
  for(const width of [390,320]){
   await page.setViewportSize({width,height:844});await page.goto(base+'/painel');await page.getByRole('heading',{name:'Seu negócio em perspectiva.'}).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Overview overflow '+width);
   await page.getByRole('button',{name:'Abrir menu'}).click();await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link',{name:'Clientes',exact:true}).click();await page.getByRole('heading',{name:'Clientes.',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Abrir menu'}).getAttribute('aria-expanded'),'false');
   await page.getByRole('button',{name:'Ver detalhes de Cliente Persistente'}).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Module overflow '+width);
   await page.getByRole('button',{name:'Editar Cliente Persistente',exact:true}).click();await page.getByRole('dialog').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Client form overflow '+width);await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
   if(width===320)await page.screenshot({path:path.join(output,'remote-clients-mobile.png'),fullPage:true});
   await page.getByRole('button',{name:'Abrir menu'}).click();await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'Abrir menu'}).getAttribute('aria-expanded'),'false');
  }
  await page.goto(base+'/painel?modulo=clientes');await page.getByRole('button',{name:'Excluir Cliente Persistente',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Cancelar',exact:true}).click();await page.getByRole('button',{name:'Ver detalhes de Cliente Persistente'}).waitFor();await page.getByRole('button',{name:'Excluir Cliente Persistente',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Confirmar exclusão'}).click();await page.getByRole('heading',{name:'Seu primeiro relacionamento começa aqui.'}).waitFor();
  await page.goto(base+'/painel');await page.getByRole('heading',{name:'Seu negócio em perspectiva.'}).waitFor();await page.screenshot({path:path.join(output,'workspace-mobile.png'),fullPage:true});assert.deepEqual(errors,[]);
  console.log('PASS: real workspace components with isolated fake Auth/forms; sidebar, 8 modules, empty metrics, company rendering, no local/demo data, 320/390 px, mobile menu/Escape, no JS errors. Remote client UI CRUD, duplicate handling, filters, reload/new browser context, viewer/member controls and failure-without-local-fallback also passed. All transport/Auth are local doubles; SQL/RLS and server actions are tested separately.');
 }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
