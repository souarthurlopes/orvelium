import 'server-only';
import { redirect } from 'next/navigation';
import { supabaseConfigured } from './config';
import { createClient } from './server';
export async function requireAccount(){
  if(!supabaseConfigured())redirect('/conta/entrar');
  const supabase=await createClient();
  const verified=await supabase.auth.getUser().catch(()=>null);
  if(!verified)redirect('/conta/entrar');
  const {data:{user},error}=verified;
  if(error||!user)redirect('/conta/entrar');
  if(!user.email_confirmed_at)redirect('/conta/entrar?status=confirme-email');
  return{user,supabase};
}
export async function accountContext(){
  const {user,supabase}=await requireAccount();
  const [profile,companies,memberships,preference]=await Promise.all([
    supabase.from('profiles').select('id,full_name').eq('id',user.id).single(),
    supabase.from('companies').select('id,name,legal_name,created_at').order('created_at'),
    supabase.from('company_memberships').select('company_id,role').eq('user_id',user.id),
    supabase.from('user_preferences').select('active_company_id').eq('user_id',user.id).maybeSingle(),
  ]);
  const failed=!!(profile.error||companies.error||memberships.error||preference.error);
  const ownMemberships=memberships.data??[];
  const available=(companies.data??[]).filter(company=>ownMemberships.some(m=>m.company_id===company.id));
  const active=available.find(c=>c.id===preference.data?.active_company_id)??null;
  const role=ownMemberships.find(m=>m.company_id===active?.id)?.role??null;
  return{user,supabase,profile:profile.data,companies:available,memberships:ownMemberships,active,role,failed};
}
