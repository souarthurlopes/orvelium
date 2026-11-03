import type { NextConfig } from 'next';
import { getSupabaseConfig } from './lib/supabase/config';
// Validate before exposing these three public values to browser bundles.
// Never spread process.env here: private environment variables must stay private.
const supabase = getSupabaseConfig();
const config: NextConfig = {
  experimental: { cpus: 2 },
  env: {
    NEXTPUBLICSUPABASEURL: supabase?.url ?? '',
    NEXTPUBLICSUPABASEPUBLISHABLEKEY: supabase?.publishableKey ?? '',
    NEXTPUBLICSITEURL: supabase?.siteUrl ?? '',
  },
};
export default config;
