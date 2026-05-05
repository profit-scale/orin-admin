import { createClient } from '@supabase/supabase-js'

// Hard-coded fallbacks. The anon key is PUBLIC by design (it's a JWT meant
// for browser-side use, gated by RLS at the DB layer) — there is nothing
// secret about it. Same project as the main Orin app.
//
// Why hard-coded: the orin-admin Netlify deploy kept booting with missing
// env vars, leaving super-admins staring at a "Setup required" screen they
// couldn't dismiss. Env vars still take precedence when present (so a future
// per-environment override is one Netlify setting away), but the app no
// longer depends on them at all to boot.
const FALLBACK_SUPABASE_URL = 'https://zvopcktyvffcyvbjrisj.supabase.co'
const FALLBACK_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2b3Bja3R5dmZmY3l2YmpyaXNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NjI5OTgsImV4cCI6MjA5MTIzODk5OH0.W2NOcL8IR3YGqLybBkw17kHJ0i5gb_f90XMk9xVcXyY'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY

// Kept exported so existing call sites that branch on it still compile.
// Effectively always true now thanks to the fallback constants above.
export const isConfigured = true

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: 'orin-admin-auth',
    flowType: 'pkce',
  },
  global: {
    headers: { 'x-client-info': 'orin-admin/1.0.0' },
  },
})
