import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { authInterceptor } from './auth.interceptor';
import { session } from '../auth/session';
import { environment } from '../../../environments/environment';
import { almacenamientoEnMemoria } from '../../testing/almacenamiento-en-memoria';

const jwt = () => `x.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.y`;

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    vi.stubGlobal('localStorage', almacenamientoEnMemoria());
    vi.stubGlobal('sessionStorage', almacenamientoEnMemoria());
    document.cookie = 'junta_csrf=valor-csrf; path=/';
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    vi.unstubAllGlobals();
    document.cookie = 'junta_csrf=; path=/; max-age=0';
  });

  it('las peticiones al backend envían credenciales (cookie) y nunca un token en cabecera', () => {
    session.guardar(jwt(), { rol: 'ADMIN' });
    http.get(`${environment.apiUrl}/personas`).subscribe();
    const req = backend.expectOne(`${environment.apiUrl}/personas`).request;
    expect(req.withCredentials).toBe(true);
    expect(req.headers.has('Authorization')).toBe(false);
    expect(req.headers.has('X-CSRF-Token')).toBe(false);
  });

  it('las que modifican datos llevan el token CSRF de la cookie legible', () => {
    http.post(`${environment.apiUrl}/personas`, {}).subscribe();
    expect(
      backend.expectOne(`${environment.apiUrl}/personas`).request.headers.get('X-CSRF-Token'),
    ).toBe('valor-csrf');
  });

  it('no envía credenciales a servicios de terceros', () => {
    http.post('https://tile.openstreetmap.org/1/1/1.png', {}).subscribe();
    const req = backend.expectOne('https://tile.openstreetmap.org/1/1/1.png').request;
    expect(req.withCredentials).toBe(false);
    expect(req.headers.has('X-CSRF-Token')).toBe(false);
  });

  it('ante un 401 limpia la sesión y lleva al login', () => {
    session.guardar(jwt(), { rol: 'USUARIO' });
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    http.get(`${environment.apiUrl}/auth/me`).subscribe({ error: () => {} });
    backend
      .expectOne(`${environment.apiUrl}/auth/me`)
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(session.activa()).toBe(false);
    expect(navegar).toHaveBeenCalledWith(['/login'], expect.anything());
  });

  it('un 401 del login o del código de verificación no cierra la sesión ni redirige', () => {
    session.guardar(jwt(), { rol: 'USUARIO' });
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate');
    for (const ruta of ['/auth/login', '/auth/totp/verificar']) {
      http.post(`${environment.apiUrl}${ruta}`, {}).subscribe({ error: () => {} });
      backend
        .expectOne(`${environment.apiUrl}${ruta}`)
        .flush({}, { status: 401, statusText: 'Unauthorized' });
    }
    expect(session.activa()).toBe(true);
    expect(navegar).not.toHaveBeenCalled();
  });
});
