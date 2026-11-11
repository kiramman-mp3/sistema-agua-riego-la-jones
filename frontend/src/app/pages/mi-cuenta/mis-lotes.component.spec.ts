import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { LoteItem, TurnoItem } from '../../core/models/api-payloads';
import { AuthService } from '../../core/services/auth.service';
import { ConsultaService } from '../../core/services/consulta.service';
import { MisLotesComponent, lotesConTurnos } from './mis-lotes.component';

const lote = (parcial: Partial<LoteItem>): LoteItem => ({
  id: 1,
  sector_id: 1,
  codigo: 'LJA-001',
  superficie_m2: 500,
  latitud_aproximada: '-1.3121',
  longitud_aproximada: '-78.5085',
  activo: true,
  sector_nombre: 'La Jones',
  ...parcial,
});

const turno = (parcial: Partial<TurnoItem>): TurnoItem => ({
  id: 1,
  persona_id: 7,
  lote_id: 1,
  dia_semana: 2,
  hora_inicio: '06:00:00',
  hora_fin: '08:30:00',
  estado: 'ACTIVO',
  ...parcial,
});

describe('lotesConTurnos', () => {
  it('reparte cada turno en su lote y los ordena por día y hora', () => {
    const resultado = lotesConTurnos(
      [lote({ id: 1 }), lote({ id: 2, codigo: 'LJB-014' })],
      [
        turno({ id: 10, lote_id: 1, dia_semana: 5, hora_inicio: '06:00:00', hora_fin: '07:00:00' }),
        turno({ id: 11, lote_id: 2, dia_semana: 1 }),
        turno({ id: 12, lote_id: 1, dia_semana: 2 }),
      ],
    );
    expect(resultado[0].turnos.map((t) => [t.id, t.dia, t.horario])).toEqual([
      [12, 'Martes', '06:00 – 08:30'],
      [10, 'Viernes', '06:00 – 07:00'],
    ]);
    expect(resultado[1].turnos.map((t) => t.id)).toEqual([11]);
  });

  it('un lote sin turnos ni coordenadas queda vacío, sin fallar', () => {
    const [r] = lotesConTurnos([lote({ latitud_aproximada: null, longitud_aproximada: '' })], []);
    expect(r.turnos).toEqual([]);
    expect(r.latitud).toBeNull();
    expect(r.longitud).toBeNull();
  });

  it('convierte las coordenadas de texto en números', () => {
    const [r] = lotesConTurnos([lote({})], []);
    expect(r.latitud).toBeCloseTo(-1.3121);
    expect(r.longitud).toBeCloseTo(-78.5085);
  });
});

describe('Mis lotes', () => {
  function crear(consulta: Partial<Record<'getMisLotes' | 'getMisTurnos', unknown>>) {
    TestBed.configureTestingModule({
      imports: [MisLotesComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { getUser: () => ({ personaId: 7, cedula: '1804567890' }) },
        },
        { provide: ConsultaService, useValue: consulta },
      ],
    });
    const fixture = TestBed.createComponent(MisLotesComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('pide lotes y turnos de la persona de la sesión y los muestra por lote', () => {
    const getMisLotes = vi.fn(() =>
      of({
        status: 'OK',
        data: [lote({ id: 1 }), lote({ id: 2, codigo: 'LJB-014', latitud_aproximada: null })],
      }),
    );
    const getMisTurnos = vi.fn(() => of({ status: 'OK', data: [turno({ lote_id: 2 })] }));
    const fixture = crear({ getMisLotes, getMisTurnos });
    expect(getMisLotes).toHaveBeenCalledWith(7);
    expect(getMisTurnos).toHaveBeenCalledWith(7);

    const el = fixture.nativeElement as HTMLElement;
    const tarjetas = el.querySelectorAll('.lote');
    expect(tarjetas).toHaveLength(2);
    expect(el.querySelector('.portal-cabecera__lead')?.textContent).toContain('2 lotes');
    expect(el.querySelector('.portal-cabecera__lead')?.textContent).toContain(
      '1 turno de riego asignado',
    );
    // El primero no tiene turnos; el segundo no tiene ubicación.
    expect(tarjetas[0].textContent).toContain('no tiene turnos de riego asignados');
    expect(tarjetas[0].querySelector('app-lotes-map')).not.toBeNull();
    expect(tarjetas[1].textContent).toContain('Martes');
    expect(tarjetas[1].textContent).toContain('aún no tiene ubicación');
  });

  it('sin lotes explica que no tiene ninguno', () => {
    const fixture = crear({
      getMisLotes: () => of({ status: 'OK', data: [] }),
      getMisTurnos: () => of({ status: 'OK', data: [] }),
    });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'No tiene lotes registrados',
    );
  });

  it('si falla la carga ofrece reintentar', () => {
    const fixture = crear({
      getMisLotes: () => throwError(() => new Error('sin conexión')),
      getMisTurnos: () => of({ status: 'OK', data: [] }),
    });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('No se pudieron cargar');
    expect(el.querySelector('[role="alert"] button')).not.toBeNull();
  });
});
