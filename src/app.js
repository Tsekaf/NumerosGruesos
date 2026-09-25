/*
 * app.js - Numeros Gruesos
 * ========================
 *
 * El loop: carta -> confianza + veredicto (12 s) -> revelacion -> repetir.
 *
 * Todo lo que es matematica vive en calculo.js; todo lo que es contenido vive
 * en content/scenarios.json. Aca queda solo el juego: tiempo, puntaje,
 * progresion, guardado y pantallas.
 *
 * Por que el puntaje castiga distinto segun la confianza: el objetivo no es
 * solo calcular bien, es saber CUANDO confiar en tu numero. Acertar con
 * confianza baja vale menos que acertar convencido, y errar convencido duele
 * mas que errar dudando. Eso entrena calibracion, no solo aritmetica.
 */

(function () {
  'use strict';

  // --- Parametros del juego (todo junto, para tunear despues de jugarlo) ---

  const SEGUNDOS = 12;

  const PUNTAJE = {
    acierto: { alta: 150, media: 100, baja: 60 },
    error:   { alta: -100, media: -50, baja: -20 },
    bonusPorRacha: 10,   // x racha, hasta el tope
    topeRacha: 10,
  };

  const XP_BASE = 10;                                   // x dificultad
  const XP_MULT = { alta: 1.5, media: 1.0, baja: 0.7 };
  const NIVELES = [0, 100, 250, 500, 850, 1300, 1900];

  const CLAVE_GUARDADO = 'ng_v1';
  const MAX_HISTORIAL = 30;
  const MAX_VISTOS = 12;
  const SESGO_CATEGORIA_FLOJA = 0.34;  // 1 de cada 3 cartas

  const CONFIANZAS = ['baja', 'media', 'alta'];

  // --- Estado en memoria ---------------------------------------------------

  let ESCENARIOS = [];
  let estado = null;          // lo persistido
  let carta = null;           // { escenario, resuelto, confianza, inicio }
  let reloj = null;           // { raf, fin }
  let pantallaAnterior = 'p-inicio';

  const $ = (id) => document.getElementById(id);

  // --- Guardado -----------------------------------------------------------

  function estadoFresco() {
    const xp = {};
    Object.keys(Calculo.CATEGORIAS).forEach((c) => { xp[c] = 0; });
    return {
      version: 1,
      puntos: 0,
      racha: 0,
      racha_record: 0,
      xp: xp,
      historial: [],
      vistos: [],
    };
  }

  /*
   * Leer de localStorage puede fallar de varias formas: no existe, esta
   * corrupto, el navegador lo bloquea (modo privado), o quedo de una version
   * vieja del juego. En todos los casos preferimos arrancar de cero antes que
   * romper: el progreso es valioso pero no es critico.
   */
  function cargar() {
    const fresco = estadoFresco();
    try {
      const crudo = localStorage.getItem(CLAVE_GUARDADO);
      if (!crudo) return fresco;
      const guardado = JSON.parse(crudo);
      if (!guardado || guardado.version !== fresco.version) return fresco;

      // Merge defensivo: si el guardado no trae un campo, usamos el fresco.
      return {
        version: fresco.version,
        puntos: num(guardado.puntos, 0),
        racha: num(guardado.racha, 0),
        racha_record: num(guardado.racha_record, 0),
        xp: Object.keys(fresco.xp).reduce((acc, c) => {
          acc[c] = num(guardado.xp && guardado.xp[c], 0);
          return acc;
        }, {}),
        historial: Array.isArray(guardado.historial) ? guardado.historial.slice(-MAX_HISTORIAL) : [],
        vistos: Array.isArray(guardado.vistos) ? guardado.vistos.slice(-MAX_VISTOS) : [],
      };
    } catch (e) {
      return fresco;
    }
  }

  function guardar() {
    try {
      localStorage.setItem(CLAVE_GUARDADO, JSON.stringify(estado));
    } catch (e) {
      /* Sin persistencia el juego sigue andando, solo no recuerda. */
    }
  }

  function num(v, def) {
    return typeof v === 'number' && Number.isFinite(v) ? v : def;
  }

  // --- Niveles ------------------------------------------------------------

  function nivelDe(xp) {
    let i = 0;
    while (i + 1 < NIVELES.length && xp >= NIVELES[i + 1]) i++;
    const piso = NIVELES[i];
    const techo = NIVELES[i + 1];
    return {
      nivel: i + 1,
      xp: xp,
      piso: piso,
      techo: techo,                                   // undefined en el ultimo
      progreso: techo == null ? 1 : (xp - piso) / (techo - piso),
      max: techo == null,
    };
  }

  // --- Eleccion de la proxima carta ---------------------------------------

  function categoriaMasFloja() {
    return Object.keys(Calculo.CATEGORIAS)
      .sort((a, b) => estado.xp[a] - estado.xp[b])[0];
  }

  /*
   * Evitamos repetir las ultimas vistas (si no, con 15 escenarios el juego se
   * vuelve memoria en vez de calculo) y una de cada tres cartas la forzamos en
   * la categoria con menos XP: que el juego insista donde flojeas es la mitad
   * del valor de entrenar.
   */
  function elegirEscenario() {
    const tope = Math.min(estado.vistos.length, Math.floor(ESCENARIOS.length / 2));
    const recientes = new Set(tope > 0 ? estado.vistos.slice(-tope) : []);

    let pool = ESCENARIOS.filter((e) => !recientes.has(e.id));
    if (!pool.length) pool = ESCENARIOS.slice();

    if (Math.random() < SESGO_CATEGORIA_FLOJA) {
      const floja = categoriaMasFloja();
      const enFloja = pool.filter((e) => e.categoria === floja);
      if (enFloja.length) pool = enFloja;
    }

    return pool[Math.floor(Math.random() * pool.length)];
  }

  // --- Rotulos legibles ---------------------------------------------------

  /*
   * Las claves de `datos` son nombres de variable (rinde_qq_ha) porque las usan
   * las expresiones. Para mostrarlas hay que traducirlas. La regla: desde el
   * primer token que es una unidad hasta el final, todo es unidad; lo de antes
   * es el nombre.
   */
  const UNIDADES = {
    usd: 'USD', ars: '$', ha: 'ha', tn: 'tn', kg: 'kg', qq: 'qq',
    km: 'km', cab: 'cab', dia: 'día', anios: 'años', anual: 'año', pct: '%',
  };
  const ARRANCA_UNIDAD = ['usd', 'ars', 'qq', 'tn', 'kg', 'km', 'anios', 'pct'];

  const PALABRAS = {
    hectareas: 'Hectáreas', anios: 'años', inversion: 'Inversión',
    energia: 'Energía', util: 'útil', dias: 'Días', maiz: 'maíz',
    tipo: 'Tipo de', kilometros: 'Kilómetros',
  };

  function rotular(clave) {
    const tokens = clave.split('_');
    let corte = tokens.length;
    for (let i = 0; i < tokens.length; i++) {
      if (ARRANCA_UNIDAD.indexOf(tokens[i]) !== -1) { corte = i; break; }
    }
    const nombre = tokens.slice(0, corte);
    const unidad = tokens.slice(corte).map((t) => UNIDADES[t] || t).join('/');

    const texto = nombre
      .map((t, i) => {
        const p = PALABRAS[t] || t;
        return i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p;
      })
      .join(' ');

    return unidad ? `${texto} (${unidad})` : texto;
  }

  function valorLegible(v) {
    return Calculo.formatear(v, Number.isInteger(v) ? 0 : 2);
  }

  // --- Pantallas ----------------------------------------------------------

  const PANTALLAS = ['p-inicio', 'p-carta', 'p-revelacion', 'p-progreso'];

  function mostrar(id) {
    PANTALLAS.forEach((p) => $(p).classList.toggle('activa', p === id));
    $('barra').hidden = (id === 'p-inicio');
    $('btn-volver').hidden = (id !== 'p-progreso');
    $('btn-progreso').hidden = (id === 'p-progreso');
    window.scrollTo({ top: 0 });
  }

  function pintarMarcador() {
    $('m-puntos').textContent = Calculo.formatear(estado.puntos, 0);
    $('m-racha').textContent = estado.racha > 1 ? `racha ${estado.racha}` : '';
  }

  // --- Carta --------------------------------------------------------------

  function nuevaCarta() {
    const escenario = elegirEscenario();
    let resuelto;
    try {
      resuelto = Calculo.resolver(escenario);
    } catch (e) {
      // Un escenario roto no puede colgar el juego: lo salteamos y avisamos.
      console.error(`escenario "${escenario.id}" roto: ${e.message}`);
      ESCENARIOS = ESCENARIOS.filter((x) => x.id !== escenario.id);
      if (ESCENARIOS.length) return nuevaCarta();
      return fatal('No quedan escenarios validos. Corré tools/validar.html.');
    }

    carta = { escenario, resuelto, confianza: 'media', respondida: false };

    $('c-categoria').textContent = Calculo.CATEGORIAS[escenario.categoria];
    $('c-dificultad').textContent = 'dif ' + escenario.dificultad;
    $('c-enunciado').textContent = escenario.enunciado;
    $('c-pregunta').textContent = escenario.pregunta;

    const dl = $('c-datos');
    dl.innerHTML = '';
    Object.entries(escenario.datos).forEach(([k, v]) => {
      const fila = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = rotular(k);
      const dd = document.createElement('dd');
      dd.textContent = valorLegible(v);
      fila.appendChild(dt);
      fila.appendChild(dd);
      dl.appendChild(fila);
    });

    const etiquetas = Calculo.etiquetasDe(escenario);
    $('c-veredictos').querySelectorAll('button').forEach((btn) => {
      const i = Calculo.VEREDICTOS.indexOf(btn.dataset.veredicto);
      btn.textContent = etiquetas[i];
      btn.disabled = false;
    });

    elegirConfianza('media');
    mostrar('p-carta');
    arrancarReloj();
  }

  function elegirConfianza(nivel) {
    if (carta) carta.confianza = nivel;
    $('c-confianza').querySelectorAll('button').forEach((b) => {
      b.classList.toggle('sel', b.dataset.conf === nivel);
    });
  }

  /*
   * Dos mecanismos, con roles distintos:
   *
   *   - requestAnimationFrame DIBUJA la barra (con transform: scaleX, que no
   *     obliga a recalcular layout 60 veces por segundo).
   *   - setTimeout GARANTIZA el vencimiento.
   *
   * Hacen falta los dos porque el navegador congela rAF cuando la pestaña no
   * se esta dibujando (otra app abierta en el celu, ventana tapada). Con rAF
   * solo, la carta se queda abierta para siempre y el reloj deja de correr:
   * probado, pasa. setTimeout sigue disparando igual.
   */
  function arrancarReloj() {
    pararReloj();
    const barra = $('reloj-barra');
    const fin = performance.now() + SEGUNDOS * 1000;
    barra.className = 'reloj-barra';
    barra.style.transform = 'scaleX(1)';

    function pintar(ahora) {
      const restante = Math.max(0, (fin - ahora) / (SEGUNDOS * 1000));
      barra.style.transform = `scaleX(${restante})`;
      barra.classList.toggle('apurate', restante <= 0.4 && restante > 0.15);
      barra.classList.toggle('ultimo', restante <= 0.15);
      if (restante > 0 && reloj) reloj.raf = requestAnimationFrame(pintar);
    }

    reloj = {
      raf: requestAnimationFrame(pintar),
      vencimiento: setTimeout(() => responder(null), SEGUNDOS * 1000),
    };
  }

  function pararReloj() {
    if (!reloj) return;
    cancelAnimationFrame(reloj.raf);
    clearTimeout(reloj.vencimiento);
    reloj = null;
  }

  // --- Resolucion ---------------------------------------------------------

  /** `eleccion` es un veredicto, o null si se acabo el tiempo. */
  function responder(eleccion) {
    if (!carta || carta.respondida) return;
    carta.respondida = true;
    pararReloj();
    $('c-veredictos').querySelectorAll('button').forEach((b) => { b.disabled = true; });

    const esc = carta.escenario;
    const correcto = eleccion === carta.resuelto.veredicto;
    const tarde = eleccion === null;
    const conf = carta.confianza;

    let puntos = 0;
    if (tarde) {
      estado.racha = 0;
    } else if (correcto) {
      puntos = PUNTAJE.acierto[conf]
             + PUNTAJE.bonusPorRacha * Math.min(estado.racha, PUNTAJE.topeRacha);
      estado.racha += 1;
      estado.racha_record = Math.max(estado.racha_record, estado.racha);
      estado.xp[esc.categoria] += Math.round(XP_BASE * esc.dificultad * XP_MULT[conf]);
    } else {
      puntos = PUNTAJE.error[conf];
      estado.racha = 0;
    }

    estado.puntos += puntos;
    estado.historial.push({
      id: esc.id, cat: esc.categoria, correcto: correcto && !tarde,
      tarde: tarde, confianza: conf, ts: Date.now(),
    });
    if (estado.historial.length > MAX_HISTORIAL) estado.historial.shift();

    estado.vistos.push(esc.id);
    if (estado.vistos.length > MAX_VISTOS) estado.vistos.shift();

    guardar();
    pintarMarcador();
    pintarRevelacion(eleccion, correcto, tarde, puntos);
    mostrar('p-revelacion');
  }

  function pintarRevelacion(eleccion, correcto, tarde, puntos) {
    const esc = carta.escenario;
    const etiquetas = Calculo.etiquetasDe(esc);
    const iCorrecta = Calculo.VEREDICTOS.indexOf(carta.resuelto.veredicto);

    const caja = $('r-resultado');
    caja.className = 'resultado ' + (tarde ? 'tarde' : correcto ? 'bien' : 'mal');

    $('r-titulo').textContent = tarde ? 'Se acabó el tiempo'
                             : correcto ? '¡Bien!' : 'No';

    let detalle = `Era: ${etiquetas[iCorrecta]}`;
    if (!correcto && !tarde) {
      const iTuya = Calculo.VEREDICTOS.indexOf(eleccion);
      detalle += ` — dijiste ${etiquetas[iTuya]} con confianza ${carta.confianza}`;
    } else if (correcto) {
      detalle += ` — con confianza ${carta.confianza}`;
    }
    $('r-detalle').textContent = detalle;

    const signo = puntos > 0 ? '+' : '';
    let texto = `${signo}${Calculo.formatear(puntos, 0)} puntos`;
    if (correcto) {
      texto += estado.racha > 1 ? ` · racha ${estado.racha}` : '';
    } else {
      texto += ' · racha cortada';
    }
    $('r-puntos').textContent = texto;

    const ol = $('r-pasos');
    ol.innerHTML = '';
    carta.resuelto.pasos.forEach((p) => {
      const li = document.createElement('li');
      if (p.clave === esc.criterio.metrica) li.className = 'decisivo';
      const et = document.createElement('div');
      et.className = 'etiqueta';
      et.textContent = p.etiqueta;
      const cu = document.createElement('div');
      cu.className = 'cuenta';
      cu.appendChild(document.createTextNode(p.cuenta + ' = '));
      const val = document.createElement('span');
      val.className = 'valor';
      val.textContent = p.texto;
      cu.appendChild(val);
      li.appendChild(et);
      li.appendChild(cu);
      ol.appendChild(li);
    });

    $('r-explicacion').textContent = esc.explicacion;
  }

  // --- Progreso -----------------------------------------------------------

  function pintarProgreso() {
    const jugadas = estado.historial.length;
    const aciertos = estado.historial.filter((h) => h.correcto).length;

    $('g-resumen').innerHTML = [
      tarjeta(Calculo.formatear(estado.puntos, 0), 'puntos'),
      tarjeta(estado.racha_record, 'récord'),
      tarjeta(jugadas ? Math.round(aciertos / jugadas * 100) + '%' : '—', 'aciertos'),
    ].join('');

    const barras = $('g-barras');
    barras.innerHTML = '';
    Object.entries(Calculo.CATEGORIAS).forEach(([clave, nombre]) => {
      const n = nivelDe(estado.xp[clave]);
      const div = document.createElement('div');
      div.className = 'barra-item' + (n.xp === 0 ? ' vacia' : '');
      div.innerHTML =
        `<div class="fila"><span class="nombre"></span>` +
        `<span class="nivel"></span></div>` +
        `<div class="canal"><div class="relleno"></div></div>`;
      div.querySelector('.nombre').textContent = nombre;
      div.querySelector('.nivel').textContent = n.max
        ? `nivel ${n.nivel} · ${n.xp} xp`
        : `nivel ${n.nivel} · ${n.xp}/${n.techo} xp`;
      div.querySelector('.relleno').style.width =
        Math.round(Math.max(0, Math.min(1, n.progreso)) * 100) + '%';
      barras.appendChild(div);
    });

    // Calibracion: acierto por nivel de confianza declarado.
    const cal = $('g-calibracion');
    cal.innerHTML = '';
    CONFIANZAS.slice().reverse().forEach((conf) => {
      const usos = estado.historial.filter((h) => h.confianza === conf && !h.tarde);
      const ok = usos.filter((h) => h.correcto).length;
      const pct = usos.length ? Math.round(ok / usos.length * 100) : 0;
      const fila = document.createElement('div');
      fila.className = 'cal-fila';
      fila.innerHTML =
        `<span class="cal-nombre"></span>` +
        `<span class="cal-canal"><span class="cal-relleno"></span></span>` +
        `<span class="cal-dato"></span>`;
      fila.querySelector('.cal-nombre').textContent = conf;
      fila.querySelector('.cal-relleno').style.width = pct + '%';
      fila.querySelector('.cal-dato').textContent = usos.length
        ? `${pct}% (${ok}/${usos.length})`
        : 'sin datos';
      cal.appendChild(fila);
    });

    const hist = $('g-historial');
    hist.innerHTML = '';
    if (!jugadas) {
      hist.innerHTML = '<span class="vacio">Todavía no jugaste ninguna carta.</span>';
    } else {
      estado.historial.slice().reverse().forEach((h) => {
        const p = document.createElement('span');
        p.className = 'h-punto ' + (h.tarde ? '' : h.correcto ? 'bien' : 'mal');
        p.textContent = h.tarde ? '⏱' : h.correcto ? '✓' : '✗';
        p.title = `${Calculo.CATEGORIAS[h.cat] || h.cat} · confianza ${h.confianza}`;
        hist.appendChild(p);
      });
    }

    mostrar('p-progreso');
  }

  function tarjeta(n, rotulo) {
    return `<div class="tarjeta"><span class="n">${n}</span><span class="r">${rotulo}</span></div>`;
  }

  // --- Arranque -----------------------------------------------------------

  function pintarPieInicio() {
    const jugadas = estado.historial.length;
    $('pie-inicio').textContent = jugadas
      ? `${Calculo.formatear(estado.puntos, 0)} puntos · récord de racha ${estado.racha_record} · ${ESCENARIOS.length} escenarios`
      : `${ESCENARIOS.length} escenarios cargados`;
  }

  function fatal(mensaje) {
    $('p-inicio').innerHTML = `<div class="portada"><h1>Números<br>Gruesos</h1>`
      + `<p class="bajada">${mensaje}</p></div>`;
    mostrar('p-inicio');
  }

  function conectarEventos() {
    $('btn-jugar').addEventListener('click', nuevaCarta);
    $('btn-jugar-2').addEventListener('click', nuevaCarta);
    $('btn-siguiente').addEventListener('click', nuevaCarta);

    $('btn-parar').addEventListener('click', () => { pintarPieInicio(); mostrar('p-inicio'); });
    $('btn-ver-progreso').addEventListener('click', () => { pantallaAnterior = 'p-inicio'; pintarProgreso(); });

    $('btn-progreso').addEventListener('click', () => {
      pantallaAnterior = PANTALLAS.find((p) => $(p).classList.contains('activa')) || 'p-inicio';
      // Mirar el progreso en medio de una carta seria hacer trampa con el reloj:
      // si la carta esta abierta, la cerramos como tiempo agotado.
      if (pantallaAnterior === 'p-carta') responder(null);
      pintarProgreso();
    });

    $('btn-volver').addEventListener('click', () => {
      if (pantallaAnterior === 'p-inicio') pintarPieInicio();
      mostrar(pantallaAnterior === 'p-carta' ? 'p-revelacion' : pantallaAnterior);
    });

    $('btn-borrar').addEventListener('click', () => {
      if (!confirm('¿Borrar todo el progreso? No se puede deshacer.')) return;
      estado = estadoFresco();
      guardar();
      pintarMarcador();
      pintarProgreso();
    });

    $('c-confianza').addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-conf]');
      if (btn) elegirConfianza(btn.dataset.conf);
    });

    $('c-veredictos').addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-veredicto]');
      if (btn && !btn.disabled) responder(btn.dataset.veredicto);
    });

    // Teclado, para practicar en la compu: 1/2/3 veredicto, q/w/e confianza.
    document.addEventListener('keydown', (ev) => {
      if (!$('p-carta').classList.contains('activa')) return;
      const vered = { '1': 'bueno', '2': 'ajustado', '3': 'malo' }[ev.key];
      if (vered) { responder(vered); return; }
      const conf = { q: 'baja', w: 'media', e: 'alta' }[ev.key.toLowerCase()];
      if (conf) elegirConfianza(conf);
    });

    // Si la app se va a segundo plano, el reloj no puede seguir corriendo
    // contra el jugador: cerramos la carta como tiempo agotado.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && reloj) responder(null);
    });
  }

  function iniciar() {
    estado = cargar();
    pintarMarcador();
    conectarEventos();

    fetch('content/scenarios.json')
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then((data) => {
        ESCENARIOS = data.escenarios || [];
        if (!ESCENARIOS.length) throw new Error('el archivo no tiene escenarios');
        pintarPieInicio();
      })
      .catch((e) => {
        fatal(`No se pudieron cargar los escenarios (${e.message}). `
            + `Si abriste index.html con doble clic, no va a andar: levantá el server con tools/servir.ps1.`);
      });

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => { /* sin offline, pero juega */ });
      });
    }
  }

  iniciar();
})();
