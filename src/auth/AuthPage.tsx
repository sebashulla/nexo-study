import { useMemo, useState } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { BrandLogo } from '../BrandLogo'

type Mode = 'login' | 'signup'
type PersonType = 'universidad' | 'instituto' | 'preuniversitario' | 'colegio' | 'profesional' | 'otro'

type SignupData = {
  fullName: string
  username: string
  personType: PersonType | ''
  studyArea: string
  goal: string
  email: string
  password: string
}

const personOptions: { value: PersonType; icon: string; title: string; subtitle: string }[] = [
  { value: 'universidad', icon: '🎓', title: 'Universidad', subtitle: 'Cursos, parciales y trabajos' },
  { value: 'instituto', icon: '🧩', title: 'Instituto', subtitle: 'Formación técnica o especializada' },
  { value: 'preuniversitario', icon: '🎯', title: 'Preuniversitario', subtitle: 'Preparación para ingreso' },
  { value: 'colegio', icon: '📚', title: 'Colegio', subtitle: 'Secundaria y preparación escolar' },
  { value: 'profesional', icon: '💼', title: 'Profesional', subtitle: 'Actualización y aprendizaje continuo' },
  { value: 'otro', icon: '✨', title: 'Otro', subtitle: 'Quiero aprender a mi manera' },
]

const areaOptions = [
  ['🩺', 'Salud y ciencias biomédicas'],
  ['⚙️', 'Ingeniería y tecnología'],
  ['🧪', 'Ciencias naturales'],
  ['📐', 'Matemáticas y física'],
  ['📖', 'Humanidades y letras'],
  ['💹', 'Negocios y economía'],
  ['⚖️', 'Derecho y ciencias sociales'],
  ['🌱', 'Aún estoy explorando'],
]

const goalOptions = [
  ['🧠', 'Entender mejor mis clases'],
  ['🏆', 'Prepararme para exámenes'],
  ['🗂️', 'Organizar todo mi material'],
  ['✍️', 'Mejorar trabajos y tareas'],
  ['⚡', 'Estudiar más rápido'],
  ['🌟', 'Todo lo anterior'],
]

const blankSignup: SignupData = {
  fullName: '', username: '', personType: '', studyArea: '', goal: '', email: '', password: '',
}

function normalizeUsername(value: string) {
  return value.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9_]/g, '').slice(0, 20)
}

function suggestedUsername(fullName: string) {
  return normalizeUsername(fullName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).join('.').replace('.', '_'))
}

