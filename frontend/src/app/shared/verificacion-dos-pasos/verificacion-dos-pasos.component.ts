import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { mensajeAmigable } from '../../core/utils/errores';

type Paso = 'cargando' | 'inactiva' | 'escanear' | 'codigos' | 'activa';

/**
 * Verificación en dos pasos (opcional) de la propia cuenta de la directiva: se activa escaneando un código QR con
 * una aplicación de autenticación (Google Authenticator, Microsoft Authenticator, Authy…) y confirmando el primer
 * código. Al activarla se muestran una sola vez los códigos de recuperación.
 */
@Component({
  selector: 'app-verificacion-dos-pasos',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './verificacion-dos-pasos.component.html',
})
export class VerificacionDosPasosComponent implements OnInit {
  private auth = inject(AuthService);
  private notify = inject(NotificationService);

  readonly paso = signal<Paso>('cargando');
  readonly qr = signal('');
  readonly secreto = signal('');
  readonly codigosRecuperacion = signal<string[]>([]);
  readonly trabajando = signal(false);
  readonly error = signal('');
  codigo = '';
  password = '';

  ngOnInit() {
    this.auth.perfil().subscribe({
      next: (res) => this.paso.set(res.user.totpActivo ? 'activa' : 'inactiva'),
      error: () => this.paso.set('inactiva'),
    });
  }

  empezar() {
    this.ejecutar(this.auth.iniciarTotp(), (res) => {
      this.qr.set(res.data.qr);
      this.secreto.set(res.data.secreto);
      this.codigo = '';
      this.paso.set('escanear');
    });
  }

  confirmar() {
    if (!/^\d{6}$/.test(this.codigo.trim())) {
      this.error.set('Escriba el código de 6 dígitos que muestra la aplicación.');
      return;
    }
    this.ejecutar(this.auth.activarTotp(this.codigo.trim()), (res) => {
      this.codigosRecuperacion.set(res.codigosRecuperacion);
      this.qr.set('');
      this.secreto.set('');
      this.paso.set('codigos');
      this.notify.success('Verificación en dos pasos activada.');
    });
  }

  terminar() {
    this.codigosRecuperacion.set([]);
    this.paso.set('activa');
  }

  cancelar() {
    this.qr.set('');
    this.secreto.set('');
    this.error.set('');
    this.paso.set('inactiva');
  }

  desactivar() {
    if (!this.password) {
      this.error.set('Ingrese su contraseña para desactivarla.');
      return;
    }
    this.ejecutar(this.auth.desactivarTotp(this.password), () => {
      this.password = '';
      this.paso.set('inactiva');
      this.notify.success('Verificación en dos pasos desactivada.');
    });
  }

  private ejecutar<T>(peticion: import('rxjs').Observable<T>, alTerminar: (res: T) => void) {
    this.trabajando.set(true);
    this.error.set('');
    peticion.subscribe({
      next: (res) => {
        this.trabajando.set(false);
        alTerminar(res);
      },
      error: (err: HttpErrorResponse) => {
        this.trabajando.set(false);
        this.error.set(
          mensajeAmigable(err.status, err.error?.message) || 'No se pudo completar la operación.',
        );
      },
    });
  }
}
