import { Component, inject, output, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FinanzasService } from '../../../../../core/services/finanzas.service';
import { NotificationService } from '../../../../../core/services/notification.service';
import { DialogService } from '../../../../../core/services/dialog.service';
import {
  LoteSinSuperficie,
  ResultadoObligacionesAnuales,
  ResumenAnualAgua,
} from '../../../../../core/models/finanzas';
import { LoteItem, SectorItem } from '../../../../../core/models/api-payloads';
import { AdminService } from '../../../../../core/services/admin.service';
import { LoteFormComponent } from '../../usuarios-admin/lote-form/lote-form.component';
import { hoyEnEcuador } from '../../../../../core/utils/fechas';
import { MonedaPipe } from '../../../../../shared/pipes/moneda.pipe';
import { formatearDinero } from '../../../../../core/utils/dinero';
import { AYUDAS_FORMULARIO } from '../../../../../core/directives/formularios';

/**
 * Pago anual de agua: estado del año (emitidas, cobradas, pendientes) y emisión de la obligación
 * anual para los usuarios activos con lote. Antes de emitir siempre se calcula una vista previa en el servidor.
 * La cuota de cada lote es el valor por hectárea por sus hectáreas. Sin un valor escrito se usa la tarifa
 * por hectárea del concepto «Pago anual de agua» vigente al 1 de enero. Si hay lotes sin superficie el
 * servidor no emite nada y los lista, para completarles la superficie desde aquí.
 */
@Component({
  selector: 'app-facturacion-anual',
  standalone: true,
  imports: [
    DecimalPipe,
    MonedaPipe,
    FormsModule,
    RouterLink,
    LoteFormComponent,
    ...AYUDAS_FORMULARIO,
  ],
  templateUrl: './facturacion-anual.component.html',
})
export class FacturacionAnualComponent {
  private finanzas = inject(FinanzasService);
  private notify = inject(NotificationService);
  private dialog = inject(DialogService);
  private admin = inject(AdminService);

  readonly emitido = output<void>();

  readonly anioActual = Number(hoyEnEcuador().slice(0, 4));
  /** No se emiten años futuros: solo el actual y los cuatro anteriores. */
  readonly anios = Array.from({ length: 5 }, (_, i) => this.anioActual - i);

  readonly anio = signal(this.anioActual);
  /** Valor por hectárea escrito a mano; vacío usa la tarifa vigente. */
  readonly valor = signal<number | null>(null);

  readonly resumen = signal<ResumenAnualAgua | null>(null);
  readonly cargando = signal(false);
  readonly error = signal('');

  readonly vistaPrevia = signal<ResultadoObligacionesAnuales | null>(null);
  readonly calculando = signal(false);
  readonly errorVistaPrevia = signal('');
  readonly emitiendo = signal(false);

  /** Lotes que impiden emitir por no tener superficie; vacío cuando nada bloquea. */
  readonly lotesSinSuperficie = signal<LoteSinSuperficie[]>([]);
  readonly verLotesSinSuperficie = signal(false);
  /** Lote cuyo formulario de edición está abierto para completar su superficie. */
  readonly loteEnEdicion = signal<LoteItem | null>(null);
  readonly sectores = signal<SectorItem[]>([]);
  readonly abriendoLote = signal(false);

  constructor() {
    this.cargar();
  }

  /** Proporción cobrada del año (0 a 1) para la barra de progreso. */
  progreso(r: ResumenAnualAgua): number {
    return r.emitidas ? r.pagadas / r.emitidas : 0;
  }

  cambiarAnio(valor: string | number): void {
    this.anio.set(Number(valor));
    this.cargar();
  }

  cambiarValor(valor: string | number | null): void {
    const numero = valor === '' || valor === null ? null : Number(valor);
    this.valor.set(numero !== null && Number.isFinite(numero) && numero > 0 ? numero : null);
    this.calcular();
  }

