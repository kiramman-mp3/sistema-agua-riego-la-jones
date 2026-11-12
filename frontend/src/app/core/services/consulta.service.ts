import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface DeudaItem {
  id: number;
  /** AGUA_ANUAL: pago anual de agua; OBLIGACION: multas y otros cobros. */
  tipo: 'AGUA_ANUAL' | 'OBLIGACION';
  concepto: string;
  conceptoCodigo?: string;
  anio: number;
  periodo: string;
  valor: number;
  estado: 'PENDIENTE' | 'PAGADA' | 'ANULADA';
  fechaEmision: string;
  pagoId?: number | null;
  /** Pago anual de agua que cubrió esta obligación (si es de tipo AGUA_ANUAL y está pagada). */
  pagoAnualId?: number | null;
}

export interface ConsultaResultadoResponse {
  status: string;
  resultado: {
    cedula: string;
    nombres: string;
    sector: string;
    loteCodigo: string;
    /** Todos los lotes del usuario; `sector` y `loteCodigo` describen solo el primero. */
    lotes: { codigo: string; sector: string }[];
    totalPendiente: number;
    deudas: DeudaItem[];
  };
}

/** Evento anunciado en la página pública (GET /eventos/publicos): sin datos personales. */
export interface EventoPublico {
  id: number;
  tipo: 'ASAMBLEA' | 'MINGA';
  titulo: string;
  descripcion: string | null;
  fecha: string;
  hora_inicio: string;
  hora_fin: string | null;
  lugar: string | null;
  /** El servidor solo publica PROGRAMADO y CONVOCADO; la interfaz igual descarta otros estados. */
  estado: EventoItem['estado'];
  genera_multa_ausencia: boolean | number;
  valor_multa: number | null;
  convocatoria_firmada_url: string | null;
  /** Ruta del acta firmada, si ya se subió. El archivo solo lo abre quien inició sesión. */
  acta_firmada_url: string | null;
  /** Sector al que se convoca; null cuando es para todos los sectores. */
  sector_id: number | null;
  sector_nombre: string | null;
}

/** Filtros de la consulta pública de eventos pasados. */
export interface FiltroEventosPasados {
  sectorId?: number | null;
  subtipo?: SubtipoAsamblea | null;
}

export interface PaginaEventosPasados {
  status: 'OK' | 'ERROR';
  data: EventoPublico[];
  total: number;
  pagina: number;
  limite: number;
}

/** Punto del orden del día de una asamblea, con su acta. */
export interface PuntoAsamblea {
  id: number;
  evento_id: number;
  orden: number;
  punto_tratar: string;
  tratado: string | null;
  resolucion: string | null;
  [campo: string]: unknown;
}

/** Respuesta de GET /eventos/:id. */
export interface EventoDetalleResponse {
  status: string;
  evento: EventoItem & Record<string, unknown>;
  puntos: PuntoAsamblea[];
  asistenciaStats: { estado: string; total: number }[];
}

import { DocumentosService, DocumentoSubido, TipoDocumento } from './documentos.service';
import { environment } from '../../../environments/environment';
import { EventoItem, LoteItem, RespuestaApi, SectorItem, TurnoItem } from '../models/api-payloads';
import { SubtipoAsamblea } from '../utils/eventos';

@Injectable({
  providedIn: 'root',
})
export class ConsultaService {
  private apiUrl = environment.apiUrl;

  private readonly http = inject(HttpClient);
  private readonly documentos = inject(DocumentosService);

  consultarPorCedula(cedula: string): Observable<ConsultaResultadoResponse> {
    return this.http.get<ConsultaResultadoResponse>(`${this.apiUrl}/personas/consulta/${cedula}`);
  }

  getEventosPublicos(): Observable<RespuestaApi<EventoPublico[]>> {
    // Solo eventos anunciados y sin datos personales.
    return this.http.get<RespuestaApi<EventoPublico[]>>(`${this.apiUrl}/eventos/publicos`);
  }

  getEventosPasados(
    tipo: EventoPublico['tipo'],
    pagina: number,
    filtro: FiltroEventosPasados = {},
    limite = 10,
  ): Observable<PaginaEventosPasados> {
    const params: Record<string, string | number> = { tipo, pagina, limite };
    if (filtro.sectorId) params['sector_id'] = filtro.sectorId;
    if (filtro.subtipo) params['subtipo'] = filtro.subtipo;
    return this.http.get<PaginaEventosPasados>(`${this.apiUrl}/eventos/publicos/pasados`, {
      params,
    });
  }

  /** Sectores de la Junta, para filtrar las convocatorias. Es una consulta pública. */
  getSectores(): Observable<RespuestaApi<SectorItem[]>> {
    return this.http.get<RespuestaApi<SectorItem[]>>(`${this.apiUrl}/lotes/sectores`);
  }

  /** Lotes de la persona. El servidor solo entrega los propios a un usuario; la directiva pasa su persona. */
  getMisLotes(personaId: number): Observable<RespuestaApi<LoteItem[]>> {
    return this.http.get<RespuestaApi<LoteItem[]>>(`${this.apiUrl}/lotes`, {
      params: { persona_id: personaId },
    });
  }

  /** Turnos de riego activos asignados a los lotes de la persona. */
  getMisTurnos(personaId: number): Observable<RespuestaApi<TurnoItem[]>> {
    return this.http.get<RespuestaApi<TurnoItem[]>>(`${this.apiUrl}/turnos`, {
      params: { persona_id: personaId },
    });
  }

  getEventoDetalle(id: number): Observable<EventoDetalleResponse> {
    return this.http.get<EventoDetalleResponse>(`${this.apiUrl}/eventos/${id}`);
  }

  subirDocumentoEvento(
    id: number,
    tipo: TipoDocumento,
    archivo: File,
  ): Observable<DocumentoSubido> {
    return this.documentos.subir(id, tipo, archivo);
  }

  abrirDocumento(ruta: string | null | undefined): void {
    this.documentos.abrir(ruta);
  }

  descargarListaAsistencia(id: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/eventos/${id}/pdf-asistencia`, { responseType: 'blob' });
  }
}
