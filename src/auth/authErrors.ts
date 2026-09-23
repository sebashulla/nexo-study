export function authErrorMessage(error: unknown) {
  const code = (error as { code?: string })?.code
  const message = error instanceof Error ? error.message : ''
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) return 'El correo o la contraseña no son correctos. Revisa tus datos e inténtalo de nuevo.'
  if (code === 'email_not_confirmed') return 'Confirma tu correo antes de iniciar sesión. Revisa también la carpeta de spam.'
  if (code === 'user_already_exists') return 'Ya existe una cuenta con este correo. Inicia sesión o recupera tu contraseña.'
  if (/rate.limit|too many|over_.*limit/i.test(`${code} ${message}`)) return 'Has realizado varios intentos. Espera unos minutos antes de volver a intentarlo.'
  if (code === 'same_password') return 'Elige una contraseña distinta de la anterior.'
  if (code === 'weak_password') return 'Elige una contraseña más segura, con letras, números y símbolos.'
  if (/fetch|network|timeout/i.test(message)) return 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.'
  return 'No se pudo completar la solicitud. Inténtalo de nuevo en unos momentos.'
}
