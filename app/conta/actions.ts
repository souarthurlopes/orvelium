'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAccount } from '@/lib/supabase/auth';
import { getSupabaseConfig, isUuid } from '@/lib/supabase/config';
import type { ActionState } from '@/lib/supabase/action-state';
import type { CompanyRole } from '@/lib/supabase/database.types';
function field(data:FormData,name:string){const value=data.get(name);return typeof value==='string'?value:'';}
function credentials(data:FormData,signup=false){
 const email=field(data,'email').trim();const password=field(data,'password');
 if(email.length>254||!/^\S+@\S+\.\S+$/.test(email)||!password||password.length>72||(signup&&(password.length<12||new TextEncoder().encode(password).length>72)))return null;
 return{email,password};
}
export async function signInAction(_state:ActionState,data:FormData):Promise<ActionState>{
 const input=credentials(data);if(!input)return{error:'Confira o e-mail e a senha informados.'};
 try{const supabase=await createClient();const {error}=await supabase.auth.signInWithPassword(input);if(error)return{error:error.status===429?'Muitas tentativas. Aguarde antes de tentar novamente.':'Não foi possível entrar. Confira os dados e a confirmação de e-mail.'};}catch{return{error:'A conexão com a área de conta está indisponível. Tente novamente mais tarde.'};}
 redirect('/conta/empresas');
}
export async function signUpAction(_state:ActionState,data:FormData):Promise<ActionState>{
 const input=credentials(data,true);const name=field(data,'full_name').trim();
 if(!input||!name||name.length>120)return{error:'Informe seu nome e um e-mail válido. A senha precisa ter de 12 a 72 caracteres e até 72 bytes.'};
 try{const config=getSupabaseConfig();if(!config)return{error:'A área de conta ainda não está disponível.'};const supabase=await createClient();const {error}=await supabase.auth.signUp({...input,options:{data:{full_name:name},emailRedirectTo:`${config.siteUrl}/auth/callback`}});if(error)return{error:error.status===429?'Muitas tentativas. Aguarde antes de tentar novamente.':'Não foi possível solicitar o cadastro. Confira os campos ou tente novamente mais tarde.'};}catch{return{error:'A conexão está indisponível. Tente novamente mais tarde.'};}
 return{message:'Se este endereço puder ser cadastrado, você receberá um e-mail de confirmação. Abra o link e depois entre com sua senha. Nenhuma empresa existente será associada automaticamente.'};
}
export async function signOutAction(_state:ActionState):Promise<ActionState>{
 try{const supabase=await createClient();const {error}=await supabase.auth.signOut({scope:'local'});if(error)return{error:'Não foi possível encerrar a sessão. Tente novamente.'};}catch{return{error:'A conexão está indisponível. Tente encerrar a sessão novamente.'};}
 redirect('/conta/entrar?status=sessao-encerrada');
}
export async function createCompanyAction(_state:ActionState,data:FormData):Promise<ActionState>{
 const {supabase}=await requireAccount();const name=field(data,'name').trim();const legal=field(data,'legal_name').trim();
 if(!name||name.length>120||legal.length>180)return{error:'Informe o nome da empresa (até 120 caracteres) e revise a razão social (até 180).'};
 let failed=false;
 try{const {error}=await supabase.rpc('create_company',{p_name:name,p_legal_name:legal||null});failed=!!error;}catch{failed=true;}
 if(failed)return{error:'Não foi possível criar a empresa. Verifique a conexão, a confirmação de e-mail e a instalação do esquema.'};
 revalidatePath('/conta','layout');redirect('/conta');
}
export async function selectCompanyAction(_state:ActionState,data:FormData):Promise<ActionState>{
 const {supabase}=await requireAccount();const id=field(data,'company_id');if(!isUuid(id))return{error:'Selecione uma empresa válida.'};
 try{const {error}=await supabase.rpc('set_active_company',{p_company_id:id});if(error)return{error:'Não foi possível selecionar a empresa. Confirme seu vínculo atual.'};}catch{return{error:'Não foi possível selecionar a empresa. Tente novamente.'};}
 revalidatePath('/conta','layout');redirect('/conta');
}
export async function membershipAction(_state:ActionState,data:FormData):Promise<ActionState>{
 const {supabase}=await requireAccount();const company=field(data,'company_id');const user=field(data,'user_id');const intent=field(data,'intent');const role=field(data,'role');
 if(!isUuid(company)||!isUuid(user)||!['add','role','remove'].includes(intent)||(intent!=='remove'&&!['admin','member','viewer'].includes(role)))return{error:'Revise a empresa, o UUID do usuário e o papel solicitado.'};
 // The RPC verifies the actor's current role in PostgreSQL on every call.
 try{const result=intent==='add'?await supabase.rpc('add_company_member',{p_company_id:company,p_user_id:user,p_role:role as CompanyRole}):intent==='role'?await supabase.rpc('set_company_member_role',{p_company_id:company,p_user_id:user,p_role:role as CompanyRole}):await supabase.rpc('remove_company_member',{p_company_id:company,p_user_id:user});if(result.error)return{error:result.error.code==='23505'?'Este usuário já está associado à empresa.':'Operação não autorizada ou vínculo inválido. Apenas o proprietário pode gerenciar outros usuários confirmados; o proprietário não pode ser removido ou promovido por este fluxo.'};}catch{return{error:'Não foi possível alterar o vínculo. Verifique a conexão.'};}
 revalidatePath('/conta','layout');return{message:'Vínculo atualizado no banco. As permissões são verificadas novamente a cada operação.'};
}
