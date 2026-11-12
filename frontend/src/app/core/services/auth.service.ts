import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ROLES, session } from '../auth/session';

export interface LoginResponse {
  status: string;
  message: string;
  token: string;
  /** La cuenta tiene verificación en dos pasos: `token` solo sirve para enviar el código. */
  requiereTotp?: boolean;
  codigosRecuperacionRestantes?: number;
  user: {
    cuentaId: number;
    personaId: number;
    cedula: string;
    nombres: string;
    apellidos: string;
    email: string;
    rol: 'ADMIN' | 'USUARIO';
    rolNombre: string;
    debeCambiarPassword: boolean;
  };
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private apiUrl = `${environment.apiUrl}/auth`;

  private readonly http = inject(HttpClient);

  /**
   * Token intermedio del segundo paso (verificación en dos pasos). Se guarda solo en memoria: si se recarga la
   * página hay que volver a escribir la contraseña.
   */
  private tokenTotp: string | null = null;
  private recordarTotp = true;

  /** Con `recordar` la sesión sobrevive al cierre del navegador; sin él dura lo que la pestaña. */
  login(cedula: string, password: string, recordar = true): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/login`, { cedula, password }).pipe(
      tap((res) => {
        if (res.requiereTotp) {
          this.tokenTotp = res.token;
          this.recordarTotp = recordar;
        } else if (res.token) {
          session.guardar(res.token, res.user, recordar);
        }
      }),
    );
  }

  /** Segundo paso del ingreso: el código de la aplicación de autenticación o uno de recuperación. */
  verificarTotp(codigo: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(
        `${this.apiUrl}/totp/verificar`,
        { codigo },
        { headers: { Authorization: `Bearer ${this.tokenTotp ?? ''}` } },
      )
      .pipe(
        tap((res) => {
          if (res.token) {
            session.guardar(res.token, res.user, this.recordarTotp);
            this.tokenTotp = null;
          }
        }),
      );
  }

  /** Abandona el segundo paso del ingreso. */
  cancelarTotp(): void {
    this.tokenTotp = null;
  }

  /** Genera el secreto y el código QR para activar la verificación en dos pasos. */
  iniciarTotp(): Observable<{
    status: string;
    data: { secreto: string; uri: string; qr: string };
  }> {
    return this.http.post<{ status: string; data: { secreto: string; uri: string; qr: string } }>(
      `${this.apiUrl}/totp/iniciar`,
      {},
    );
  }

  /** Confirma la activación con el primer código; devuelve los códigos de recuperación. */
  activarTotp(
    codigo: string,
  ): Observable<{ status: string; message: string; codigosRecuperacion: string[] }> {
    return this.http.post<{ status: string; message: string; codigosRecuperacion: string[] }>(
      `${this.apiUrl}/totp/activar`,
      { codigo },
    );
  }

  desactivarTotp(password: string): Observable<{ status: string; message: string }> {
    return this.http.post<{ status: string; message: string }>(`${this.apiUrl}/totp/desactivar`, {
      password,
    });
  }

  /** Estado actual de la cuenta (incluye si tiene activa la verificación en dos pasos). */
  perfil(): Observable<{ status: string; user: LoginResponse['user'] & { totpActivo: boolean } }> {
    return this.http.get<{ status: string; user: LoginResponse['user'] & { totpActivo: boolean } }>(
      `${this.apiUrl}/me`,
    );
  }

  /**
   * Cierra la sesión en este navegador y en el servidor: el token deja de valer aunque alguien lo
   * haya copiado. El aviso al servidor no bloquea la salida si no hay conexión.
   */
  logout(): void {
    const token = session.token();
    session.limpiar();
    if (!token) return;
    this.http
      .post(`${this.apiUrl}/logout`, {}, { headers: { Authorization: `Bearer ${token}` } })
      .subscribe({ error: () => undefined });
  }

  /**
   * Cambia la contraseña. El servidor revoca los tokens anteriores y devuelve uno nuevo
   * con acceso completo, que reemplaza al de la sesión.
   */
  changePassword(actualPassword: string, nuevaPassword: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${this.apiUrl}/change-password`, { actualPassword, nuevaPassword })
      .pipe(
        tap((res) => {
          if (res.token) session.guardar(res.token, res.user);
        }),
      );
  }

  getToken(): string | null {
    return session.token();
  }

  getUser(): LoginResponse['user'] | null {
    return session.usuario<LoginResponse['user']>();
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  /** La sesión tiene un token temporal que solo sirve para cambiar la contraseña. */
  debeCambiarPassword(): boolean {
    return this.getUser()?.debeCambiarPassword === true;
  }

  esAdmin(): boolean {
    return this.getUser()?.rol === ROLES.ADMIN;
  }
}
