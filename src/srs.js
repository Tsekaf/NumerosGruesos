/*
 * srs.js - Repeticion espaciada
 * =============================
 *
 * El problema que resuelve: repasar una ficha entera hace que vuelvas a ver las
 * preguntas que ya sabias, que es tiempo perdido, y que no vuelvas a ver las
 * que te fallaron hasta que se te ocurra abrir esa ficha otra vez. Lo que se
 * olvida se olvida en silencio.
 *
 * La idea: cada pregunta tiene su propio calendario. Si la acertas, tarda mas
 * en volver; si la fallas, vuelve enseguida. Asi el repaso se concentra solo
 * en lo que esta por borrarse.
 *
 * Usamos una escalera fija de intervalos (sistema Leitner) y no el algoritmo
 * SM-2 con factores de facilidad. Para 125 preguntas la diferencia practica es
 * minima y la escalera se puede explicar en una linea, que para un proyecto
 * personal vale mas que el ultimo 5% de eficiencia.
 */

/*
 * Dias hasta el proximo repaso segun cuantas veces seguidas la acertaste.
 * El 0 significa "de nuevo en esta misma sesion": una pregunta recien fallada
 * vuelve antes de que te vayas.
 */
const ESCALERA = [0, 1, 3, 7, 16, 35, 75, 160];

/*
 * Tope de preguntas por sesion. Existe para el caso que motivo todo esto:
 * volver despues de meses sin abrir la app. Sin tope te encontrarias con las
 * 125 preguntas vencidas de golpe, que es la forma mas rapida de no hacer
 * ninguna. Con tope hacer un rato por dia y en pocos dias estas al dia.
 */
const TOPE_SESION = 20;

const DIA_MS = 24 * 60 * 60 * 1000;

/*
 * La clave de una pregunta es un hash de su texto, no su posicion en la ficha.
 * Si fuera la posicion, agregar una pregunta en el medio correria todas las
 * demas y el progreso quedaria asignado a la pregunta equivocada. Con el texto,
 * reordenar no rompe nada y editar una pregunta la trata como nueva, que es
 * exactamente lo que corresponde.
 */
function claveDe(fichaId, textoPregunta) {
  const s = fichaId + '|' + textoPregunta;
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;   // djb2
  }
  return fichaId + '#' + (h >>> 0).toString(36);
}

/** Estado inicial de una pregunta que nunca se vio. */
function nueva() {
  return { paso: 0, proximo: 0 };
}

/**
 * Devuelve el nuevo estado de una pregunta despues de contestarla.
 * Acertar sube un escalon; fallar vuelve al principio.
 */
function programar(estadoPregunta, acerto, ahora) {
  const actual = estadoPregunta || nueva();
  const paso = acerto
    ? Math.min(actual.paso + 1, ESCALERA.length - 1)
    : 0;
  return { paso: paso, proximo: (ahora || Date.now()) + ESCALERA[paso] * DIA_MS };
}

/** Todas las preguntas de todas las fichas, con su clave. */
function todasLasPreguntas(fichas) {
  const out = [];
  (fichas || []).forEach((f) => {
    (f.preguntas || []).forEach((q) => {
      out.push({ ficha: f, p: q.p, r: q.r, tipo: q.tipo, clave: claveDe(f.id, q.p) });
    });
  });
  return out;
}

/**
 * Las preguntas que toca repasar hoy, mezcladas y con tope.
 *
 * Las nunca vistas cuentan como vencidas (proximo = 0), y van despues de las
 * que ya estan en circulacion: primero sostener lo que sabias, despues sumar.
 */
function vencidas(fichas, srs, ahora) {
  const t = ahora || Date.now();
  const todas = todasLasPreguntas(fichas);

  const enCurso = [];
  const sinVer = [];
  todas.forEach((q) => {
    const e = srs[q.clave];
    if (!e) { sinVer.push(q); return; }
    if (e.proximo <= t) enCurso.push(q);
  });

  mezclar(enCurso);
  mezclar(sinVer);
  return enCurso.concat(sinVer).slice(0, TOPE_SESION);
}

/** Numeros para mostrar en la portada, sin armar la cola entera. */
function resumen(fichas, srs, ahora) {
  const t = ahora || Date.now();
  const todas = todasLasPreguntas(fichas);
  let paraHoy = 0, sinVer = 0, aprendidas = 0;

  todas.forEach((q) => {
    const e = srs[q.clave];
    if (!e) { sinVer++; return; }
    if (e.proximo <= t) paraHoy++;
    // "Aprendida" = ya paso varios repasos exitosos y no vuelve por un tiempo.
    if (e.paso >= 4) aprendidas++;
  });

  const pendientes = Math.min(paraHoy + sinVer, TOPE_SESION);
  return {
    total: todas.length,
    paraHoy: paraHoy,
    sinVer: sinVer,
    aprendidas: aprendidas,
    pendientes: pendientes,
    hayTope: (paraHoy + sinVer) > TOPE_SESION,
  };
}

/** Cuando vuelve a haber algo para repasar, si hoy no hay nada. */
function proximaFecha(fichas, srs) {
  const todas = todasLasPreguntas(fichas);
  let min = null;
  todas.forEach((q) => {
    const e = srs[q.clave];
    if (!e) return;
    if (min === null || e.proximo < min) min = e.proximo;
  });
  return min;
}

function mezclar(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

window.SRS = {
  ESCALERA, TOPE_SESION, DIA_MS,
  claveDe, nueva, programar, todasLasPreguntas, vencidas, resumen,
  proximaFecha, mezclar,
};
