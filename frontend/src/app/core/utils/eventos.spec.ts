import { describe, expect, it } from 'vitest';
import { agruparPorFecha, subtipoAsamblea } from './eventos';

describe('agruparPorFecha', () => {
  const ev = (id: number, fecha: string, hora_inicio = '08:00') => ({ id, fecha, hora_inicio });

  it('separa próximas (más cercana primero) y anteriores (más reciente primero)', () => {
    const secciones = agruparPorFecha(
      [
        ev(1, '2026-09-01'),
        ev(2, '2026-11-01'),
        ev(3, '2026-10-07', '18:00'),
        ev(4, '2026-08-01'),
        ev(5, '2026-10-07'),
      ],
      '2026-10-07',
    );
    expect(secciones.map((s) => [s.titulo, s.eventos.map((e) => e.id)])).toEqual([
      ['Próximas', [5, 3, 2]],
      ['Anteriores', [1, 4]],
    ]);
  });

  it('omite los grupos vacíos', () => {
    expect(agruparPorFecha([ev(1, '2027-01-01')], '2026-10-07').map((s) => s.id)).toEqual([
      'proximas',
    ]);
    expect(agruparPorFecha([], '2026-10-07')).toEqual([]);
  });
});

describe('subtipoAsamblea', () => {
  it('usa el subtipo guardado aunque el título no lo diga', () => {
    expect(
      subtipoAsamblea({
        tipo: 'ASAMBLEA',
        titulo: 'Sesión urgente',
        subtipo_asamblea: 'EXTRAORDINARIA',
      }),
    ).toBe('EXTRAORDINARIA');
  });

  it('sin subtipo guardado lo deduce del título, y las mingas no tienen subtipo', () => {
    expect(subtipoAsamblea({ tipo: 'ASAMBLEA', titulo: 'Asamblea Extraordinaria' })).toBe(
      'EXTRAORDINARIA',
    );
    expect(subtipoAsamblea({ tipo: 'ASAMBLEA', titulo: 'Asamblea general' })).toBe('ORDINARIA');
    expect(subtipoAsamblea({ tipo: 'MINGA', titulo: 'Minga extraordinaria' })).toBeNull();
  });
});
