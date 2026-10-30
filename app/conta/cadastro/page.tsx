import Link from 'next/link';
import { AccountShell } from '@/components/account/shell';
import { AuthForm } from '@/components/account/forms';
import { supabaseConfigured } from '@/lib/supabase/config';
export const dynamic='force-dynamic';
export default function SignUpPage(){const enabled=supabaseConfigured();return <AccountShell><section className="panel account-auth"><span className="eyebrow">COMECE PELA SUA CONTA</span><h1>Seu acesso, em um só lugar.</h1><p>Cadastre-se com e-mail e senha. Após a confirmação, crie uma empresa ou receba um vínculo do proprietário.</p>{!enabled&&<p className="notice" role="status">A conexão de conta ainda não está disponível neste ambiente.</p>}<AuthForm signup enabled={enabled}/><p className="account-auth-footer">Já tem uma conta? <Link href="/conta/entrar">Entrar</Link></p><p className="service-hint">O cadastro não associa você a empresas existentes por nome ou domínio de e-mail.</p></section></AccountShell>;}
