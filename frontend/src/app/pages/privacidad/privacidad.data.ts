/** Texto del aviso de privacidad y consentimiento. Revisar con el asesor legal de la Junta antes de cambiarlo. */
export interface SeccionAviso {
  id: string;
  titulo: string;
  parrafos?: string[];
  lista?: string[];
  /** Enlace al final de la sección, hacia un apartado del inicio. */
  enlace?: { texto: string; fragmento: string };
}

export const AVISO_PRIVACIDAD = {
  titulo: 'Aviso de privacidad y consentimiento',
  responsable: 'Junta de Agua y Riego La Jones',
  actualizado: 'Noviembre de 2026',
  resumen:
    'La Junta guarda los datos de sus socios para administrar el agua de riego: cobros, multas, turnos y asambleas. Aquí le explicamos cuáles son, para qué se usan y cómo puede ejercer sus derechos.',
  secciones: [
    {
      id: 'responsable',
      titulo: 'Quién es el responsable',
      parrafos: [
        'El responsable del tratamiento de sus datos es la Junta de Agua y Riego La Jones, del cantón Patate, provincia de Tungurahua, Ecuador.',
      ],
      enlace: { texto: 'Dónde está la sede y cómo contactarnos', fragmento: 'contacto' },
    },
    {
      id: 'datos',
      titulo: 'Qué datos guardamos',
      lista: [
        'Identificación y contacto: cédula, nombres y apellidos, dirección, teléfono o celular, correo electrónico y fecha de nacimiento, cuando usted los entrega.',
        'Datos de riego: los lotes y el sector que le corresponden y los turnos de agua asignados.',
        'Datos económicos: cuotas, pagos, multas y su estado.',
        'Participación: su asistencia a asambleas y mingas.',
        'Seguridad: un registro de las acciones hechas en el sistema, con la fecha y la dirección IP desde la que se hicieron.',
      ],
    },
    {
      id: 'finalidad',
      titulo: 'Para qué los usamos',
      lista: [
        'Cobrar las cuotas de agua y llevar el estado de cuenta de cada socio.',
        'Aplicar y registrar multas por inasistencia u otras faltas previstas en las normas de la Junta.',
        'Organizar los turnos de riego por sector.',
        'Convocar a asambleas y mingas, llevar la asistencia y redactar las actas.',
        'Proteger el sistema y poder revisar quién hizo cada cambio.',
      ],
      parrafos: ['No usamos sus datos para publicidad ni los vendemos.'],
    },
    {
      id: 'base',
      titulo: 'Por qué podemos tratarlos',
      parrafos: [
        'Tratamos sus datos con su consentimiento y porque son necesarios para la relación entre usted y la Junta como usuario del agua de riego. Al ingresar al sistema usted declara que leyó este aviso.',
        'Si no está de acuerdo con el tratamiento de algún dato, puede decírselo a la directiva. Retirar el consentimiento puede impedir que la Junta le preste algunos servicios, como cobrarle por el sistema o avisarle de los turnos.',
      ],
    },
    {
      id: 'comparticion',
      titulo: 'Con quién los compartimos',
      parrafos: [
        'Solo la directiva y las personas que ella autorice ven el padrón completo. Cada socio, al iniciar sesión, ve únicamente sus propios lotes, multas y pagos.',
        'Las convocatorias se publican en la página y en el grupo de WhatsApp de la Junta. Las actas y resoluciones las ven los usuarios con sesión iniciada.',
        'No entregamos sus datos a terceros, salvo que una autoridad competente lo exija por ley.',
      ],
    },
    {
      id: 'seguridad',
      titulo: 'Cómo los protegemos',
      lista: [
        'Las contraseñas se guardan cifradas: nadie, ni la directiva, puede leerlas.',
        'El acceso depende del rol de cada persona y se bloquea tras varios intentos fallidos.',
        'Las acciones importantes quedan registradas en una auditoría.',
        'Se hacen copias de respaldo de la información.',
      ],
    },
    {
      id: 'conservacion',
      titulo: 'Cuánto tiempo los conservamos',
      parrafos: [
        'Conservamos sus datos mientras usted sea usuario del agua de la Junta y durante el tiempo necesario para cumplir obligaciones contables, de actas y de control interno.',
      ],
    },
    {
      id: 'derechos',
      titulo: 'Sus derechos',
      parrafos: [
        'De acuerdo con la Ley Orgánica de Protección de Datos Personales del Ecuador, usted puede:',
      ],
      lista: [
        'Acceder a los datos que la Junta tiene sobre usted.',
        'Pedir que corrijan o actualicen los datos incorrectos o incompletos.',
        'Pedir que eliminen sus datos cuando ya no sean necesarios.',
        'Oponerse al tratamiento o pedir que se suspenda.',
        'Retirar su consentimiento en cualquier momento.',
      ],
    },
    {
      id: 'ejercer',
      titulo: 'Cómo ejercer sus derechos',
      parrafos: [
        'Acérquese a la secretaría de la Junta y presente su solicitud. Si cree que sus derechos no fueron atendidos, puede acudir a la Superintendencia de Protección de Datos Personales.',
      ],
      enlace: { texto: 'Dirección de la sede y horario de atención', fragmento: 'contacto' },
    },
    {
      id: 'cambios',
      titulo: 'Cambios en este aviso',
      parrafos: [
        'Si este aviso cambia, publicaremos la versión nueva en esta página con su fecha de actualización.',
      ],
    },
  ] as SeccionAviso[],
};
