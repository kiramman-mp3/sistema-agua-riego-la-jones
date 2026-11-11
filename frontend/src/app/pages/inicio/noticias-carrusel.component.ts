import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Noticia, NoticiasService } from '../../core/services/noticias.service';
import { FechaLocalPipe } from '../../shared/pipes/fecha-local.pipe';

/** Cuántas noticias recientes rota el carrusel de la portada. */
export const NOTICIAS_EN_CARRUSEL = 5;

/** Segundos que se muestra cada noticia antes de pasar a la siguiente. */
const SEGUNDOS_POR_NOTICIA = 6;

/**
 * Carrusel de las últimas noticias de la portada. Avanza solo, salvo que la persona lo pause, pase
 * el puntero o el foco por encima, o prefiera menos movimiento. Si no hay noticias no ocupa lugar.
 */
@Component({
  selector: 'app-noticias-carrusel',
  standalone: true,
  imports: [RouterLink, FechaLocalPipe],
  template: `
    @if (noticias().length) {
      <section
        class="carrusel"
        aria-roledescription="carrusel"
        aria-label="Últimas noticias"
        (mouseenter)="sobre.set(true)"
        (mouseleave)="sobre.set(false)"
        (focusin)="sobre.set(true)"
        (focusout)="sobre.set(false)"
      >
        <div class="carrusel__ventana" [attr.aria-live]="rotando() ? 'off' : 'polite'">
          <div class="carrusel__pista" [style.transform]="'translateX(-' + indice() * 100 + '%)'">
            @for (noticia of noticias(); track noticia.id; let i = $index) {
              <article
                class="carrusel__noticia"
                role="group"
                aria-roledescription="diapositiva"
                [attr.aria-label]="i + 1 + ' de ' + noticias().length"
                [attr.inert]="i === indice() ? null : ''"
              >
                <div class="carrusel__imagen" [style.--imagen]="fondo(noticia)">
                  <img
                    [src]="urlImagen(noticia)"
                    alt=""
                    width="960"
                    height="540"
                    [attr.loading]="i === 0 ? null : 'lazy'"
                  />
                </div>
                <div class="carrusel__cuerpo">
                  <div class="carrusel__meta">
                    <time [attr.datetime]="noticia.publicada_en">{{
                      noticia.publicada_en | fechaLocal: 'larga'
                    }}</time>
                    @for (tag of noticia.tags.slice(0, 2); track tag) {
                      <span class="carrusel__tag">{{ tag }}</span>
                    }
                  </div>
                  <h2 class="carrusel__titulo">
                    <a [routerLink]="['/noticias', noticia.id]">{{ noticia.titulo }}</a>
                  </h2>
                  <p class="carrusel__resumen">{{ noticia.descripcion_corta }}</p>
                  <span class="carrusel__leer" aria-hidden="true">
                    Leer la noticia <i class="ri-arrow-right-line"></i>
                  </span>
                </div>
              </article>
            }
          </div>
        </div>

        <div class="carrusel__barra">
          @if (noticias().length > 1) {
            <div class="carrusel__controles">
              <button
                type="button"
                class="carrusel__boton"
                (click)="mover(-1)"
                aria-label="Noticia anterior"
              >
                <i class="ri-arrow-left-s-line" aria-hidden="true"></i>
              </button>
              <button
                type="button"
                class="carrusel__boton"
                (click)="alternarPausa()"
                [attr.aria-label]="
                  pausado() ? 'Reanudar el cambio automático' : 'Pausar el cambio automático'
                "
              >
                <i [class]="pausado() ? 'ri-play-fill' : 'ri-pause-fill'" aria-hidden="true"></i>
              </button>
              <button
                type="button"
                class="carrusel__boton"
                (click)="mover(1)"
                aria-label="Noticia siguiente"
              >
                <i class="ri-arrow-right-s-line" aria-hidden="true"></i>
              </button>
              <ul class="carrusel__puntos" aria-label="Elegir noticia">
                @for (noticia of noticias(); track noticia.id; let i = $index) {
                  <li>
                    <button
                      type="button"
                      class="carrusel__punto"
                      [class.carrusel__punto--activo]="i === indice()"
                      (click)="ir(i)"
                      [attr.aria-label]="'Ver la noticia ' + (i + 1)"
                      [attr.aria-current]="i === indice() ? 'true' : null"
                    ></button>
                  </li>
                }
              </ul>
            </div>
          }
          <a class="carrusel__todas" routerLink="/noticias/todas">
            Ver todas las noticias <i class="ri-arrow-right-line" aria-hidden="true"></i>
          </a>
        </div>
      </section>
    }
  `,
  styleUrl: './noticias-carrusel.component.scss',
})
export class NoticiasCarruselComponent implements OnInit {
  private readonly servicio = inject(NoticiasService);
  private readonly destruir = inject(DestroyRef);

  readonly noticias = signal<Noticia[]>([]);
  readonly indice = signal(0);
  /** Pausa elegida con el botón. */
  readonly pausado = signal(
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  /** El puntero o el foco están dentro del carrusel. */
  readonly sobre = signal(false);

  readonly rotando = computed(() => this.noticias().length > 1 && !this.pausado() && !this.sobre());

  constructor() {
    // Mientras rota, un temporizador por noticia; cualquier cambio de índice lo reinicia.
    effect((limpiar) => {
      if (!this.rotando()) return;
      this.indice();
      const temporizador = setTimeout(
        () => untracked(() => this.mover(1)),
        SEGUNDOS_POR_NOTICIA * 1000,
      );
      limpiar(() => clearTimeout(temporizador));
    });
  }

  ngOnInit(): void {
    this.servicio
      .listar({ limite: NOTICIAS_EN_CARRUSEL })
      .pipe(takeUntilDestroyed(this.destruir))
      .subscribe({
        next: (pagina) => this.noticias.set(pagina.data),
        // Sin noticias o sin conexión la portada sigue completa; el carrusel simplemente no aparece.
        error: () => this.noticias.set([]),
      });
  }

  mover(paso: number): void {
    const total = this.noticias().length;
    if (total) this.indice.update((actual) => (actual + paso + total) % total);
  }

  ir(i: number): void {
    this.indice.set(i);
  }

  alternarPausa(): void {
    this.pausado.update((p) => !p);
  }

  urlImagen(noticia: Noticia): string {
    return this.servicio.urlImagen(noticia.imagen_url);
  }

  /** La misma imagen, desenfocada, rellena los lados que la imagen entera deja libres. */
  fondo(noticia: Noticia): string {
    return `url("${this.urlImagen(noticia)}")`;
  }
}
