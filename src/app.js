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

  /*
   * El tiempo por carta es elegible. Los 12 segundos originales entrenaban la
   * estimacion rapida, pero son pocos para leer un enunciado nuevo y pensarlo:
   * castigan la lectura, no el calculo. El 0 es "sin limite", que es el modo
   * para aprender algo por primera vez (sin reloj no hay bonus de racha, pero
   * si XP: se puede estudiar sin que el puntaje te apure).
   */
  const TIEMPOS = [20, 30, 45, 60, 0];
  const SEGUNDOS_DEFAULT = 30;

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
  let FICHAS = [];
  let fichaAbierta = null;
  let repaso = null;
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
      segundos: SEGUNDOS_DEFAULT,
      xp: xp,
      historial: [],
      vistos: [],
      repaso: {},        // por ficha: { vistas, fallos, ultimo }
      srs: {},           // por pregunta: { paso, proximo } - ver src/srs.js
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
        // Si el guardado trae un tiempo que ya no ofrecemos, volvemos al default.
        segundos: TIEMPOS.indexOf(num(guardado.segundos, -1)) !== -1
          ? guardado.segundos
          : SEGUNDOS_DEFAULT,
        xp: Object.keys(fresco.xp).reduce((acc, c) => {
          acc[c] = num(guardado.xp && guardado.xp[c], 0);
          return acc;
        }, {}),
        historial: Array.isArray(guardado.historial) ? guardado.historial.slice(-MAX_HISTORIAL) : [],
        vistos: Array.isArray(guardado.vistos) ? guardado.vistos.slice(-MAX_VISTOS) : [],
        repaso: (guardado.repaso && typeof guardado.repaso === "object") ? guardado.repaso : {},
        srs: (guardado.srs && typeof guardado.srs === "object") ? guardado.srs : {},
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
    km: 'km', cab: 'cab', ev: 'EV', vacas: 'vacas', l: 'l', bolsa: 'bolsa',
    dia: 'día', anios: 'años', anual: 'año', pct: '%',
  };
  const ARRANCA_UNIDAD = ['usd', 'ars', 'qq', 'tn', 'kg', 'km', 'cab', 'ev',
                          'vacas', 'anios', 'pct'];

  // Todo en minuscula: rotular() capitaliza la primera palabra. Si la
  // traduccion viniera ya capitalizada quedaria "Costo Energía" en el medio
  // de una frase.
  const PALABRAS = {
    hectareas: 'hectáreas', anios: 'años', inversion: 'inversión',
    energia: 'energía', util: 'útil', dias: 'días', maiz: 'maíz',
    tipo: 'tipo de', kilometros: 'kilómetros', liquidacion: 'liquidación',
    adp: 'aumento diario', supl: 'suplemento', desbaste: 'desbaste',
    capitalizacion: 'capitalización', amortizacion: 'amortización',
  };

  function rotular(clave) {
    const tokens = clave.split('_');
    let corte = tokens.length;
    for (let i = 0; i < tokens.length; i++) {
      if (ARRANCA_UNIDAD.indexOf(tokens[i]) !== -1) { corte = i; break; }
    }
    // Si la clave entera es una unidad ("vacas", "novillos"), no es una unidad:
    // es el nombre del dato. Sin esta guarda quedaria un rotulo vacio con un
    // parentesis al lado.
    if (corte === 0) corte = tokens.length;

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

  const PANTALLAS = ['p-inicio', 'p-carta', 'p-revelacion', 'p-progreso',
                     'p-teoria', 'p-ficha', 'p-repaso'];

  /** Pantallas donde la flecha de volver tiene sentido. */
  const CON_VOLVER = ['p-progreso', 'p-teoria', 'p-ficha', 'p-repaso'];

  function mostrar(id) {
    PANTALLAS.forEach((p) => $(p).classList.toggle('activa', p === id));
    $('barra').hidden = (id === 'p-inicio');
    $('btn-volver').hidden = (CON_VOLVER.indexOf(id) === -1);
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
    const segundos = estado.segundos;

    // Sin limite: escondemos la barra entera en vez de dejarla llena y quieta,
    // que se leeria como "el reloj se colgo".
    $('reloj').hidden = (segundos === 0);
    if (segundos === 0) return;

    const barra = $('reloj-barra');
    const fin = performance.now() + segundos * 1000;
    barra.className = 'reloj-barra';
    barra.style.transform = 'scaleX(1)';

    function pintar(ahora) {
      const restante = Math.max(0, (fin - ahora) / (segundos * 1000));
      barra.style.transform = `scaleX(${restante})`;
      barra.classList.toggle('apurate', restante <= 0.4 && restante > 0.15);
      barra.classList.toggle('ultimo', restante <= 0.15);
      if (restante > 0 && reloj) reloj.raf = requestAnimationFrame(pintar);
    }

    reloj = {
      raf: requestAnimationFrame(pintar),
      vencimiento: setTimeout(() => responder(null), segundos * 1000),
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

    /*
     * Sin limite de tiempo es "modo estudio": suma XP pero no puntos ni racha,
     * y errar no corta nada. Si puntuara igual que el modo con reloj seria
     * estrictamente mejor y los tiempos no tendrian sentido; asi en cambio es
     * una eleccion real entre aprender y medirte.
     */
    const estudio = (estado.segundos === 0);

    let puntos = 0;
    if (correcto && !tarde) {
      estado.xp[esc.categoria] += Math.round(XP_BASE * esc.dificultad * XP_MULT[conf]);
    }
    if (!estudio) {
      if (tarde || !correcto) {
        puntos = tarde ? 0 : PUNTAJE.error[conf];
        estado.racha = 0;
      } else {
        puntos = PUNTAJE.acierto[conf]
               + PUNTAJE.bonusPorRacha * Math.min(estado.racha, PUNTAJE.topeRacha);
        estado.racha += 1;
        estado.racha_record = Math.max(estado.racha_record, estado.racha);
      }
    }

    estado.puntos += puntos;
    estado.historial.push({
      id: esc.id, cat: esc.categoria, correcto: correcto && !tarde,
      tarde: tarde, confianza: conf, estudio: estudio, ts: Date.now(),
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

    let texto;
    if (estado.segundos === 0) {
      texto = correcto && !tarde ? 'Modo estudio · suma XP, no puntos' : 'Modo estudio';
    } else {
      const signo = puntos > 0 ? '+' : '';
      texto = `${signo}${Calculo.formatear(puntos, 0)} puntos`;
      texto += correcto && !tarde
        ? (estado.racha > 1 ? ` · racha ${estado.racha}` : '')
        : ' · racha cortada';
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

    /*
     * El atajo a la teoria. Aparece solo si el escenario tiene ficha asociada,
     * y se ofrece con mas enfasis cuando erraste: el momento de mas ganas de
     * entender algo es justo despues de equivocarse, y hasta ahora no habia a
     * donde ir desde ahi.
     */
    const btn = $('btn-teoria-carta');
    const ficha = esc.ficha ? FICHAS.find((f) => f.id === esc.ficha) : null;
    btn.hidden = !ficha;
    if (ficha) {
      btn.textContent = (correcto && !tarde ? 'Repasar: ' : 'Ver la teoría: ') + ficha.titulo;
      btn.onclick = () => { pantallaAnterior = 'p-revelacion'; abrirFicha(ficha.id); };
    }
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

  // --- Teoria -------------------------------------------------------------

  const AREAS = {
    ganaderia: 'Ganadería',
    agricultura: 'Agricultura',
    impositivo: 'Impositivo',
    clima_zona: 'Clima y zona',
  };

  /*
   * El sello de confianza. No es decoracion: una ficha que dice "gestacion 283
   * dias" y otra que dice "el calendario de vacunacion es tal" no merecen la
   * misma fe, y el que lee tiene que poder distinguirlas de un vistazo.
   */
  const SELLOS = {
    alta:  { texto: 'dato firme',  clase: 'sello-ok' },
    media: { texto: 'valor típico', clase: 'sello-medio' },
    baja:  { texto: 'confirmar',   clase: 'sello-ojo' },
  };

  function pintarIndiceTeoria() {
    const cont = $('t-indice');
    cont.innerHTML = '';

    if (!FICHAS.length) {
      cont.innerHTML = '<p class="vacio">No se pudieron cargar las fichas.</p>';
      mostrar('p-teoria');
      return;
    }

    Object.keys(AREAS).forEach((area) => {
      const deArea = FICHAS.filter((f) => f.area === area);
      if (!deArea.length) return;

      const h = document.createElement('h3');
      h.className = 'seccion';
      h.textContent = AREAS[area];
      cont.appendChild(h);

      deArea.forEach((f) => {
        const r = estado.repaso[f.id];
        const fila = document.createElement('button');
        fila.className = 'ficha-fila';
        fila.innerHTML =
          `<span class="ficha-titulo"></span>` +
          `<span class="ficha-resumen"></span>` +
          `<span class="ficha-pie"></span>`;
        fila.querySelector('.ficha-titulo').textContent = f.titulo;
        fila.querySelector('.ficha-resumen').textContent = f.resumen;

        const pie = fila.querySelector('.ficha-pie');
        const sello = SELLOS[f.confianza];
        const et = document.createElement('span');
        et.className = 'sello ' + sello.clase;
        et.textContent = sello.texto;
        pie.appendChild(et);

        if (r && r.vistas) {
          const acierto = Math.round((r.vistas - r.fallos) / r.vistas * 100);
          const m = document.createElement('span');
          m.className = 'ficha-marca';
          m.textContent = `repasada · ${acierto}%`;
          pie.appendChild(m);
        }

        fila.addEventListener('click', () => abrirFicha(f.id));
        cont.appendChild(fila);
      });
    });

    mostrar('p-teoria');
  }

  function abrirFicha(id) {
    const f = FICHAS.find((x) => x.id === id);
    if (!f) return;
    fichaAbierta = f;

    $('f-area').textContent = AREAS[f.area] || f.area;
    const sello = SELLOS[f.confianza];
    $('f-sello').textContent = sello.texto;
    $('f-sello').className = 'chip sello ' + sello.clase;

    $('f-titulo').textContent = f.titulo;
    $('f-resumen').textContent = f.resumen;

    // El aviso solo aparece donde hace falta: si sale en todas las fichas deja
    // de leerse, que es como no ponerlo.
    /*
     * `verificar_con` esta escrito como respuesta a "verificar con: ___", asi
     * que a veces empieza en minuscula y a veces es una explicacion entera.
     * Con un encabezado propio funcionan las dos formas sin tener que
     * reescribir el contenido.
     */
    const aviso = $('f-aviso');
    aviso.hidden = (f.confianza !== 'baja');
    if (!aviso.hidden) {
      aviso.innerHTML = '<span class="rotulo">Antes de usarlo para decidir</span>';
      const p = document.createElement('p');
      p.textContent = f.verificar_con || 'Confirmalo con una fuente.';
      aviso.appendChild(p);
    }

    const cuerpo = $('f-cuerpo');
    cuerpo.innerHTML = '';
    (f.cuerpo || []).forEach((p) => {
      const el = document.createElement('p');
      el.textContent = p;
      cuerpo.appendChild(el);
    });

    $('f-formula-caja').hidden = !f.formula;
    if (f.formula) {
      $('f-formula').textContent = f.formula.expresion;
      $('f-ejemplo').textContent = f.formula.ejemplo || '';
    }

    const dl = $('f-datos');
    dl.innerHTML = '';
    $('f-datos-caja').hidden = !(f.datos && f.datos.length);
    (f.datos || []).forEach((d) => {
      const fila = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = d.clave;
      const dd = document.createElement('dd');
      dd.textContent = d.valor;
      fila.appendChild(dt);
      fila.appendChild(dd);
      dl.appendChild(fila);
      if (d.nota) {
        const nota = document.createElement('div');
        nota.className = 'dato-nota';
        nota.textContent = d.nota;
        dl.appendChild(nota);
      }
    });

    const n = (f.preguntas || []).length;
    $('btn-repasar').textContent = n ? `Repasar · ${n} preguntas` : 'Sin preguntas';
    $('btn-repasar').disabled = !n;

    // Si llegaste desde una carta, la salida es volver a la carta y no al
    // indice: cortarle la partida a alguien por consultar la teoria seria
    // castigar justo lo que uno quiere que haga.
    const desdeCarta = (pantallaAnterior === 'p-revelacion');
    $('btn-volver-indice').textContent = desdeCarta ? 'Volver a la carta' : 'Volver al índice';

    mostrar('p-ficha');
  }

  /*
   * Repaso por autoevaluacion: ves la pregunta, la pensas, revelas la respuesta
   * y decis vos si la sabias. Es mas honesto que el multiple choice para este
   * tipo de contenido, porque "reconocer la opcion correcta" y "acordarte" no
   * son lo mismo, y lo segundo es lo que se te borra en las vacaciones.
   */
  /** Una pregunta de ficha, con la forma que consume la cola de repaso. */
  function comoItem(ficha, q) {
    return { ficha, p: q.p, r: q.r, tipo: q.tipo, clave: SRS.claveDe(ficha.id, q.p) };
  }

  /** Repaso de UNA ficha: todas sus preguntas, sepas o no. Es el modo estudio. */
  function arrancarRepaso() {
    if (!fichaAbierta || !fichaAbierta.preguntas.length) return;
    repaso = {
      modo: 'ficha',
      ficha: fichaAbierta,
      cola: fichaAbierta.preguntas.map((q) => comoItem(fichaAbierta, q)),
      i: 0,
      fallos: 0,
    };
    pintarPregunta();
  }

  /** Repaso del dia: solo lo que esta por olvidarse, de todas las fichas. */
  function arrancarRepasoDelDia() {
    const cola = SRS.vencidas(FICHAS, estado.srs);
    if (!cola.length) return;
    repaso = { modo: 'dia', ficha: null, cola, i: 0, fallos: 0 };
    pintarPregunta();
  }

  function pintarPregunta() {
    const p = repaso.cola[repaso.i];
    const donde = repaso.modo === 'dia'
      ? `Repaso del día · ${repaso.i + 1} de ${repaso.cola.length}`
      : `${repaso.ficha.titulo} · ${repaso.i + 1} de ${repaso.cola.length}`;

    $('rp-avance').textContent = donde;
    // En el repaso del dia las preguntas vienen mezcladas de fichas distintas,
    // asi que hay que decir de cual es cada una: sin eso quedan sin contexto.
    $('rp-origen').textContent = repaso.modo === 'dia' ? p.ficha.titulo : '';
    $('rp-origen').hidden = repaso.modo !== 'dia';

    $('rp-tipo').textContent = { recordar: 'Recordar', calcular: 'Calcular', criterio: 'Criterio' }[p.tipo] || '';
    $('rp-pregunta').textContent = p.p;
    $('rp-texto').textContent = p.r;

    $('rp-respuesta').hidden = true;
    $('rp-juicio').hidden = true;
    $('rp-fin').hidden = true;
    $('rp-caja').hidden = false;
    $('btn-ver-respuesta').hidden = false;
    $('btn-cortar-repaso').hidden = false;

    mostrar('p-repaso');
  }

  function revelarRespuesta() {
    $('rp-respuesta').hidden = false;
    $('btn-ver-respuesta').hidden = true;
    $('rp-juicio').hidden = false;
  }

  function juzgar(sabia) {
    const item = repaso.cola[repaso.i];
    const ahora = Date.now();

    // 1) El calendario de esa pregunta en particular.
    estado.srs[item.clave] = SRS.programar(estado.srs[item.clave], sabia, ahora);

    // 2) Las estadisticas de la ficha, que son las que se ven en el indice.
    const fid = item.ficha.id;
    const previo = estado.repaso[fid] || { vistas: 0, fallos: 0 };
    estado.repaso[fid] = {
      vistas: previo.vistas + 1,
      fallos: previo.fallos + (sabia ? 0 : 1),
      ultimo: ahora,
    };

    /*
     * Una pregunta fallada vuelve al final de esta misma cola. Es la parte del
     * metodo que mas se nota: no te quedas con el ultimo recuerdo de haberla
     * errado, la volves a ver y la cerras bien.
     */
    if (!sabia) {
      repaso.fallos += 1;
      repaso.cola.push(item);
    }

    guardar();
    repaso.i += 1;

    if (repaso.i < repaso.cola.length) { pintarPregunta(); return; }
    terminarRepaso();
  }

  function terminarRepaso() {
    const total = repaso.cola.length;
    const bien = total - repaso.fallos;

    $('rp-caja').hidden = true;
    $('btn-ver-respuesta').hidden = true;
    $('rp-juicio').hidden = true;
    $('btn-cortar-repaso').hidden = true;
    $('rp-fin').hidden = false;

    $('rp-avance').textContent = repaso.modo === 'dia' ? 'Repaso del día' : repaso.ficha.titulo;
    $('rp-fin-titulo').textContent = repaso.fallos ? `${bien} de ${total}` : '¡Todas!';

    /*
     * Hay que separar lo vencido de lo nunca visto. Si se suman, despues de
     * hacer veinte preguntas el mensaje dice "quedan veinte" y parece que no
     * avanzaste, cuando en realidad lo vencido ya esta y lo que queda es
     * material nuevo que podes tomar a tu ritmo.
     */
    const r = SRS.resumen(FICHAS, estado.srs);
    let detalle;
    if (repaso.modo === 'dia') {
      if (r.paraHoy > 0) {
        detalle = `Te quedan ${r.paraHoy} vencidas para hoy.`;
      } else if (r.sinVer > 0) {
        detalle = `No queda nada vencido. Hay ${r.sinVer} preguntas que todavía no viste.`;
      } else {
        detalle = 'Estás al día con todo. Las que acertaste vuelven más adelante.';
      }
    } else {
      detalle = repaso.fallos
        ? 'Las que fallaste vuelven pronto en el repaso del día.'
        : 'Van a tardar bastante en volver.';
    }
    $('rp-fin-detalle').textContent = detalle;

    const volverA = repaso.modo === 'dia' ? null : repaso.ficha.id;
    repaso = null;
    $('btn-fin-repaso').onclick = () => {
      if (volverA) abrirFicha(volverA);
      else { pintarPortada(); mostrar('p-inicio'); }
    };
  }

  /** Los chips de tiempo de la portada. 0 se muestra como "sin limite". */
  function pintarSelectorTiempo() {
    const cont = $('c-tiempo');
    cont.innerHTML = '';
    TIEMPOS.forEach((s) => {
      const btn = document.createElement('button');
      btn.textContent = s === 0 ? 'Sin límite' : s + 's';
      btn.className = (s === estado.segundos ? 'sel' : '');
      btn.addEventListener('click', () => {
        estado.segundos = s;
        guardar();
        pintarSelectorTiempo();
      });
      cont.appendChild(btn);
    });
  }

  /*
   * El boton de repaso del dia es la puerta principal de la teoria: dice cuanto
   * hay para hacer hoy, y cuando no hay nada lo dice tambien. Sin un numero a
   * la vista, un sistema de repaso espaciado no se usa.
   */
  function pintarRepasoDelDia() {
    const btn = $('btn-repaso-dia');
    if (!FICHAS.length) { btn.hidden = true; return; }
    btn.hidden = false;

    const r = SRS.resumen(FICHAS, estado.srs);
    if (r.pendientes > 0) {
      btn.textContent = `Repaso del día · ${r.pendientes}`;
      btn.disabled = false;
      btn.classList.remove('apagado');
    } else {
      btn.textContent = 'Repaso al día';
      btn.disabled = true;
      btn.classList.add('apagado');
    }
  }

  /** Todo lo que se repinta al volver a la portada. */
  function pintarPortada() {
    pintarSelectorTiempo();
    pintarRepasoDelDia();
    pintarPieInicio();
  }

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

  /** Delegacion por pointerdown, con click de respaldo para teclado y mouse. */
  function tactil(contenedor, selector, accion) {
    let viaPointer = false;

    contenedor.addEventListener('pointerdown', (ev) => {
      const b = ev.target.closest(selector);
      if (!b) return;
      ev.preventDefault();
      viaPointer = true;
      accion(b);
    }, { passive: false });

    contenedor.addEventListener('click', (ev) => {
      if (viaPointer) { viaPointer = false; return; }
      const b = ev.target.closest(selector);
      if (b) accion(b);
    });
  }

  /*
   * iOS ignora user-scalable=no desde la version 10: el meta solo no alcanza y
   * hay que cancelar los gestos a mano. El {passive:false} no es decorativo:
   * sin el, Safari asume que nadie va a llamar a preventDefault y lo ignora en
   * silencio, con lo cual el codigo se ve bien y no hace nada.
   */
  function apagarZoom() {
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => {
      document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
    });
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

    let ultimoToque = 0;
    document.addEventListener('touchend', (e) => {
      const ahora = Date.now();
      if (ahora - ultimoToque <= 450) e.preventDefault();
      ultimoToque = ahora;
    }, { passive: false });
  }

  function conectarEventos() {
    apagarZoom();
    $('btn-jugar').addEventListener('click', nuevaCarta);
    $('btn-jugar-2').addEventListener('click', nuevaCarta);
    $('btn-siguiente').addEventListener('click', nuevaCarta);

    $('btn-parar').addEventListener('click', () => { pintarPortada(); mostrar('p-inicio'); });
    $('btn-ver-progreso').addEventListener('click', () => { pantallaAnterior = 'p-inicio'; pintarProgreso(); });

    $('btn-repaso-dia').addEventListener('click', arrancarRepasoDelDia);
    $('btn-teoria').addEventListener('click', () => { pantallaAnterior = 'p-inicio'; pintarIndiceTeoria(); });
    $('btn-volver-indice').addEventListener('click', () => {
      if (pantallaAnterior === 'p-revelacion') mostrar('p-revelacion');
      else pintarIndiceTeoria();
    });
    $('btn-repasar').addEventListener('click', arrancarRepaso);
    $('btn-ver-respuesta').addEventListener('click', revelarRespuesta);
    $('btn-si-sabia').addEventListener('click', () => juzgar(true));
    $('btn-no-sabia').addEventListener('click', () => juzgar(false));
    $('btn-cortar-repaso').addEventListener('click', () => {
      const id = repaso && repaso.ficha.id;
      repaso = null;
      if (id) abrirFicha(id); else pintarIndiceTeoria();
    });

    $('btn-progreso').addEventListener('click', () => {
      pantallaAnterior = PANTALLAS.find((p) => $(p).classList.contains('activa')) || 'p-inicio';
      // Mirar el progreso en medio de una carta seria hacer trampa con el reloj:
      // si la carta esta abierta, la cerramos como tiempo agotado.
      if (pantallaAnterior === 'p-carta') responder(null);
      pintarProgreso();
    });

    $('btn-volver').addEventListener('click', () => {
      const actual = PANTALLAS.find((p) => $(p).classList.contains('activa'));

      // Dentro de teoria la flecha navega hacia atras en su propio arbol,
      // no a la pantalla desde la que entraste.
      if (actual === 'p-repaso') { const id = repaso && repaso.ficha.id; repaso = null; if (id) abrirFicha(id); return; }
      if (actual === 'p-ficha') {
        if (pantallaAnterior === 'p-revelacion') mostrar('p-revelacion');
        else pintarIndiceTeoria();
        return;
      }

      if (pantallaAnterior === 'p-inicio') pintarPortada();
      mostrar(pantallaAnterior === 'p-carta' ? 'p-revelacion' : pantallaAnterior);
    });

    $('btn-borrar').addEventListener('click', () => {
      if (!confirm('¿Borrar todo el progreso? No se puede deshacer.')) return;
      estado = estadoFresco();
      guardar();
      pintarMarcador();
      pintarProgreso();
    });

    /*
     * Los botones de la carta van por pointerdown y no por click.
     * En iOS el click llega tarde y a veces se pierde si el dedo se movio un
     * pixel, y aca hay un reloj corriendo: una respuesta perdida es una carta
     * perdida. El click queda abajo como red para teclado y mouse, y la
     * bandera evita que en un toque se ejecute dos veces.
     */
    tactil($('c-confianza'), 'button[data-conf]', (b) => elegirConfianza(b.dataset.conf));
    tactil($('c-veredictos'), 'button[data-veredicto]', (b) => {
      if (!b.disabled) responder(b.dataset.veredicto);
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
    pintarSelectorTiempo();
    pintarRepasoDelDia();
    conectarEventos();

    // Las fichas son opcionales: si fallan, el juego igual se juega. Por eso
    // van en su propio fetch y no tumban el arranque.
    fetch('content/fichas.json')
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
      .then((data) => { FICHAS = data.fichas || []; pintarRepasoDelDia(); })
      .catch(() => { FICHAS = []; });

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
