/*
 * calculo.js - Motor de calculo de Numeros Gruesos
 * ================================================
 *
 * Este archivo es la UNICA implementacion de la matematica del juego. Lo usan
 * dos consumidores distintos:
 *
 *   - src/app.js       -> para mostrarle el desglose al jugador.
 *   - tools/validar.html -> para recalcular cada escenario y detectar errores.
 *
 * Que este solo una vez es el punto: si el validador usara su propia copia de
 * la matematica, podria darle el visto bueno a un escenario que el juego
 * resuelve distinto.
 *
 * Idea central: un escenario no guarda el resultado escrito a mano, guarda la
 * EXPRESION que lo produce. El texto que ve el jugador ("34 x 0.1 x 260 =
 * 884.4 USD/ha") se GENERA desde esa expresion. Asi la prosa no puede
 * contradecir a los numeros.
 */

/** Categorias validas. El schema y la pantalla de progreso leen de aca. */
const CATEGORIAS = {
  margen_bruto:        'Margen bruto',
  punto_equilibrio:    'Punto de equilibrio',
  costo_unitario:      'Costo por ha / unidad',
  roi_payback:         'ROI y payback',
  comprar_vs_alquilar: 'Comprar vs. alquilar',
  conversion_unidades: 'Conversion de unidades',
};

/** Etiquetas por defecto de los tres botones de veredicto. */
const ETIQUETAS_DEFAULT = ['Buen negocio', 'Ajustado', 'Mal negocio'];

/** Los tres veredictos posibles, en el orden en que se muestran. */
const VEREDICTOS = ['bueno', 'ajustado', 'malo'];

/*
 * Solo permitimos aritmetica y nombres de variables. Nada de llamadas a
 * funciones, strings, corchetes ni punto-y-coma: si una expresion trae algo
 * fuera de este alfabeto, la rechazamos antes de evaluarla.
 */
const EXPR_PERMITIDA = /^[0-9a-zA-Z_+\-*/(). ]+$/;

/** Nombres de variable dentro de una expresion (excluye los numeros). */
function variablesDe(expr) {
  const encontradas = String(expr).match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
  return [...new Set(encontradas)];
}

/**
 * Evalua `expr` con las variables de `scope`.
 *
 * No usamos `with` ni eval sobre el scope global: armamos una funcion cuyos
 * parametros son exactamente las claves del scope, asi la expresion no puede
 * ver nada mas.
 */
function evaluarExpr(expr, scope) {
  if (typeof expr !== 'string' || expr.trim() === '') {
    throw new Error('expresion vacia');
  }
  if (!EXPR_PERMITIDA.test(expr)) {
    throw new Error(`la expresion tiene caracteres no permitidos: "${expr}"`);
  }
  const faltantes = variablesDe(expr).filter((v) => !(v in scope));
  if (faltantes.length) {
    throw new Error(`variable(s) inexistente(s): ${faltantes.join(', ')}`);
  }

  const claves = Object.keys(scope);
  const fn = new Function(...claves, `return (${expr});`);
  const valor = fn(...claves.map((k) => scope[k]));

  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    throw new Error(`"${expr}" no dio un numero finito (dio ${valor})`);
  }
  return valor;
}

/** Redondeo a N decimales, devolviendo numero (no string). */
function redondear(n, decimales = 1) {
  const f = Math.pow(10, decimales);
  return Math.round(n * f) / f;
}

