const M2_POR_HECTAREA = 10_000;

/** Hectáreas de un lote registrado en m². Nunca se guardan: se calculan a partir de los m². */
export function hectareas(superficieM2: number | string | null | undefined): number | null {
  const m2 = Number(superficieM2);
  if (superficieM2 === null || superficieM2 === undefined || superficieM2 === '' || !(m2 > 0)) {
    return null;
  }
  return m2 / M2_POR_HECTAREA;
}

/** "1.500 m² (0,15 ha)"; `vacio` cuando el lote aún no tiene superficie. */
export function textoSuperficie(
  superficieM2: number | string | null | undefined,
  vacio = 'No registrada',
): string {
  const ha = hectareas(superficieM2);
  if (ha === null) return vacio;
  const m2 = Number(superficieM2).toLocaleString('es-EC', { maximumFractionDigits: 2 });
  const haTexto = ha.toLocaleString('es-EC', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  return `${m2} m² (${haTexto} ha)`;
}
