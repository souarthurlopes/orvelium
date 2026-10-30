// Optional integration against a dedicated REAL Supabase test project.
// No service role is accepted. Test users must already have confirmed e-mail.
const {createClient}=require('@supabase/supabase-js');const assert=require('node:assert/strict');
const required=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_TEST_OWNER_EMAIL','SUPABASE_TEST_OWNER_PASSWORD','SUPABASE_TEST_MEMBER_EMAIL','SUPABASE_TEST_MEMBER_PASSWORD','SUPABASE_TEST_OUTSIDER_EMAIL','SUPABASE_TEST_OUTSIDER_PASSWORD'];
const missing=required.filter(name=>!process.env[name]);
if(missing.length){console.error('NÃO EXECUTADO: configure as variáveis do projeto e três contas confirmadas de teste: '+missing.join(', '));process.exit(2);}
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
let allowed=key.startsWith('sb_publishable_');if(!allowed){try{allowed=JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role==='anon';}catch{}}
if(!allowed){console.error('NÃO EXECUTADO: somente chave pública publishable/anon é permitida.');process.exit(2);}
const client=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
(async()=>{const owner=client(),member=client(),outsider=client();const clients=[owner,member,outsider];const names=['OWNER','MEMBER','OUTSIDER'];let company,other;
try{
 for(let index=0;index<clients.length;index++){const prefix='SUPABASE_TEST_'+names[index];const result=await clients[index].auth.signInWithPassword({email:process.env[prefix+'_EMAIL'],password:process.env[prefix+'_PASSWORD']});assert.ok(!result.error&&result.data.user?.email_confirmed_at,'Login verificado de conta de teste falhou. Não imprima credenciais.');}
 const ownerId=(await owner.auth.getUser()).data.user.id,memberId=(await member.auth.getUser()).data.user.id,otherId=(await outsider.auth.getUser()).data.user.id;assert.equal(new Set([ownerId,memberId,otherId]).size,3,'Use três usuários distintos.');
 const suffix=crypto.randomUUID().slice(0,8);let result=await owner.rpc('create_company',{p_name:'QA Orvelium A '+suffix});assert.ok(!result.error,'Aplique as migrations antes do teste.');company=result.data;result=await outsider.rpc('create_company',{p_name:'QA Orvelium B '+suffix});assert.ok(!result.error);other=result.data;
 assert.equal((await member.from('companies').select('id').eq('id',company)).data?.length,0);
 assert.ok((await member.rpc('add_company_member',{p_company_id:company,p_user_id:memberId,p_role:'admin'})).error);
 assert.ok(!(await owner.rpc('add_company_member',{p_company_id:company,p_user_id:memberId,p_role:'member'})).error);
 assert.ok(!(await outsider.rpc('add_company_member',{p_company_id:other,p_user_id:memberId,p_role:'member'})).error);
 assert.equal((await member.from('companies').select('id').in('id',[company,other])).data?.length,2);
 assert.ok((await member.rpc('set_company_member_role',{p_company_id:company,p_user_id:memberId,p_role:'admin'})).error);
 assert.ok(!(await owner.rpc('set_company_member_role',{p_company_id:company,p_user_id:memberId,p_role:'admin'})).error);
 assert.ok((await member.rpc('add_company_member',{p_company_id:company,p_user_id:otherId,p_role:'admin'})).error);
 assert.equal((await member.from('companies').update({name:'QA NÃO PERMITIDO'}).eq('id',other).select('id')).data?.length,0);
 assert.ok(!(await member.rpc('set_active_company',{p_company_id:company})).error);
 assert.ok(!(await owner.rpc('remove_company_member',{p_company_id:company,p_user_id:memberId})).error);
 assert.equal((await member.from('companies').select('id').eq('id',company)).data?.length,0);
 assert.ok((await member.rpc('set_active_company',{p_company_id:company})).error);
 console.log('PASS: login por senha verificado no projeto real, RPCs, RLS, multiempresa, papéis, impedimento de autopromoção e revogação de acesso.');
 console.log('Empresas fictícias criadas para inspeção e limpeza administrativa posterior: '+[company,other].filter(Boolean).join(', '));
 console.log('Este teste NÃO valida cadastro por e-mail, entrega/confirmação de e-mail, cookies SSR ou deploy Vercel. Execute o roteiro completo documentado antes de produção.');
}finally{await Promise.allSettled(clients.map(c=>c.auth.signOut({scope:'local'})));}
})().catch(()=>{console.error('FALHA na integração remota. Revise o projeto, migrations e contas de teste em ambiente seguro. Credenciais/tokens não são registrados.');process.exit(1);});
