import { vi } from 'vitest';
import { session } from './session';
import { almacenamientoEnMemoria } from '../../testing/almacenamiento-en-memoria';

/** JWT sin firma válida: el cliente solo lee `exp`, la firma la verifica el servidor. */
const jwt = (exp: number) => `x.${btoa(JSON.stringify({ exp })).replace(/=+$/, '')}.y`;
const enUnaHora = () => Math.floor(Date.now() / 1000) + 3600;

describe('Sesión', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', almacenamientoEnMemoria());
    vi.stubGlobal('sessionStorage', almacenamientoEnMemoria());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('con "Recordar mi sesión" guarda en localStorage', () => {
    session.guardar(jwt(enUnaHora()), { rol: 'ADMIN' }, true);
    expect(localStorage.getItem('junta_expira')).not.toBeNull();
    expect(sessionStorage.getItem('junta_expira')).toBeNull();
    expect(session.recordada()).toBe(true);
  });

  it('sin recordar guarda solo en sessionStorage y borra una sesión recordada anterior', () => {
    session.guardar(jwt(enUnaHora()), { rol: 'ADMIN' }, true);
    session.guardar(jwt(enUnaHora()), { rol: 'USUARIO' }, false);
    expect(localStorage.getItem('junta_expira')).toBeNull();
    expect(session.usuario<{ rol: string }>()?.rol).toBe('USUARIO');
    expect(session.recordada()).toBe(false);
  });

  it('al renovar el token conserva el almacén elegido', () => {
    session.guardar(jwt(enUnaHora()), { rol: 'USUARIO' }, false);
    session.guardar(jwt(enUnaHora()), { rol: 'USUARIO', debeCambiarPassword: false });
    expect(sessionStorage.getItem('junta_expira')).not.toBeNull();
    expect(localStorage.getItem('junta_expira')).toBeNull();
  });

  it('nunca guarda el token: queda solo en la cookie HttpOnly del servidor', () => {
    const token = jwt(enUnaHora());
    session.guardar(token, { rol: 'ADMIN' }, true);
    expect(JSON.stringify({ ...localStorage })).not.toContain(token);
    expect(session.activa()).toBe(true);
  });

  it('descarta un token vencido', () => {
    session.guardar(jwt(Math.floor(Date.now() / 1000) - 10), { rol: 'ADMIN' }, true);
    expect(session.activa()).toBe(false);
    expect(session.usuario()).toBeNull();
  });
});
