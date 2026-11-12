import { hectareas, textoSuperficie } from './superficie';

describe('hectareas', () => {
  it('convierte m² a hectáreas', () => {
    expect(hectareas(15000)).toBe(1.5);
    expect(hectareas('2500')).toBe(0.25);
  });

  it('devuelve null sin superficie válida', () => {
    expect(hectareas(null)).toBeNull();
    expect(hectareas(undefined)).toBeNull();
    expect(hectareas('')).toBeNull();
    expect(hectareas(0)).toBeNull();
    expect(hectareas(-3)).toBeNull();
  });
});

describe('textoSuperficie', () => {
  it('muestra m² y hectáreas', () => {
    const texto = textoSuperficie(15000);
    expect(texto).toContain('m²');
    expect(texto).toContain('1,50 ha');
  });

  it('usa el texto de vacío cuando no hay superficie', () => {
    expect(textoSuperficie(null)).toBe('No registrada');
    expect(textoSuperficie(null, 'N/D')).toBe('N/D');
  });
});