  cargar(): void {
    const anio = this.anio();
    this.cargando.set(true);
    this.error.set('');
    this.finanzas.getResumenAnualAgua(anio).subscribe({
      next: (res) => {
        if (this.anio() !== anio) return;
        this.resumen.set(res.data);
        this.cargando.set(false);
      },
      error: (err) => {
        this.cargando.set(false);
        this.error.set(err.error?.message || 'No se pudo cargar el estado del pago anual.');
      },
    });
    this.calcular();
  }

  /** Vista previa: cuántas obligaciones se emitirían y por cuánto, sin escribir nada. */
  calcular(): void {
    const anio = this.anio();
    const valor = this.valor();
    this.calculando.set(true);
    this.errorVistaPrevia.set('');
    this.vistaPrevia.set(null);
    this.lotesSinSuperficie.set([]);
    this.verLotesSinSuperficie.set(false);
    this.finanzas
      .generarObligacionesAnualesAgua({ anio, valor_hectarea: valor, simular: true })
      .subscribe({
        next: (res) => {
          // Se ignora una respuesta atrasada si el usuario ya cambió el año o el valor.
          if (this.anio() !== anio || this.valor() !== valor) return;
          this.vistaPrevia.set(res.data);
          this.calculando.set(false);
        },
        error: (err) => {
          if (this.anio() !== anio || this.valor() !== valor) return;
          this.calculando.set(false);
          this.lotesSinSuperficie.set(err.error?.lotes_sin_superficie ?? []);
          this.errorVistaPrevia.set(
            err.error?.message || 'No se pudo calcular el pago anual de este año.',
          );
        },
      });
  }

  async emitir(): Promise<void> {
    const previa = this.vistaPrevia();
    if (!previa || !previa.generadas || this.emitiendo()) return;
    const confirmado = await this.dialog.confirmar({
      titulo: `Emitir el pago anual de agua ${previa.anio}`,
      mensaje: `Se emitirán ${previa.generadas} obligaciones por ${previa.hectareas} ha a ${formatearDinero(previa.valorHectarea)} por hectárea (total ${formatearDinero(previa.total)}). Vencen el 31 de diciembre de ${previa.anio}.`,
      textoConfirmar: `Emitir ${previa.generadas} obligaciones`,
      tipo: 'WARNING',
    });
    if (!confirmado) return;
    this.emitiendo.set(true);
    this.finanzas
      .generarObligacionesAnualesAgua({ anio: previa.anio, valor_hectarea: this.valor() })
      .subscribe({
        next: (res) => {
          this.emitiendo.set(false);
          this.notify.success(res.message || 'Obligaciones emitidas.');
          this.cargar();
          this.emitido.emit();
        },
        error: (err) => {
          this.emitiendo.set(false);
          this.lotesSinSuperficie.set(err.error?.lotes_sin_superficie ?? []);
          this.notify.error(err.error?.message || 'No se pudieron emitir las obligaciones.');
        },
      });
  }

  /** Abre el formulario del lote para completarle la superficie. */
  completarSuperficie(lote: LoteSinSuperficie): void {
    if (this.abriendoLote()) return;
    this.abriendoLote.set(true);
    this.admin.getSectores().subscribe({
      next: (sectores) => this.sectores.set(sectores.data ?? []),
    });
    this.admin.getLotes(undefined, lote.codigo).subscribe({
      next: (res) => {
        this.abriendoLote.set(false);
        const completo = (res.data ?? []).find((l) => l.id === lote.id);
        if (completo) this.loteEnEdicion.set(completo);
        else this.notify.error('No se encontró el lote.');
      },
      error: (err) => {
        this.abriendoLote.set(false);
        this.notify.error(err.error?.message || 'No se pudo abrir el lote.');
      },
    });
  }

  cerrarLote(): void {
    this.loteEnEdicion.set(null);
  }

  /** Con la superficie corregida se vuelve a calcular la vista previa y el estado del año. */
  loteActualizado(): void {
    this.loteEnEdicion.set(null);
    this.cargar();
  }
}
