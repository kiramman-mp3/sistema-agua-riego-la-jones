/**
 * Contador en memoria de respuestas con error del servidor (5xx) durante la última hora. Lo consulta el
 * vigilante (scripts/vigilar.js) a través de /api/health para avisar cuando los errores se disparan.
 * Se reinicia con el proceso: solo sirve para detectar picos, no como historial.
 */
const VENTANA_MS = 60 * 60 * 1000;

function crearContador({ ahora = () => Date.now(), ventanaMs = VENTANA_MS } = {}) {
  const marcas = [];

  function podar() {
    const limite = ahora() - ventanaMs;
    while (marcas.length && marcas[0] < limite) marcas.shift();
  }

  return {
    registrar(estado) {
      if (estado >= 500) marcas.push(ahora());
      podar();
    },
    total() {
      podar();
      return marcas.length;
    }
  };
}

const errores5xx = crearContador();

module.exports = { crearContador, errores5xx };
