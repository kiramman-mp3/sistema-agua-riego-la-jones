const { registrarAuditoria } = require('../services/auditService');
const eventos = require('../services/eventosService');
const { withTransaction } = require('../shared/transaction');
const { cambioEstadoSchema } = require('../schemas/eventos');

/**
 * Endpoints específicos de mingas. Comparten las reglas de asambleas (eventosService)
 * pero rechazan eventos de otro tipo.
 */
async function enMinga(req, operacion, auditoria = null) {
  return withTransaction(async (conexion) => {
    const minga = await eventos.obtenerEvento(conexion, req.params.id, { tipo: 'MINGA' });
    const resultado = await operacion(conexion, minga);
    // La auditoría de lo que cambia la minga (estado, asistencias, multas) va en la misma transacción.
    const datos = auditoria && auditoria(resultado);
    if (datos) {
      await registrarAuditoria({ conexion, cuentaId: req.user.cuentaId, ip: req.ip, entidadId: Number(req.params.id), ...datos });
    }
    return resultado;
  });
}

async function getAsistencias(req, res) {
  const { personas, resumen, estado } = await enMinga(req, async (conexion, minga) => ({
    ...(await eventos.obtenerPadron(conexion, minga)),
    estado: minga.estado
  }));
  return res.json({ status: 'OK', data: personas, resumen, estado });
}

async function cambiarEstado(req, res) {
  const { estado } = cambioEstadoSchema.parse(req.body);
  const resultado = await enMinga(req, (conexion, minga) => eventos.cambiarEstado(conexion, minga, estado), (r) => r.cambiado && {
    accion: 'MODIFICAR', entidad: 'eventos', detalle: { estadoAnterior: r.estadoAnterior, estado }
  });
  return res.json({ status: 'OK', message: resultado.cambiado ? 'Estado de la minga actualizado.' : 'La minga ya tiene ese estado.', estado });
}

async function finalizar(req, res) {
  const resultado = await enMinga(req, (conexion, minga) => eventos.finalizar(conexion, minga), (r) => !r.yaFinalizada && {
    accion: 'MODIFICAR', entidad: 'eventos', detalle: { finalizarMinga: true, multasGeneradas: r.multasGeneradas }
  });
  return res.json({
    status: 'OK',
    message: resultado.yaFinalizada
      ? 'La minga ya fue finalizada. No se generaron nuevas multas.'
      : `Minga finalizada. Multas registradas: ${resultado.multasGeneradas}.`,
    estado: 'REALIZADO',
    multasGeneradas: resultado.multasGeneradas,
    yaFinalizada: resultado.yaFinalizada
  });
}

const eventoController = require('./eventoController');

async function registrarAsistencias(req, res) {
  const { registradas } = await enMinga(
    req,
    (conexion, minga) => eventos.registrarAsistencias(conexion, minga, req.body?.asistencias, req.user.cuentaId),
    (r) => ({ accion: 'MODIFICAR', entidad: 'asistencias', detalle: { asistenciasMinga: r.registradas } })
  );
  return res.json({ status: 'OK', message: 'Asistencias de la minga guardadas.', registradas });
}

async function subirJustificante(req, res) {
  return eventoController.subirJustificante(req, res);
}

async function descargarJustificante(req, res) {
  return eventoController.descargarJustificante(req, res);
}

async function eliminarJustificante(req, res) {
  return eventoController.eliminarJustificante(req, res);
}

module.exports = {
  cambiarEstado,
  finalizar,
  registrarAsistencias,
  getAsistencias,
  subirJustificante,
  descargarJustificante,
  eliminarJustificante
};

