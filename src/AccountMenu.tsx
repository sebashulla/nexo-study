import { PopupMenu } from './PopupMenu'
import { Icon } from './Icon'

export type AccountAction = 'profile' | 'memory' | 'settings' | 'appearance' | 'feedback' | 'help' | 'admin' | 'logout'
export type AccountIdentity = { fullName: string; username: string; email: string; isAdmin: boolean }
const groups: { action: AccountAction; label: string; icon: string }[][] = [
  [{ action: 'profile', label: 'Mi perfil', icon: 'person' }, { action: 'memory', label: 'Datos y memoria', icon: 'settings' }, { action: 'appearance', label: 'Apariencia', icon: 'appearance' }],
  [{ action: 'feedback', label: 'Enviar comentarios', icon: 'chat' }, { action: 'help', label: 'Ayuda / Guía rápida', icon: 'help' }],
  [{ action: 'admin', label: 'Administración', icon: 'shield' }],
  [{ action: 'logout', label: 'Cerrar sesión', icon: 'logout' }],
]

export function AccountMenu({ identity, onAction, signingOut, error, sidebar = false, routeKey }: {
  identity: AccountIdentity; onAction: (action: AccountAction) => void; signingOut: boolean; error: string; sidebar?: boolean; routeKey: string
}) {
  return <PopupMenu className={sidebar ? 'sidebar-account' : ''} label={sidebar ? 'Abrir perfil' : 'Mi cuenta'} title={sidebar ? identity.fullName : undefined} triggerClass={sidebar ? 'sidebar-profile' : 'avatar'} menuLabel="Opciones de tu cuenta" routeKey={routeKey} trigger={sidebar ? <><span>{identity.fullName.charAt(0).toUpperCase()}</span><strong>{identity.fullName}</strong></> : identity.fullName.charAt(0).toUpperCase()}>
      <div className="account-identity" role="presentation"><strong>{identity.fullName}</strong><span>{identity.username ? `@${identity.username}` : identity.email}</span></div>
      {groups.filter((_, index) => index !== 2 || identity.isAdmin).map((group, index) => <div className="account-menu-group" role="group" key={index}>{group.map(item => <button key={item.label} role="menuitem" data-keep-open={item.action === 'logout' ? 'true' : undefined} disabled={item.action === 'logout' && signingOut} onClick={() => {
        onAction(item.action)
      }}><Icon name={item.icon}/><span>{item.action === 'logout' && signingOut ? 'Cerrando sesión…' : item.label}</span></button>)}</div>)}
      {error && <p role="alert" className="auth-alert error">{error}</p>}
  </PopupMenu>
}
