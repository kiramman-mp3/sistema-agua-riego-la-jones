import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { session } from '../auth/session';
import { environment } from '../../../environments/environment';

/** JWT sin firma válida: el cliente solo lee `exp`, la firma la verifica el servidor. */
const jwt = () => `x.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.y`;

describe('AuthService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    session.limpiar();
  });

  it('al cerrar sesión borra la sesión local y avisa al servidor, que borra la cookie', () => {
    const auth = TestBed.inject(AuthService);
    const http = TestBed.inject(HttpTestingController);
    session.guardar(jwt(), { rol: 'USUARIO' }, false);
    expect(auth.isLoggedIn()).toBe(true);

    auth.logout();
    expect(auth.isLoggedIn()).toBe(false);
    const peticion = http.expectOne(`${environment.apiUrl}/auth/logout`);
    expect(peticion.request.method).toBe('POST');
    peticion.flush({ status: 'OK' });
    http.verify();
  });

  it('sin sesión no llama al servidor', () => {
    const auth = TestBed.inject(AuthService);
    const http = TestBed.inject(HttpTestingController);
    auth.logout();
    http.expectNone(`${environment.apiUrl}/auth/logout`);
    http.verify();
  });

  it('envía "recordar" al iniciar sesión y no guarda el token en el navegador', () => {
    const auth = TestBed.inject(AuthService);
    const http = TestBed.inject(HttpTestingController);
    const token = jwt();
    auth.login('1803456789', 'Canal-Matriz-0417', false).subscribe();
    const peticion = http.expectOne(`${environment.apiUrl}/auth/login`);
    expect(peticion.request.body).toEqual({
      cedula: '1803456789',
      password: 'Canal-Matriz-0417',
      recordar: false,
    });
    peticion.flush({ status: 'OK', token, user: { rol: 'USUARIO' } });
    expect(auth.isLoggedIn()).toBe(true);
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(token);
    http.verify();
  });
});
