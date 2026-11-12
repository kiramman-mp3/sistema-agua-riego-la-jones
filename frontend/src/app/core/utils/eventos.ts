export interface SeccionEventos<T> {
  id: 'proximas' | 'anteriores';
  titulo: string;
  eventos: T[];
}

/**
 * Separa eventos (asambleas o mingas) en próximos —el más cercano primero— y anteriores
 * —el más reciente primero—. Omite los grupos vacíos. `hoy` es 'AAAA-MM-DD'.
 */
export function agruparPorFecha<T extends { fecha: string; hora_inicio?: string }>(
  eventos: T[],
  hoy: string,
): SeccionEventos<T>[] {
  const clave = (e: T) => `${e.fecha} ${e.hora_inicio ?? ''}`;
  const proximas = eventos
    .filter((e) => e.fecha >= hoy)
    .sort((a, b) => clave(a).localeCompare(clave(b)));
  const anteriores = eventos
    .filter((e) => e.fecha < hoy)
    .sort((a, b) => clave(b).localeCompare(clave(a)));
  const secciones: SeccionEventos<T>[] = [
    { id: 'proximas', titulo: 'Próximas', eventos: proximas },
    { id: 'anteriores', titulo: 'Anteriores', eventos: anteriores },
  ];
  return secciones.filter((s) => s.eventos.length);
}

export type SubtipoAsamblea = 'ORDINARIA' | 'EXTRAORDINARIA';

/**
 * Subtipo de una asamblea: el que guardó la directiva al crearla o, en datos anteriores que no lo
 * traen, el que se deduce del título. Las mingas no tienen subtipo.
 */
export function subtipoAsamblea(evento: {
  tipo: string;
  titulo: string;
  subtipo_asamblea?: string | null;
}): SubtipoAsamblea | null {
  if (evento.tipo !== 'ASAMBLEA') return null;
  if (evento.subtipo_asamblea === 'ORDINARIA' || evento.subtipo_asamblea === 'EXTRAORDINARIA') {
    return evento.subtipo_asamblea;
  }
  return /extraordinaria/i.test(evento.titulo) ? 'EXTRAORDINARIA' : 'ORDINARIA';
}
