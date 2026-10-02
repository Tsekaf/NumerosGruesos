# Números Gruesos

Entrenador de cálculo mental de economía de campo, para el celular. Cartas de
12 segundos: leés una situación con 3-5 números, decidís si el negocio cierra,
marcás **cuánta confianza** tenés en tu respuesta, y recién ahí ves la cuenta.

Estado: **M1 + M2** de [SPEC.md](SPEC.md) — loop completo y progresión.
15 escenarios sobre las 6 categorías. Falta M3 (los ~50 escenarios) y M4 (campaña).

## Jugarlo

Necesita un servidor: el juego carga los escenarios con `fetch`, que el navegador
bloquea sobre `file://`, y el service worker sólo se registra en `https` o
`localhost`. Abrir `index.html` con doble clic **no funciona**.

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File tools\servir.ps1
```

Y entrás a <http://localhost:8080>. El server es PowerShell puro: no hay que
instalar Python ni Node.

En la compu se puede jugar con el teclado: `1` / `2` / `3` para el veredicto,
`q` / `w` / `e` para la confianza.

## Ponerlo en el celular

Para instalarlo como app hace falta HTTPS, así que hay que publicarlo:

1. **Netlify Drop** (<https://app.netlify.com/drop>): arrastrás la carpeta
   `numeros-gruesos` entera y te da una URL. Es lo más rápido.
2. **GitHub Pages**: subís la carpeta a un repo y activás Pages.

Después abrís el link en el celu y le das *Agregar a pantalla de inicio*. Desde
ahí abre a pantalla completa y **funciona sin señal** (service worker).

## Cómo está armado

| Archivo | Rol |
|---|---|
| `content/scenarios.json` | **El contenido.** Los escenarios. Es lo único que se toca para agregar cartas. |
| `content/schema.json` | El contrato: qué campos tiene un escenario y de qué tipo. |
| `src/calculo.js` | **La matemática.** Evalúa los pasos y deriva el veredicto. Lo usan el juego y el validador. |
| `src/app.js` | **El juego.** Tiempo, puntaje, progresión, guardado, pantallas. |
| `src/style.css` | Estilos, mobile-first. |
| `index.html` `manifest.json` `sw.js` | La PWA. Van en la raíz a propósito (ver abajo). |
| `tools/servir.ps1` | Server local de desarrollo. |
| `tools/validar.html` | Valida los escenarios. **Correlo antes de dar por buena una carta nueva.** |
| `tools/iconos.ps1` | Genera los PNG del manifest. |

Dos decisiones que conviene conocer antes de tocar nada:

- **`sw.js` va en la raíz, no en `src/`.** Un service worker sólo puede
  interceptar pedidos dentro de su propia carpeta. Desde `/src/sw.js` no podría
  cachear `/content/scenarios.json`, y el juego no andaría sin señal.
- **En `localhost` el service worker va a la red primero**, y sólo usa el cache
  como respaldo. En producción es al revés. Sin eso, cada edición queda tapada
  por la copia cacheada hasta subir la `VERSION`.

## Agregar un escenario

1. Agregás el objeto en `content/scenarios.json` (el esquema está en
   [SPEC.md §5](SPEC.md)).
2. Abrís <http://localhost:8080/tools/validar.html>. Tiene que dar **0 errores**.
3. Subís la `VERSION` en `sw.js` (ej. `ng-v2`) para que se recachee en los celus
   que ya lo tienen instalado.

El validador no chequea sólo el formato: **recalcula la cuenta y vuelve a derivar
el veredicto desde `criterio`**, y te avisa si no coincide con lo que declaraste
en `respuesta_correcta`. Un escenario cuya cuenta no cierra no pasa.

## Los números no están verificados

Todos los escenarios tienen `"verificado": false`. Los valores (rindes, precios,
arrendamientos, tipo de cambio, tarifas de flete) son **rangos plausibles, no
datos de mercado chequeados** — como ya anticipaba SPEC.md §6.

Cada carta es internamente consistente (de eso se ocupa el validador), pero los
valores hay que revisarlos contra la realidad. Cuando repases uno, poné
`"verificado": true` y el validador deja de marcarlo con advertencia.

## Puntaje

|  | Confianza Alta | Media | Baja |
|---|---|---|---|
| Acierto | +150 | +100 | +60 |
| Error | −100 | −50 | −20 |

Más `+10 × racha` al acertar (hasta ×10). Tiempo agotado: 0 puntos y se corta la
racha.

La asimetría es a propósito: el juego no entrena sólo a calcular, entrena a saber
**cuándo confiar en tu número**. Por eso la pantalla de progreso muestra
*calibración*: cuánto acertás con cada nivel de confianza. Si acertás igual
marcando Alta que marcando Baja, la confianza no te está diciendo nada.

Todo se puede tunear desde las constantes al principio de `src/app.js`.

## Teoría y repaso

Además de las cartas hay **30 fichas de teoría** (ganadería, agricultura e
impositivo) con 125 preguntas de repaso. Cuando errás una carta, aparece un botón
directo a la ficha que la explica.

Cada ficha lleva un sello de confianza, porque no todo lo que dice merece la misma
fe: **dato firme** es biología o aritmética que no cambia, **valor típico** varía
por establecimiento y año, y **confirmar** es normativa o práctica que depende de
una fuente oficial. Las de esa última categoría llevan arriba a quién preguntarle.
En lo volátil —vacunas, categorías de hacienda, impuestos— se explica qué existe y
por qué, nunca el número o la fecha, que caducan.

El repaso funciona por **repetición espaciada**: cada pregunta tiene su propio
calendario, así que acertarla la aleja y fallarla la trae de vuelta. La portada
muestra cuántas tocan hoy. Hay un tope de 20 por sesión para que volver después de
meses sin abrir la app no sea un muro de 125 preguntas.

Es autoevaluación, no multiple choice: ves la pregunta, la pensás, revelás la
respuesta y decidís vos si la sabías. Reconocer la opción correcta y acordarte no
son lo mismo, y lo segundo es lo que se borra.