export function AuthPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [signup, setSignup] = useState<SignupData>(blankSignup)
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState<'next' | 'back'>('next')
  const [busy, setBusy] = useState(false)
  const [checkingUsername, setCheckingUsername] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const totalSteps = 6
  const progress = useMemo(() => ((step + 1) / totalSteps) * 100, [step])

  const switchMode = (next: Mode) => {
    setMode(next); setError(''); setMessage(''); setStep(0); setLaunching(false)
  }

  const validateStep = async () => {
    setError('')
    if (step === 0) {
      const pieces = signup.fullName.trim().split(/\s+/).filter(Boolean)
      if (pieces.length < 2) throw new Error('Escribe tus nombres completos para personalizar tu cuenta.')
      if (!signup.username) setSignup(current => ({ ...current, username: suggestedUsername(current.fullName) }))
    }
    if (step === 1) {
      if (!/^[a-z0-9_]{3,20}$/.test(signup.username)) throw new Error('Tu usuario debe tener entre 3 y 20 caracteres: letras minúsculas, números o _.')
      if (!supabase) throw new Error('Supabase no está configurado.')
      setCheckingUsername(true)
      const { data, error: rpcError } = await supabase.rpc('is_username_available', { candidate: signup.username })
      setCheckingUsername(false)
      if (rpcError) throw new Error('No se pudo validar el usuario. Ejecuta la migración SQL 003 y vuelve a intentarlo.')
      if (!data) throw new Error('Ese nombre de usuario ya está ocupado. Prueba con otro.')
    }
    if (step === 2 && !signup.personType) throw new Error('Selecciona la opción que mejor describe tu etapa actual.')
    if (step === 3 && !signup.studyArea) throw new Error('Elige el área que más se acerca a lo que estudias.')
    if (step === 4 && !signup.goal) throw new Error('Cuéntanos qué quieres conseguir con Nexo.')
    if (step === 5) {
      if (!/^\S+@\S+\.\S+$/.test(signup.email.trim())) throw new Error('Escribe un correo válido.')
      if (signup.password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.')
    }
  }

  const nextStep = async () => {
    try {
      await validateStep()
      if (step < totalSteps - 1) {
        setDirection('next')
        setStep(value => value + 1)
      }
    } catch (err) {
      setCheckingUsername(false)
      setError(err instanceof Error ? err.message : 'Revisa la información antes de continuar.')
    }
  }

  const previousStep = () => {
    if (step === 0) return switchMode('login')
    setError(''); setDirection('back'); setStep(value => value - 1)
  }

  const login = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    setBusy(true); setError(''); setMessage('')
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: loginEmail.trim(), password: loginPassword })
      if (authError) throw authError
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.')
    } finally { setBusy(false) }
  }

  const createAccount = async () => {
    if (!supabase) return
    setBusy(true); setError(''); setMessage('')
    try {
      await validateStep()
      sessionStorage.setItem('nexo-onboarding-launch', '1')
      const { data, error: authError } = await supabase.auth.signUp({
        email: signup.email.trim(),
        password: signup.password,
        options: {
          data: {
            full_name: signup.fullName.trim(),
            username: signup.username,
            person_type: signup.personType,
            study_area: signup.studyArea,
            study_goal: signup.goal,
            onboarding_completed: true,
          },
          emailRedirectTo: window.location.origin,
        },
      })
      if (authError) throw authError
      setLaunching(true)
      window.setTimeout(() => {
        if (!data.session) {
          sessionStorage.removeItem('nexo-onboarding-launch')
          setLaunching(false)
          setMessage('Tu espacio está listo. Revisa tu correo para confirmar la cuenta y luego inicia sesión.')
          setMode('login')
        }
      }, 2300)
    } catch (err) {
      sessionStorage.removeItem('nexo-onboarding-launch')
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta.')
    } finally { setBusy(false) }
  }

  if (!supabaseConfigured) {
    return <main className="auth-shell"><section className="auth-card setup-card"><BrandLogo className="auth-brand-image"/><p className="auth-kicker">CONFIGURACIÓN PENDIENTE</p><h1>Conecta Supabase para activar la beta</h1><p>Agrega <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en tu archivo <code>.env.local</code> o en Vercel.</p><div className="auth-info">Después ejecuta las migraciones de la carpeta <strong>sql/</strong> en orden.</div></section></main>
  }

  if (launching) return <main className="auth-shell launch-shell"><section className="launch-card"><BrandLogo className="launch-brand"/><div className="rocket-stage"><span className="rocket">🚀</span><i className="rocket-trail"/><i className="star s1">✦</i><i className="star s2">✧</i><i className="star s3">✦</i></div><p className="auth-kicker">NEXO ESTÁ PREPARANDO TU ESPACIO</p><h1>Configurando lo que necesitas</h1><p>Organizando tu experiencia para que estudiar se sienta más tuyo.</p><div className="launch-loader"><span/></div></section></main>

  if (mode === 'login') return <main className="auth-shell">
    <section className="auth-card">
      <BrandLogo className="auth-brand-image"/>
      <p className="auth-kicker">NEXO STUDY · BETA</p>
      <h1>Bienvenido de vuelta</h1>
      <p className="auth-subtitle">Continúa donde dejaste tu estudio.</p>
      <form onSubmit={login} className="auth-form">
        <label>Correo<input required type="email" autoComplete="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="tu@correo.com" /></label>
        <label>Contraseña<input required type="password" autoComplete="current-password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} placeholder="Tu contraseña" /></label>
        {error && <div className="auth-alert error">{error}</div>}
        {message && <div className="auth-alert success">{message}</div>}
        <button className="primary auth-submit" disabled={busy}>{busy ? 'Entrando…' : 'Iniciar sesión'}</button>
      </form>
      <div className="auth-links"><button onClick={() => switchMode('signup')}>Crear una cuenta</button></div>
    </section>
  </main>

  return <main className="auth-shell onboarding-shell">
    <section className="onboarding-card">
      <div className="onboarding-top">
        <BrandLogo className="auth-brand-image"/>
        <span className="step-count">{step + 1} / {totalSteps}</span>
      </div>
      <div className="onboarding-progress"><span style={{ width: `${progress}%` }}/></div>

      <div key={step} className={`onboarding-stage ${direction === 'back' ? 'from-left' : 'from-right'}`}>
        {step === 0 && <><p className="auth-kicker">EMPECEMOS POR TI</p><h1>¿Cómo te llamas?</h1><p className="auth-subtitle">Así podremos hacer que Nexo se sienta realmente como tu espacio.</p><label className="big-field">Nombres completos<input autoFocus autoComplete="name" value={signup.fullName} onChange={e => setSignup(current => ({ ...current, fullName: e.target.value }))} placeholder="Ej. Aliss Fernández Ramos" onKeyDown={e => e.key === 'Enter' && nextStep()} /></label></>}

        {step === 1 && <><p className="auth-kicker">TU IDENTIDAD EN NEXO</p><h1>Elige tu nombre de usuario</h1><p className="auth-subtitle">Será único y podrás usarlo más adelante para compartir material y encontrar compañeros.</p><label className="big-field username-field">Usuario<div><span>@</span><input autoFocus value={signup.username} onChange={e => setSignup(current => ({ ...current, username: normalizeUsername(e.target.value) }))} placeholder="aliss_fernandez" onKeyDown={e => e.key === 'Enter' && nextStep()} /></div><small>3–20 caracteres · letras minúsculas, números y _</small></label></>}

        {step === 2 && <><p className="auth-kicker">CUÉNTANOS EN QUÉ ETAPA ESTÁS</p><h1>¿Qué te describe mejor?</h1><p className="auth-subtitle">Esto nos ayuda a ajustar el tipo de herramientas y explicaciones que priorizamos.</p><div className="choice-grid person-grid">{personOptions.map(option => <button key={option.value} className={`choice-card ${signup.personType === option.value ? 'selected' : ''}`} onClick={() => setSignup(current => ({ ...current, personType: option.value }))}><span>{option.icon}</span><div><strong>{option.title}</strong><small>{option.subtitle}</small></div><b>✓</b></button>)}</div></>}

        {step === 3 && <><p className="auth-kicker">TU MUNDO ACADÉMICO</p><h1>¿Qué área estudias?</h1><p className="auth-subtitle">No tiene que ser perfecto; luego podrás cambiarlo.</p><div className="choice-grid area-grid">{areaOptions.map(([icon, label]) => <button key={label} className={`choice-card ${signup.studyArea === label ? 'selected' : ''}`} onClick={() => setSignup(current => ({ ...current, studyArea: label }))}><span>{icon}</span><strong>{label}</strong><b>✓</b></button>)}</div></>}

        {step === 4 && <><p className="auth-kicker">UNA ÚLTIMA PARA PERSONALIZAR</p><h1>¿Qué quieres lograr con Nexo?</h1><p className="auth-subtitle">Usaremos esto para priorizar tu experiencia inicial.</p><div className="choice-grid goal-grid">{goalOptions.map(([icon, label]) => <button key={label} className={`choice-card ${signup.goal === label ? 'selected' : ''}`} onClick={() => setSignup(current => ({ ...current, goal: label }))}><span>{icon}</span><strong>{label}</strong><b>✓</b></button>)}</div></>}

        {step === 5 && <><p className="auth-kicker">LISTO, AHORA GUARDAMOS TU ESPACIO</p><h1>Crea tus datos de acceso</h1><p className="auth-subtitle">Tu progreso quedará vinculado a esta cuenta.</p><div className="credential-grid"><label>Correo<input autoFocus type="email" autoComplete="email" value={signup.email} onChange={e => setSignup(current => ({ ...current, email: e.target.value }))} placeholder="tu@correo.com" /></label><label>Contraseña<input type="password" autoComplete="new-password" value={signup.password} onChange={e => setSignup(current => ({ ...current, password: e.target.value }))} placeholder="Mínimo 6 caracteres" onKeyDown={e => e.key === 'Enter' && createAccount()} /></label></div><div className="signup-summary"><span>🎓</span><div><strong>@{signup.username}</strong><small>{signup.studyArea} · {signup.goal}</small></div></div></>}
      </div>

      {error && <div className="auth-alert error onboarding-error">{error}</div>}
      <div className="onboarding-actions"><button className="secondary" onClick={previousStep}>← Atrás</button>{step < totalSteps - 1 ? <button className="primary" onClick={nextStep} disabled={checkingUsername}>{checkingUsername ? 'Comprobando…' : 'Continuar →'}</button> : <button className="primary" onClick={createAccount} disabled={busy}>{busy ? 'Creando tu espacio…' : 'Crear mi espacio →'}</button>}</div>
      <button className="onboarding-login-link" onClick={() => switchMode('login')}>Ya tengo una cuenta</button>
    </section>
  </main>
}
