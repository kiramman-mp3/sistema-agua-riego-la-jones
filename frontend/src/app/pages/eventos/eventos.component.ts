import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ConsultaService, EventoPublico } from '../../core/services/consulta.service';
import { SubtipoAsamblea, subtipoAsamblea } from '../../core/utils/eventos';
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

/** Lo que la persona eligió para consultar los eventos de un tipo. */
interface Filtro {
  subtipo: SubtipoAsamblea | null;
  sectorId: number | null;
}

const filtroVacio = (): Filtro => ({ subtipo: null, sectorId: null });

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
  filtros: Record<TipoEvento, Filtro> = { ASAMBLEA: filtroVacio(), MINGA: filtroVacio() };
  sectores: { id: number; nombre: string }[] = [];
  readonly subtipos: { valor: SubtipoAsamblea | null; etiqueta: string }[] = [
    { valor: null, etiqueta: 'Todas' },
    { valor: 'ORDINARIA', etiqueta: 'Ordinarias' },
    { valor: 'EXTRAORDINARIA', etiqueta: 'Extraordinarias' },
  ];

  private readonly consultaService = inject(ConsultaService);
  private readonly actasService = inject(ActasService);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly auth = inject(AuthService);

  /** Los próximos eventos de la pestaña activa que cumplen el filtro elegido. */
  get lista(): EventoPublico[] {
    const todos = this.tabActivo === 'MINGA' ? this.mingasFuturas : this.asambleasFuturas;
    const { subtipo, sectorId } = this.filtroActivo;
    return todos.filter(
      (ev) =>
        (!subtipo || subtipoAsamblea(ev) === subtipo) &&
        // Un evento sin sector se convoca a todos, así que también le toca a quien filtra por uno.
        (!sectorId || ev.sector_id === null || ev.sector_id === sectorId),
    );
  }

  get filtroActivo(): Filtro {
    return this.filtros[this.tabActivo];
  }

  get hayFiltro(): boolean {
    const { subtipo, sectorId } = this.filtroActivo;
    return !!subtipo || !!sectorId;
  }

  /** Los eventos ya realizados de la pestaña activa. */
  get pasadosActivos(): Pasados {
    return this.pasados[this.tabActivo];
  }

  fecha(ev: EventoPublico): { dia: string; mes: string; anio: string } {
    return partesFecha(ev.fecha);
  }

  ngOnInit() {
    // Sin la lista de sectores el filtro por sector simplemente no se ofrece.
    this.consultaService.getSectores().subscribe({
      next: (res) => {
        this.sectores = (res.data ?? []).map((s) => ({ id: s.id, nombre: s.nombre }));
        this.cdr.detectChanges();
      },
      error: () => undefined,
    });
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
    this.consultaService.getEventosPasados(tipo, estado.pagina + 1, this.filtros[tipo]).subscribe({
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

  elegirSubtipo(subtipo: SubtipoAsamblea | null) {
    this.filtroActivo.subtipo = subtipo;
    this.filtroCambio();
  }

  elegirSector(valor: string) {
    this.filtroActivo.sectorId = valor ? Number(valor) : null;
    this.filtroCambio();
  }

  limpiarFiltro() {
    this.filtros[this.tabActivo] = filtroVacio();
    this.filtroCambio();
  }

  /** Los próximos se filtran aquí; los pasados vienen paginados, así que se piden de nuevo ya filtrados. */
  private filtroCambio() {
    const estado = this.pasadosActivos;
    this.pasados[this.tabActivo] = { ...pasadosVacios(), visible: estado.visible };
    if (estado.visible) this.cargarPasados();
    this.cdr.detectChanges();
  }

  /** Nombre corto del subtipo, para mostrarlo en cada asamblea. */
  etiquetaSubtipo(ev: EventoPublico): string {
    const subtipo = subtipoAsamblea(ev);
    return subtipo === 'EXTRAORDINARIA'
      ? 'Extraordinaria'
      : subtipo === 'ORDINARIA'
        ? 'Ordinaria'
        : '';
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
