import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { LoteItem, TurnoItem } from '../../core/models/api-payloads';
import { AuthService } from '../../core/services/auth.service';
import { ConsultaService } from '../../core/services/consulta.service';
import { textoSuperficie } from '../../core/utils/superficie';
import { FechaLocalPipe } from '../../shared/pipes/fecha-local.pipe';
import { CurvasNivelComponent } from '../../shared/ui/curvas-nivel.component';
import { LotesMapComponent } from '../admin/components/lotes-map/lotes-map.component';
import { nombreDia } from '../admin/components/turnos-admin/turno.model';

export interface TurnoDeLote {
  id: number;
  dia: string;
  horario: string;
  vigenciaDesde?: string;
  vigenciaHasta?: string;
  observacion?: string;
}

export interface LoteConTurnos {
  lote: LoteItem;
  latitud: number | null;
  longitud: number | null;
  turnos: TurnoDeLote[];
}

/** Coordenada válida o null: la API la entrega como texto y puede venir vacía. */
function coordenada(valor: number | string | null | undefined): number | null {
  const n = parseFloat(String(valor ?? ''));
  return Number.isNaN(n) ? null : n;
}

/** Une cada lote con sus turnos de riego, ordenados por día y hora. */
export function lotesConTurnos(lotes: LoteItem[], turnos: TurnoItem[]): LoteConTurnos[] {
  return lotes.map((lote) => ({
    lote,
    latitud: coordenada(lote.latitud_aproximada),
    longitud: coordenada(lote.longitud_aproximada),
    turnos: turnos
      .filter((t) => t.lote_id === lote.id)
      .sort(
        (a, b) =>
          Number(a.dia_semana) - Number(b.dia_semana) || a.hora_inicio.localeCompare(b.hora_inicio),
      )
      .map((t) => ({
        id: t.id,
        dia: nombreDia(t.dia_semana),
        horario: `${t.hora_inicio.substring(0, 5)} – ${t.hora_fin.substring(0, 5)}`,
        vigenciaDesde: t.vigencia_desde,
        vigenciaHasta: t.vigencia_hasta,
        observacion: t.observacion,
      })),
  }));
}

/** Todos los lotes de la persona con su ubicación y los turnos de riego asignados a cada uno. */
@Component({
  selector: 'app-mis-lotes',
  standalone: true,
  imports: [RouterLink, FechaLocalPipe, CurvasNivelComponent, LotesMapComponent],
  templateUrl: './mis-lotes.component.html',
  styleUrls: ['./mis-lotes.component.scss'],
})
export class MisLotesComponent implements OnInit {
  readonly textoSuperficie = textoSuperficie;
  cargando = true;
  errorMensaje = '';
  lotes: LoteConTurnos[] = [];

  private consulta = inject(ConsultaService);
  private auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.cargar();
  }

  get totalTurnos(): number {
    return this.lotes.reduce((suma, l) => suma + l.turnos.length, 0);
  }

  cargar(): void {
    const user = this.auth.getUser();
    if (!user) return;
    this.cargando = true;
    this.errorMensaje = '';
    forkJoin({
      lotes: this.consulta.getMisLotes(user.personaId),
      turnos: this.consulta.getMisTurnos(user.personaId),
    }).subscribe({
      next: ({ lotes, turnos }) => {
        this.lotes = lotesConTurnos(lotes.data ?? [], turnos.data ?? []);
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.errorMensaje = 'No se pudieron cargar sus lotes. Intente más tarde.';
        this.cargando = false;
        this.cdr.detectChanges();
      },
    });
  }

  urlGoogleMaps(l: LoteConTurnos): string {
    return `https://www.google.com/maps?q=${l.latitud},${l.longitud}&t=k`;
  }
}
