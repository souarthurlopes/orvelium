import { AuthLinkError } from '@/components/account/auth-link-error';
import { EntryShell } from '@/components/account/entry-shell';
import { EmailRequestForm } from '@/components/account/forms';
import { supabaseConfigured } from '@/lib/supabase/config';
export const dynamic='force-dynamic';
export default async function RecoverPage({searchParams}:{searchParams:Promise<{status?:string}>}){
 const {status}=await searchParams;const enabled=supabaseConfigured();
 return <EntryShell><AuthLinkError/><h2>Recupere seu acesso.</h2><p>Informe seu e-mail para receber um link e cadastrar uma nova senha.</p>{status==='link-invalido'&&<p role="alert" className="client-error">O link de recuperação é inválido, expirou ou já foi usado. Solicite um novo link abaixo.</p>}{!enabled&&<p role="status" className="notice">A conexão de conta ainda não está disponível neste ambiente.</p>}<EmailRequestForm mode="recovery" enabled={enabled}/></EntryShell>;
}
