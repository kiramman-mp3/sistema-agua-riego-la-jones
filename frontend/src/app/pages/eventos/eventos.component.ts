import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ConsultaService, EventoPublico } from '../../core/services/consulta.service';
import { AuthService } from '../../core/services/auth.service';
import { ActasService } from '../../core/services/actas.service';
import { hoyEnEcuador, partesFecha } from '../../core/utils/fechas';
import { CurvasNivelComponent } from '../../shared/ui/curvas-nivel.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { FechaLocalPipe } from '../../shared/pipes/fecha-local.pipe';

type TipoEvento = EventoPublico['tipo'];

/** Los eventos ya realizados de un tipo: se piden al abrirlos y se agregan de a diez. */
interface Pasados {
  visible: boolean;
  cargando: boolean;
  error: boolean;
  items: EventoPublico[];
  total: number;
  pagina: number;
}

const pasadosVacios = (): Pasados => ({
  visible: false,
  cargando: false,
  error: false,
  items: [],
  total: 0,
  pagina: 0,
});

@Component({
  selector: 'app-eventos',
  standalone: true,
  imports: [CommonModule, RouterLink, FechaLocalPipe, CurvasNivelComponent, EmptyStateComponent],
  templateUrl: './eventos.component.html',
  styleUrls: ['./eventos.component.scss'],
})
export class EventosComponent implements OnInit {
  asambleasFuturas: EventoPublico[] = [];
  mingasFuturas: EventoPublico[] = [];
  tabActivo: TipoEvento = 'ASAMBLEA';
  cargandoActa = false;
  pasados: Record<TipoEvento, Pasados> = { ASAMBLEA: pasadosVacios(), MINGA: pasadosVacios() };

  private readonly consultaService = inject(ConsultaService);
  private readonly actasService = inject(ActasService);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly auth = inject(AuthService);

  /** Los eventos de la pestaña activa. */
  get lista(): EventoPublico[] {
    return this.tabActivo === 'MINGA' ? this.mingasFuturas : this.asambleasFuturas;
  }

  /** Los eventos ya realizados de la pestaña activa. */
  get pasadosActivos(): Pasados {
    return this.pasados[this.tabActivo];
  }

  fecha(ev: EventoPublico): { dia: string; mes: string; anio: string } {
    return partesFecha(ev.fecha);
  }

  ngOnInit() {
    this.consultaService.getEventosPublicos().subscribe({
      next: (res) => {
        if (res.status === 'OK') {
          const hoy = hoyEnEcuador();

          const eventos = res.data ?? [];
          eventos.forEach((ev) => {
            // Solo mostrar próximos eventos. Las fechas AAAA-MM-DD se comparan como texto, sin zona horaria.
            if (String(ev.fecha).slice(0, 10) >= hoy && ev.estado !== 'CANCELADO') {
              if (ev.tipo === 'MINGA') {
                this.mingasFuturas.push(ev);
              } else {
                this.asambleasFuturas.push(ev);
              }
            }
          });
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        console.error('Error al cargar eventos', err);
        this.cdr.detectChanges();
      },
    });
  }

  /** Muestra u oculta los eventos pasados; la primera vez que se abren se piden al servidor. */
  alternarPasados() {
    const estado = this.pasadosActivos;
    estado.visible = !estado.visible;
    if (estado.visible && !estado.pagina) this.cargarPasados();
  }

  /** Trae la siguiente página de eventos pasados de la pestaña activa. */
  cargarPasados() {
    const tipo = this.tabActivo;
    const estado = this.pasados[tipo];
    if (estado.cargando) return;
    estado.cargando = true;
    estado.error = false;
    this.consultaService.getEventosPasados(tipo, estado.pagina + 1).subscribe({
      next: (res) => {
        estado.items = [...estado.items, ...res.data];
        estado.total = res.total;
        estado.pagina = res.pagina;
        estado.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        estado.cargando = false;
        estado.error = true;
        this.cdr.detectChanges();
      },
    });
  }

  verActa(ev: EventoPublico) {
    this.consultaService.abrirDocumento(ev.acta_firmada_url);
  }

  setTab(tab: TipoEvento) {
    this.tabActivo = tab;
  }

  descargarConvocatoria(ev: EventoPublico) {
    if (ev.convocatoria_firmada_url) {
      this.consultaService.abrirDocumento(ev.convocatoria_firmada_url);
    } else {
      this.actasService.generarConvocatoriaPDF(ev);
    }
  }
}
