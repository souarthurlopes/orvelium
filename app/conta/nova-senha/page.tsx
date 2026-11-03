import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { EntryShell } from '@/components/account/entry-shell';
import { NewPasswordForm } from '@/components/account/forms';
import { requireAccount } from '@/lib/supabase/auth';
export const dynamic='force-dynamic';
export default async function NewPasswordPage(){
 const {user}=await requireAccount();
 if((await cookies()).get('orvelium-recovery')?.value!==user.id)redirect('/conta/recuperar?status=link-invalido');
 return <EntryShell><h2>Cadastre sua nova senha.</h2><p>Escolha uma senha exclusiva para sua conta.</p><NewPasswordForm/></EntryShell>;
}
