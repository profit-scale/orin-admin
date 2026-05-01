import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// True if both env vars are configured. The app reads this at boot to decide
// whether to render a setup-required screen instead of a blank page.
// (createClient(undefined, undefined) throws synchronously, which used to
// prevent React from mounting at all and produced the dreaded "blue screen
// of nothing" on a fresh Netlify deploy with missing env vars.)
export const isConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isConfigured) {
  console.warn(
    '[orin-admin] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Set them in Netlify → Site settings → Environment variables, then redeploy.'
  )
}

// Construct a stub when env vars are missing so any accidental imports of
// `supabase` from this module don't blow up during render. The setup screen
// at the top of <App /> blocks the rest of the app from running anyway.
export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
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
  : (() => {
      const err = () => Promise.reject(new Error('Supabase not configured'))
      return {
        auth: {
          getSession: err,
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
          signInWithPassword: err,
          signInWithOAuth: err,
          signOut: err,
        },
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: err, single: err }) }),
        }),
        rpc: err,
        channel: () => ({ on: () => ({ subscribe: () => ({}) }), unsubscribe: () => {} }),
        functions: { invoke: err },
      }
    })()
