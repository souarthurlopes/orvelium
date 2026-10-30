export interface SupabaseConfig { url:string; publishableKey:string; siteUrl:string }
interface Environment { url?:string; key?:string; siteUrl?:string }
/** Validate configuration without ever exposing a key in errors/logs. */
export function parseSupabaseConfig(env:Environment):SupabaseConfig|null {
  if(!env.url&&!env.key)return null;
  if(!env.url||!env.key)throw new Error('Configuração pública do Supabase incompleta.');
  let url:URL;
  try{url=new URL(env.url);}catch{throw new Error('URL pública do Supabase inválida.');}
  const local=['localhost','127.0.0.1'].includes(url.hostname);
  if((url.protocol!=='https:'&&!(local&&url.protocol==='http:'))||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Use a origem HTTPS do projeto Supabase.');
  const key=env.key.trim();
  let publicKey=/^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  if(!publicKey&&key.split('.').length===3){try{const payload=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));publicKey=payload.role==='anon';}catch{/* Invalid public key. */}}
  if(!publicKey||key.startsWith('sb_secret_'))throw new Error('Somente uma chave pública publishable ou anon é permitida. Nunca use service_role.');
  let site:URL;
  try{site=new URL(env.siteUrl||'http://localhost:3000');}catch{throw new Error('Origem da aplicação inválida.');}
  if((site.protocol!=='https:'&&!(['localhost','127.0.0.1'].includes(site.hostname)&&site.protocol==='http:'))||site.username||site.password||site.search||site.hash||site.pathname!=='/')throw new Error('Use somente a origem HTTPS da aplicação, sem caminho.');
  return{url:url.origin,publishableKey:key,siteUrl:site.origin};
}
export function getSupabaseConfig(){if(process.env.NODE_ENV==='production'&&(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)&&!process.env.NEXT_PUBLIC_SITE_URL)throw new Error('Configure a origem pública da aplicação antes de ativar a conta.');return parseSupabaseConfig({url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,siteUrl:process.env.NEXT_PUBLIC_SITE_URL});}
export function supabaseConfigured(){try{return !!getSupabaseConfig();}catch{return false;}}
export function isUuid(value:unknown):value is string{return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);}

export function supabaseCookieOptions(config:SupabaseConfig){return{path:'/',sameSite:'lax' as const,secure:config.siteUrl.startsWith('https://')};}
