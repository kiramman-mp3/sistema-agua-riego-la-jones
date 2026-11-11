import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurvasNivelComponent } from '../../shared/ui/curvas-nivel.component';
import { AVISO_PRIVACIDAD } from './privacidad.data';

/** Página pública con el aviso de privacidad y consentimiento sobre los datos personales de los socios. */
@Component({
  selector: 'app-privacidad',
  standalone: true,
  imports: [CurvasNivelComponent, RouterLink],
  templateUrl: './privacidad.component.html',
  styleUrls: ['./privacidad.component.scss'],
})
export class PrivacidadComponent {
  readonly aviso = AVISO_PRIVACIDAD;

  /** Lleva a la sección sin cambiar la URL: con `<base href>`, un `#ancla` suelto llevaría al inicio. */
  irA(id: string, evento: Event) {
    evento.preventDefault();
    document.getElementById(id)?.scrollIntoView();
  }
}
