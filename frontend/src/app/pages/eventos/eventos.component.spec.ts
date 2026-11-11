import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { EventosComponent } from './eventos.component';
import { TestBed } from '@angular/core/testing';
import { ConsultaService } from '../../core/services/consulta.service';
import { Router } from '@angular/router';
import { ChangeDetectorRef } from '@angular/core';

describe('Eventos públicos', () => {
  afterEach(() => vi.useRealTimers());

  it('a las 21:00 de Ecuador (día siguiente en UTC) un evento de hoy sigue apareciendo como próximo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T02:00:00Z')); // 5 de octubre, 21:00 en Ecuador
    const eventos = [
      { id: 1, tipo: 'ASAMBLEA', fecha: '2026-10-05', estado: 'CONVOCADO' },
      { id: 2, tipo: 'MINGA', fecha: '2026-10-04', estado: 'PROGRAMADO' },
      { id: 3, tipo: 'MINGA', fecha: '2026-10-11', estado: 'PROGRAMADO' },
      { id: 4, tipo: 'ASAMBLEA', fecha: '2026-10-20', estado: 'CANCELADO' },
    ];
    const consulta = { getEventosPublicos: () => of({ status: 'OK', data: eventos }) };
    TestBed.configureTestingModule({
      providers: [
        { provide: ConsultaService, useValue: consulta },
        { provide: Router, useValue: {} },
        { provide: ChangeDetectorRef, useValue: { detectChanges: vi.fn() } },
      ],
    });
    const component = TestBed.runInInjectionContext(() => new EventosComponent());
    component.ngOnInit();
    expect(component.asambleasFuturas.map((e) => e.id)).toEqual([1]);
    expect(component.mingasFuturas.map((e) => e.id)).toEqual([3]);
  });

  describe('eventos pasados', () => {
    const pasado = (id: number, tipo = 'ASAMBLEA') => ({
      id,
      tipo,
      fecha: '2026-01-10',
      estado: 'REALIZADO',
    });

    function crear(getEventosPasados: ReturnType<typeof vi.fn>) {
      TestBed.configureTestingModule({
        providers: [
          {
            provide: ConsultaService,
            useValue: {
              getEventosPublicos: () => of({ status: 'OK', data: [] }),
              getEventosPasados,
            },
          },
          { provide: Router, useValue: {} },
          { provide: ChangeDetectorRef, useValue: { detectChanges: vi.fn() } },
        ],
      });
      return TestBed.runInInjectionContext(() => new EventosComponent());
    }

    it('se piden la primera vez que se abren y no se vuelven a pedir al ocultarlos y mostrarlos', () => {
      const pedir = vi
        .fn()
        .mockReturnValue(
          of({ status: 'OK', data: [pasado(1), pasado(2)], total: 2, pagina: 1, limite: 10 }),
        );
      const component = crear(pedir);
      component.alternarPasados();
      expect(pedir).toHaveBeenCalledWith('ASAMBLEA', 1);
      expect(component.pasadosActivos.items.map((e) => e.id)).toEqual([1, 2]);
      component.alternarPasados();
      component.alternarPasados();
      expect(pedir).toHaveBeenCalledTimes(1);
    });

    it('"cargar más" agrega la página siguiente y cada pestaña lleva su propia lista', () => {
      const pedir = vi
        .fn()
        .mockReturnValueOnce(
          of({ status: 'OK', data: [pasado(1)], total: 2, pagina: 1, limite: 1 }),
        )
        .mockReturnValueOnce(
          of({ status: 'OK', data: [pasado(2)], total: 2, pagina: 2, limite: 1 }),
        )
        .mockReturnValueOnce(
          of({ status: 'OK', data: [pasado(9, 'MINGA')], total: 1, pagina: 1, limite: 1 }),
        );
      const component = crear(pedir);
      component.alternarPasados();
      component.cargarPasados();
      expect(pedir).toHaveBeenLastCalledWith('ASAMBLEA', 2);
      expect(component.pasadosActivos.items.map((e) => e.id)).toEqual([1, 2]);

      component.setTab('MINGA');
      expect(component.pasadosActivos.visible).toBe(false);
      component.alternarPasados();
      expect(pedir).toHaveBeenLastCalledWith('MINGA', 1);
      expect(component.pasadosActivos.items.map((e) => e.id)).toEqual([9]);
      expect(component.pasados.ASAMBLEA.items).toHaveLength(2);
    });

    it('un error de red se avisa y permite reintentar', () => {
      const pedir = vi
        .fn()
        .mockReturnValueOnce(throwError(() => new Error('sin red')))
        .mockReturnValueOnce(
          of({ status: 'OK', data: [pasado(1)], total: 1, pagina: 1, limite: 10 }),
        );
      const component = crear(pedir);
      component.alternarPasados();
      expect(component.pasadosActivos.error).toBe(true);
      expect(component.pasadosActivos.cargando).toBe(false);
      component.cargarPasados();
      expect(component.pasadosActivos.error).toBe(false);
      expect(component.pasadosActivos.items).toHaveLength(1);
    });
  });
});
