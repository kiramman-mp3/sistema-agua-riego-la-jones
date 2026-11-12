/**
 * Estado de la sesión en el navegador (usuario y vencimiento).
 *
 * El token de sesión NO se guarda aquí: el servidor lo deja en una cookie HttpOnly que el JavaScript de la
 * página no puede leer, así un XSS no puede robarlo. Este módulo solo recuerda quién inició sesión y hasta
 * cuándo vale, para decidir qué pantallas mostrar; quien decide de verdad es el servidor (401 si no vale).
 * Lo comparten AuthService y el interceptor, que no puede inyectar AuthService sin crear una dependencia
 * circular (AuthService -> HttpClient -> interceptor).
 */
export const ROLES = { ADMIN: 'ADMIN', USUARIO: 'USUARIO' } as const;
export type Rol = (typeof ROLES)[keyof typeof ROLES];

const EXPIRA_KEY = 'junta_expira';
const USER_KEY = 'junta_user';
/** Clave de versiones anteriores, que guardaban el token en el navegador: se borra al limpiar. */
const TOKEN_ANTERIOR_KEY = 'junta_token';
/** Cookie legible que el servidor deja junto a la de sesión; su valor va en la cabecera X-CSRF-Token. */
export const COOKIE_CSRF = 'junta_csrf';

type Almacen = 'local' | 'sesion';

/* El almacenamiento puede no existir (SSR, pruebas) o estar bloqueado por el navegador. */
function almacen(tipo: Almacen): Storage | null {
  try {
    return tipo === 'local' ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}

function leer(tipo: Almacen, clave: string): string | null {
  try {
    return almacen(tipo)?.getItem(clave) ?? null;
  } catch {
    return null;
  }
}

function escribir(tipo: Almacen, clave: string, valor: string): void {
  try {
    almacen(tipo)?.setItem(clave, valor);
  } catch {
    /* almacenamiento no disponible */
  }
}

function borrar(tipo: Almacen, clave: string): void {
  try {
    almacen(tipo)?.removeItem(clave);
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Dónde está la sesión actual: la de pestaña tiene prioridad sobre la recordada. */
function almacenActual(): Almacen | null {
  if (leer('sesion', EXPIRA_KEY)) return 'sesion';
  if (leer('local', EXPIRA_KEY)) return 'local';
  return null;
}

/** Fecha de expiración (en ms) del JWT, o null si no se puede leer. No valida la firma: eso lo hace el servidor. */
export function expiracionToken(token: string): number | null {
  try {
    const carga = token.split('.')[1];
    if (!carga) return null;
    const json = JSON.parse(atob(carga.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Valor de una cookie legible del documento, o null. */
export function leerCookie(nombre: string): string | null {
  try {
    for (const parte of document.cookie.split(';')) {
      const i = parte.indexOf('=');
      if (i > 0 && parte.slice(0, i).trim() === nombre)
        return decodeURIComponent(parte.slice(i + 1));
    }
  } catch {
    /* sin documento (SSR, pruebas) */
  }
  return null;
}

/**
 * Sesión del usuario. Con "Recordar mi sesión" el usuario se guarda en localStorage y sobrevive al cierre del
 * navegador (como la cookie de sesión, que en ese caso es persistente); sin esa opción va a sessionStorage.
 * Una sesión vencida se descarta al consultarla, para no mostrar pantallas que el servidor rechazará.
 */
export const session = {
  /** Hay una sesión vigente según su fecha de vencimiento. */
  activa(): boolean {
    const tipo = almacenActual();
    if (!tipo) return false;
    const expira = Number(leer(tipo, EXPIRA_KEY));
    if (!Number.isFinite(expira) || expira <= Date.now()) {
      session.limpiar();
      return false;
    }
    return true;
  },
  usuario: <T = unknown>(): T | null => {
    const tipo = almacenActual();
    const datos = tipo ? leer(tipo, USER_KEY) : null;
    if (!datos) return null;
    try {
      return JSON.parse(datos) as T;
    } catch {
      return null;
    }
  },
  /** Indica si la sesión actual se guardó para recordarse. */
  recordada: (): boolean => almacenActual() === 'local',
  /**
   * Guarda el usuario y el vencimiento del token recibido (el token mismo queda solo en la cookie HttpOnly).
   * Si no se indica `recordar`, conserva el almacén de la sesión actual (por ejemplo, al renovar la sesión
   * tras cambiar la contraseña).
   */
  guardar(token: string, usuario: unknown, recordar?: boolean): void {
    const destino: Almacen =
      recordar === undefined ? (almacenActual() ?? 'local') : recordar ? 'local' : 'sesion';
    session.limpiar();
    const expira = expiracionToken(token) ?? Date.now() + 8 * 60 * 60 * 1000;
    escribir(destino, EXPIRA_KEY, String(expira));
    escribir(destino, USER_KEY, JSON.stringify(usuario));
  },
  guardarUsuario(usuario: unknown): void {
    escribir(almacenActual() ?? 'local', USER_KEY, JSON.stringify(usuario));
  },
  limpiar(): void {
    for (const tipo of ['local', 'sesion'] as const) {
      borrar(tipo, EXPIRA_KEY);
      borrar(tipo, USER_KEY);
      borrar(tipo, TOKEN_ANTERIOR_KEY);
    }
  },
};