/** Formato con separador de miles en castellano: 27.864 / 884,4 */
function formatear(n, decimales = 1) {
  return redondear(n, decimales).toLocaleString('es-AR', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

/**
 * Reescribe la expresion sustituyendo cada nombre de variable por su valor y
 * cada literal por su version formateada, para que el jugador vea la cuenta
 * hecha y no las incognitas:
 *   "rinde_qq_ha * 0.1 * precio_usd_tn"  ->  "34 x 0,1 x 260"
 *
 * `decimalesPorClave` dice con cuantos decimales mostrar cada variable. Importa
 * porque los pasos anteriores casi nunca dan numeros redondos: 34 * 0.1 * 260
 * en punto flotante da 884.0000000000001, y sin esto el paso siguiente lo
 * mostraria como "884,00" cuando el paso que lo produjo dijo "884".
 */
function expresionConNumeros(expr, scope, decimalesPorClave) {
  return String(expr)
    .replace(/[a-zA-Z_][a-zA-Z0-9_]*|\d+(?:\.\d+)?/g, (token) => {
      // Literal escrito en la expresion (el 0.1 de qq -> tn, el 100 de los %).
      if (/^\d/.test(token)) {
        const punto = token.indexOf('.');
        return formatear(parseFloat(token), punto === -1 ? 0 : token.length - punto - 1);
      }
      if (!(token in scope)) return token;
      const d = decimalesPorClave && token in decimalesPorClave
        ? decimalesPorClave[token]
        : decimalesUtiles(scope[token]);
      return formatear(scope[token], d);
    })
    .replace(/\*/g, '×')
    .replace(/\//g, '÷');
}

/** Un dato entero se muestra sin decimales; uno fraccionario, con dos. */
function decimalesUtiles(n) {
  return Number.isInteger(n) ? 0 : 2;
}

/**
 * Evalua los pasos de un escenario en orden.
 *
 * Cada paso puede usar los `datos` del escenario y las `clave`s de los pasos
 * anteriores. Devuelve un array de pasos resueltos, listos para renderizar.
 */
function evaluarPasos(escenario) {
  const scope = { ...escenario.datos };
  // Con cuantos decimales se muestra cada paso ya calculado, para que un mismo
  // numero se vea igual en el paso que lo produce y en el que lo consume.
  const decimalesPorClave = {};
  const resueltos = [];

  (escenario.pasos || []).forEach((paso, i) => {
    let valor;
    try {
      valor = evaluarExpr(paso.expr, scope);
    } catch (e) {
      throw new Error(`paso ${i + 1} ("${paso.clave}"): ${e.message}`);
    }
    const decimales = paso.decimales != null ? paso.decimales : 1;

    resueltos.push({
      clave: paso.clave,
      etiqueta: paso.etiqueta,
      valor,
      unidad: paso.unidad || '',
      cuenta: expresionConNumeros(paso.expr, scope, decimalesPorClave),
      texto: `${formatear(valor, decimales)}${paso.unidad ? ' ' + paso.unidad : ''}`,
    });

    // El resultado queda disponible para los pasos siguientes.
    scope[paso.clave] = valor;
    decimalesPorClave[paso.clave] = decimales;
  });

  return resueltos;
}

/** Diccionario clave -> valor a partir de los pasos resueltos. */
function valoresDe(pasosResueltos) {
  const out = {};
  pasosResueltos.forEach((p) => { out[p.clave] = p.valor; });
  return out;
}

/**
 * Deriva el veredicto desde `criterio`, sin leer `respuesta_correcta`.
 *
 * Por eso el validador puede comparar lo que dice el escenario con lo que la
 * matematica realmente implica: si no coinciden, el escenario esta mal.
 */
function veredicto(escenario, valores) {
  const c = escenario.criterio;
  if (!c) throw new Error('el escenario no tiene criterio');
  if (!(c.metrica in valores)) {
    throw new Error(`criterio.metrica "${c.metrica}" no es la clave de ningun paso`);
  }
  const m = valores[c.metrica];
  if (m >= c.bueno_min) return 'bueno';
  if (m <= c.malo_max) return 'malo';
  return 'ajustado';
}

/** Resuelve un escenario completo: pasos + veredicto derivado. */
function resolver(escenario) {
  const pasos = evaluarPasos(escenario);
  const valores = valoresDe(pasos);
  return { pasos, valores, veredicto: veredicto(escenario, valores) };
}

/** Etiquetas de los botones para este escenario. */
function etiquetasDe(escenario) {
  return escenario.etiquetas && escenario.etiquetas.length === 3
    ? escenario.etiquetas
    : ETIQUETAS_DEFAULT;
}

// Exportamos al objeto global: no usamos modulos ES para que los mismos
// archivos anden servidos por http y tambien abiertos con doble clic.
window.Calculo = {
  CATEGORIAS, ETIQUETAS_DEFAULT, VEREDICTOS,
  evaluarExpr, evaluarPasos, valoresDe, veredicto, resolver,
  etiquetasDe, formatear, redondear, variablesDe,
};
