import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { COOKIE_CSRF, leerCookie, session } from '../auth/session';

/** Solo las peticiones al backend llevan credenciales; nunca se envían a terceros. */
const esDelBackend = (url: string) =>
  url.startsWith(environment.apiUrl) || url.startsWith(`${environment.serverUrl}/`);

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Interceptor global de autenticación.
 *
 * - La sesión viaja en una cookie HttpOnly que pone el servidor: a las peticiones al backend se les pide
 *   enviar credenciales (necesario en desarrollo, donde el frontend corre en otro puerto) y, a las que
 *   modifican datos, se les agrega `X-CSRF-Token` con el valor de la cookie legible `junta_csrf`.
 * - Ante un 401 (sesión expirada o inválida) limpia la sesión y redirige al login conservando la URL actual
 *   como returnUrl. Un 401 del propio login, del segundo paso o del cierre de sesión se deja pasar.
 * - Ante un 403 CAMBIO_PASSWORD_REQUERIDO lleva al login, que muestra el cambio de contraseña.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);

  let peticion = req;
  if (esDelBackend(req.url)) {
    const csrf = METODOS_SEGUROS.has(req.method) ? null : leerCookie(COOKIE_CSRF);
    peticion = req.clone({
      withCredentials: true,
      ...(csrf && !req.headers.has('X-CSRF-Token') ? { setHeaders: { 'X-CSRF-Token': csrf } } : {}),
    });
  }

  return next(peticion).pipe(
    catchError((error) => {
      if (
        error?.status === 401 &&
        !req.url.endsWith('/auth/login') &&
        !req.url.endsWith('/auth/totp/verificar') &&
        !req.url.endsWith('/auth/logout')
      ) {
        session.limpiar();
        const urlActual = router.url;
        if (!urlActual.startsWith('/login')) {
          router.navigate(['/login'], { queryParams: { returnUrl: urlActual } });
        }
      }
      if (
        error?.status === 403 &&
        error.error?.codigo === 'CAMBIO_PASSWORD_REQUERIDO' &&
        !router.url.startsWith('/login')
      ) {
        router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
      }
      return throwError(() => error);
    }),
  );
};
