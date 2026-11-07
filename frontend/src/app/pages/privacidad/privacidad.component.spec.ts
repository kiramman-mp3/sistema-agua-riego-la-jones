import { TestBed } from '@angular/core/testing';
import { PrivacidadComponent } from './privacidad.component';
import { AVISO_PRIVACIDAD } from './privacidad.data';

describe('Aviso de privacidad', () => {
  it('cubre responsable, datos, finalidad, derechos y cómo ejercerlos', () => {
    const ids = AVISO_PRIVACIDAD.secciones.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining(['responsable', 'datos', 'finalidad', 'derechos', 'ejercer']),
    );
  });

  it('cada sección tiene título y contenido, y los identificadores no se repiten', () => {
    const ids = AVISO_PRIVACIDAD.secciones.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    AVISO_PRIVACIDAD.secciones.forEach((s) => {
      expect(s.titulo.trim()).not.toBe('');
      expect((s.parrafos?.length ?? 0) + (s.lista?.length ?? 0)).toBeGreaterThan(0);
    });
  });

  it('muestra el título, el índice y todas las secciones', async () => {
    await TestBed.configureTestingModule({ imports: [PrivacidadComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PrivacidadComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('h1')?.textContent).toContain('Aviso de privacidad');
    expect(el.querySelectorAll('.privacidad__indice a').length).toBe(
      AVISO_PRIVACIDAD.secciones.length,
    );
    expect(el.querySelectorAll('section h2').length).toBe(AVISO_PRIVACIDAD.secciones.length);
  });
});
