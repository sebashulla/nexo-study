function config() {
  return {
    url: process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || '',
    anonKey: process.env.SUPABASE_ANON_KEY?.trim() || process.env.VITE_SUPABASE_ANON_KEY?.trim() || '',
  }
}

export async function verifySupabaseUser(req) {
  const { url, anonKey } = config()
  if (!url || !anonKey) {
    const error = new Error('Supabase server config missing')
    error.status = 503
    error.publicMessage = 'La autenticación todavía no está configurada en este servidor.'
    throw error
  }

  const authorization = req.headers.authorization || req.headers.Authorization || ''
  if (!String(authorization).startsWith('Bearer ')) {
    const error = new Error('Missing bearer token')
    error.status = 401
    error.publicMessage = 'Tu sesión expiró. Inicia sesión nuevamente.'
    throw error
  }

  const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: String(authorization),
    },
  })

  const user = await response.json().catch(() => null)
  if (!response.ok || !user?.id) {
    const error = new Error(`Supabase auth status ${response.status}`)
    error.status = 401
    error.publicMessage = 'Tu sesión expiró. Inicia sesión nuevamente.'
    throw error
  }
  return user
}
