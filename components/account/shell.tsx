import Link from 'next/link';
import { Logo } from '@/components/ui';
import { SignOutButton } from './forms';
export function AccountShell({children,signedIn=false}:{children:React.ReactNode;signedIn?:boolean}){return <div className="account-shell"><a className="skip-link" href="#account-main">Pular para o conteúdo</a><header className="account-header"><Link href="/" aria-label="Orvelium One — demonstração local"><Logo/></Link><nav aria-label="Navegação da conta"><Link href="/">Demonstração local</Link>{signedIn&&<><Link href="/conta">Minha conta</Link><Link href="/conta/empresas">Empresas</Link><SignOutButton/></>}</nav></header><main id="account-main" tabIndex={-1} className="account-main">{children}</main></div>;}
