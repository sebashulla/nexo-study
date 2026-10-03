import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { Dialog } from './Dialog'
import type { AccountAction, AccountIdentity } from './AccountMenu'

export function useAccountIdentity(user: User) {
  const [profile, setProfile] = useState<{ full_name?: string; username?: string; is_admin?: boolean } | null>(null)
  useEffect(() => {
    let live = true
    void supabase?.from('profiles').select('full_name,username,is_admin').eq('id', user.id).maybeSingle().then(({ data, error }) => {
      if (live && !error) setProfile(data)
    })
    return () => { live = false }
  }, [user.id])
  const identity: AccountIdentity = {
    fullName: profile?.full_name || user.user_metadata?.full_name || 'Estudiante Nexo',
    username: profile?.username || user.user_metadata?.username || '', email: user.email || '',
    isAdmin: profile?.is_admin === true,
  }
  return { identity, onName: (name: string) => setProfile(current => ({ ...current, full_name: name })) }
}

export function AccountUtilities({ mode, identity, userId, onClose, onName, collapsed, onCollapsed, reducedMotion, onReducedMotion, remoteEnabled, onRetry, onMemory }: {
  mode: AccountAction; identity: AccountIdentity; userId: string; onClose: () => void; onName: (name: string) => void
  collapsed: boolean; onCollapsed: (value: boolean) => void; reducedMotion: boolean; onReducedMotion: (value: boolean) => void
  remoteEnabled: boolean; onRetry: () => void; onMemory: () => void
}) {
  const [name, setName] = useState(identity.fullName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const title = { profile: 'Mi perfil', settings: 'Configuración', appearance: 'Apariencia', help: 'Ayuda / Guía rápida', feedback: '', admin: '', logout: '' }[mode]
  const save = async () => {
    if (!supabase || busy || !name.trim()) return
    setBusy(true); setError('')
    try {
      const { data, error: failure } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', userId).select('full_name').single()
      if (failure || !data?.full_name) throw new Error('No pudimos guardar el perfil. Inténtalo de nuevo.')
      onName(data.full_name); onClose()
    } catch { setError('No pudimos guardar el perfil. Tu nombre sigue aquí para reintentar.') }
    finally { setBusy(false) }
  }
  return <Dialog title={title} onClose={onClose} className="modal utility-dialog">
    <div className="modal-head"><h2>{title}</h2><button aria-label="Cerrar diálogo" onClick={onClose}>×</button></div>
    {mode === 'profile' && <><label>Nombre completo<input autoFocus maxLength={120} value={name} onChange={event => setName(event.target.value)}/></label>{identity.username && <p>@{identity.username}</p>}<p className="utility-note">{identity.email}</p><section className="profile-memory"><h3>Datos y memoria de Nexo</h3><p>Nexo utiliza tu progreso y tus interacciones para personalizar el estudio.</p><button className="secondary" onClick={onMemory}>Ver memoria</button></section>{error && <p role="alert">{error}</p>}<div className="modal-actions"><button className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar perfil'}</button></div></>}
    {mode === 'settings' && <><p>{identity.email}</p><section><h3>Sincronización</h3><p>{remoteEnabled ? 'Tus cambios se guardan en tu cuenta y en este navegador.' : 'Tu trabajo está disponible en este navegador. La conexión con tu cuenta necesita reintentarse.'}</p><button className="secondary" onClick={() => { onClose(); onRetry() }}>Reintentar sincronización</button></section><section><h3>Teclado</h3><p><kbd>Ctrl / Cmd + K</kbd> abre la búsqueda. <kbd>Escape</kbd> cierra menús y diálogos.</p></section></>}
    {mode === 'appearance' && <><p>Ajusta la navegación y el movimiento en este navegador.</p><label className="utility-check"><input type="checkbox" checked={collapsed} onChange={event => onCollapsed(event.target.checked)}/> Barra lateral compacta en escritorio</label><label className="utility-check"><input type="checkbox" checked={reducedMotion} onChange={event => onReducedMotion(event.target.checked)}/> Reducir las transiciones</label><p className="utility-note">También respetamos la preferencia de movimiento de tu dispositivo.</p><button className="secondary" onClick={onClose}>Listo</button></>}
    {mode === 'help' && <><p>Todo tu estudio empieza en un curso.</p><ol className="quick-guide"><li><strong>Encuentra y continúa</strong><p>Inicio propone tu siguiente paso. Mis cursos reúne tus materiales. Buscar encuentra cursos, temas, recursos y soluciones.</p></li><li><strong>Estudia un material</strong><p>Abre Material para leer el documento y Nexo para conversar o practicar desde Contenido. Las fuentes te llevan a una página concreta.</p></li><li><strong>Conecta lo que aprendes</strong><p>En Resolver, Guarda una respuesta en un curso. Biblioteca conserva tus recursos; Progreso distingue actividad de dominio estimado.</p></li></ol><button className="secondary" onClick={onClose}>Entendido</button></>}
  </Dialog>
}
