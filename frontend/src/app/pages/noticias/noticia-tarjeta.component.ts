import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Noticia, NoticiasService } from '../../core/services/noticias.service';
import { FechaLocalPipe } from '../../shared/pipes/fecha-local.pipe';

/** Una noticia: imagen, etiquetas, fecha, título y descripción corta. Todo el bloque lleva al detalle. */
@Component({
  selector: 'app-noticia-tarjeta',
  standalone: true,
  imports: [RouterLink, FechaLocalPipe],
  template: `
    <article class="noticia-card">
      <a
        class="noticia-card__imagen"
        [routerLink]="['/noticias', noticia().id]"
        tabindex="-1"
        aria-hidden="true"
      >
        <img [src]="urlImagen()" alt="" loading="lazy" width="960" height="540" />
      </a>
      <div class="noticia-card__cuerpo">
        <div class="noticia-card__meta">
          <time [attr.datetime]="noticia().publicada_en">{{
            noticia().publicada_en | fechaLocal: 'corta'
          }}</time>
          @if (noticia().tags.length) {
            <ul class="noticia-card__tags" aria-label="Etiquetas">
              @for (tag of noticia().tags; track tag) {
                <li>
                  <a
                    class="noticia-tag"
                    routerLink="/noticias/todas"
                    [queryParams]="{ tag: tag }"
                    >{{ tag }}</a
                  >
                </li>
              }
            </ul>
          }
        </div>
        <h3 class="noticia-card__titulo">
          <a [routerLink]="['/noticias', noticia().id]">{{ noticia().titulo }}</a>
        </h3>
        <p class="noticia-card__resumen">{{ noticia().descripcion_corta }}</p>
      </div>
    </article>
  `,
  styleUrl: './noticia-tarjeta.scss',
})
export class NoticiaTarjetaComponent {
  private readonly servicio = inject(NoticiasService);

  readonly noticia = input.required<Noticia>();

  urlImagen(): string {
    return this.servicio.urlImagen(this.noticia().imagen_url);
  }
}
