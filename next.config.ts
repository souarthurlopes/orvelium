import type { NextConfig } from 'next';
import { getSupabaseConfig } from './lib/supabase/config';
// Fail before compilation if a privileged key was mistakenly put in a public variable.
getSupabaseConfig();
const config: NextConfig = { experimental: { cpus: 2 } };
export default config;
