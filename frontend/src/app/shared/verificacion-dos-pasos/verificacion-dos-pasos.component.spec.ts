import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { VerificacionDosPasosComponent } from './verificacion-dos-pasos.component';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

describe('VerificacionDosPasosComponent', () => {
  function crear(auth: Partial<Record<keyof AuthService, unknown>>) {
    TestBed.configureTestingModule({
      imports: [VerificacionDosPasosComponent],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(VerificacionDosPasosComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('activa la verificación: muestra el QR, pide el código y enseña los códigos de recuperación', () => {
    const activarTotp = vi.fn(() =>
      of({ status: 'OK', message: 'ok', codigosRecuperacion: ['AAAAA-BBBBB', 'CCCCC-DDDDD'] }),
    );
    const fixture = crear({
      perfil: () => of({ status: 'OK', user: { totpActivo: false } }),
      iniciarTotp: () =>
        of({
          status: 'OK',
          data: { secreto: 'JBSWY3DP', uri: 'otpauth://x', qr: 'data:image/png;base64,AA' },
        }),
      activarTotp,
    });
    const c = fixture.componentInstance;
    expect(c.paso()).toBe('inactiva');

    c.empezar();
    fixture.detectChanges();
    expect(c.paso()).toBe('escanear');
    const img = (fixture.nativeElement as HTMLElement).querySelector('img');
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,AA');

    c.codigo = '12';
    c.confirmar();
    expect(c.error()).toContain('6 dígitos');
    expect(activarTotp).not.toHaveBeenCalled();

    c.codigo = '123456';
    c.confirmar();
    fixture.detectChanges();
    expect(activarTotp).toHaveBeenCalledWith('123456');
    expect(c.paso()).toBe('codigos');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('AAAAA-BBBBB');
  });

  it('desactivarla pide la contraseña y muestra el error del servidor', () => {
    const fixture = crear({
      perfil: () => of({ status: 'OK', user: { totpActivo: true } }),
      desactivarTotp: () =>
        throwError(() => ({
          status: 400,
          error: { message: 'La contraseña ingresada es incorrecta.' },
        })),
    });
    const c = fixture.componentInstance;
    expect(c.paso()).toBe('activa');
    c.desactivar();
    expect(c.error()).toContain('contraseña');
    c.password = 'mala';
    c.desactivar();
    expect(c.error()).toBe('La contraseña ingresada es incorrecta.');
    expect(c.paso()).toBe('activa');
  });
});
