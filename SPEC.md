# Números Gruesos — Spec de diseño v0.1

Proyecto personal: juego para celu, sin fines de publicación, para entrenar cálculo mental de economía de campo (márgenes, punto de equilibrio, ROI) en sesiones cortas.

## 1. Decisiones tomadas (y por qué)

- **Plataforma: PWA (web app instalable), no app nativa.** Cero fricción de tienda de apps, la programás vos mismo, se actualiza sola, corre offline con service worker. Con Claude Code se arma en un día.
- **Arranca en modo Endless, la campaña narrativa es fase 2.** El loop de estimar-y-comparar es el que te entrena; la narrativa es wrapper motivacional, no el motor. Conviene validar que el loop "engancha" antes de invertir en historia.
- **Un solo jugador, sin backend.** Todo el estado (progreso, racha, escenarios ya vistos) vive en `localStorage`. Nada de servidor, nada de cuentas.
- **El contenido (escenarios) vive separado del código**, en JSON. Así podés ir agregando casos vos mismo sin tocar el motor del juego.

## 2. Core loop — Modo Endless ("Trato o Trampa")

1. Se muestra una carta con una situación (texto corto + 3-5 datos numéricos).
2. Tenés ~12 segundos para elegir: **Buen negocio / Mal negocio / Ajustado**, y además marcar tu **nivel de confianza** (Bajo / Medio / Alto).
3. Se revela el cálculo real (margen, punto de equilibrio, lo que corresponda) con el desglose paso a paso.
4. Puntaje: acertar con confianza Alta > acertar con confianza Media > acertar con confianza Baja. Fallar con confianza Alta resta más que fallar con confianza Baja (entrena calibración, no solo el cálculo).
5. Racha (streak) visible; se corta al fallar. Historial de las últimas N cartas con acierto por categoría.

## 3. Sistema de progresión

Categorías de habilidad independientes (cada una con su propio nivel/XP):

- Margen bruto (ingreso − costos directos)
- Punto de equilibrio (qq o unidades necesarias para cubrir costos)
- Costo por hectárea / por unidad
- ROI y payback simple
- Comprar vs. alquilar / financiar vs. contado
- Conversión de unidades (qq↔tn, ha, USD/ARS, flete)

La pantalla de progreso muestra estas 6 barras.

## 4. Modo Campaña (fase 2 — no se construye en el MVP)

Wrapper narrativo tipo D&D-lite: personaje = asesor de campo recorriendo postas, cada posta es un productor con un problema (mismo formato de carta que el endless, pero con contexto y consecuencias que persisten). Se define en detalle cuando el modo Endless esté jugable y usado.

## 5. Modelo de datos — escenario (JSON)

> **Revisión v0.2 (implementado).** El borrador guardaba el `calculo` como prosa
> (`"34 qq/ha * 0.1 tn/qq * 260 USD/tn = 884.4 USD/ha"`). Eso tenía dos problemas:
> no se podía recalcular para validarlo, y el texto podía contradecir a los `datos`
> sin que nada lo notara — que es justo el error que hay que cazar. (De hecho ya
> pasaba: 34 × 0,1 × 260 da 884, no 884,4.)
>
> Ahora el cálculo se guarda como **pasos con expresión**, y el texto que ve el
> jugador se *genera* desde ahí. Una sola fuente para la matemática.

```json
{
  "id": "margen-soja-001",
  "categoria": "margen_bruto",
  "dificultad": 1,
  "verificado": false,
  "enunciado": "Sembrás 60 ha de soja. Rinde esperado: 34 qq/ha. Precio: USD 260/tn. Costos directos: USD 420/ha.",
  "datos": {
    "hectareas": 60,
    "rinde_qq_ha": 34,
    "precio_usd_tn": 260,
    "costos_directos_usd_ha": 420
  },
  "pregunta": "¿Es buen negocio?",
  "etiquetas": ["Buen negocio", "Ajustado", "Mal negocio"],
  "pasos": [
    { "clave": "ingreso_ha", "etiqueta": "Ingreso por ha", "expr": "rinde_qq_ha * 0.1 * precio_usd_tn", "unidad": "USD/ha", "decimales": 0 },
    { "clave": "margen_ha",  "etiqueta": "Margen bruto por ha", "expr": "ingreso_ha - costos_directos_usd_ha", "unidad": "USD/ha", "decimales": 0 },
    { "clave": "margen_pct", "etiqueta": "Margen sobre costos", "expr": "margen_ha / costos_directos_usd_ha * 100", "unidad": "%", "decimales": 0 }
  ],
  "criterio": { "metrica": "margen_pct", "bueno_min": 15, "malo_max": 0 },
  "respuesta_correcta": "bueno",
  "explicacion": "El truco es el 0,1: 34 qq/ha son 3,4 tn/ha..."
}
```

- **`pasos`** — el cálculo, en orden. Cada `expr` puede usar las claves de `datos`
  y las `clave` de los pasos anteriores; sólo se permite aritmética y nombres de
  variable. `decimales` es con cuántos se muestra ese paso.
- **`criterio`** — hace el veredicto **derivable**: `metrica >= bueno_min` → bueno,
  `metrica <= malo_max` → malo, en el medio → ajustado. `respuesta_correcta` se
  sigue declarando a mano, pero el validador la recalcula y avisa si no coinciden.
  Es una banda de un solo lado: `bueno_min` tiene que ser mayor que `malo_max`.
- **`etiquetas`** — opcional, los 3 botones en orden bueno/ajustado/malo. Existe
  porque en las cartas de conversión de unidades "buen negocio" no significa nada:
  ahí van `["Cierra", "Cerca", "No cierra"]`. La UI y el puntaje siguen teniendo
  un solo código.
- **`verificado`** — `false` mientras los números sean placeholders plausibles y no
  datos de mercado revisados (ver §6).

Este esquema es el contrato entre contenido y motor. Todo lo demás (UI, lógica de
puntaje) lee de acá. La definición formal está en `content/schema.json`.

## 6. Contenido — categorías a cubrir en el MVP (mínimo 8 escenarios por categoría, ~50 total)

1. Margen bruto agrícola (soja, maíz, trigo)
2. Punto de equilibrio (cuántos qq necesito vender para cubrir costo de arrendamiento + insumos)
3. Comprar maquinaria vs. contratar servicio (contratista)
4. Alquilar campo vs. comprar (payback a N años)
5. Efecto de flete/retenciones sobre el margen neto
6. Conversión de unidades bajo presión de tiempo (qq↔tn, ha↔m², USD↔ARS con tipo de cambio dado)
7. Financiamiento: contado vs. cuota con interés (interés simple aplicado a insumos)
8. Ganadería básica (costo de recría vs. venta, kg producidos vs. costo de alimento)

**Nota:** los números de los ejemplos de este documento son placeholders razonables, no datos de mercado verificados. Antes de generar el lote completo de escenarios conviene validar rangos reales (rindes, precios, costos de arrendamiento actuales).

## 7. Stack técnico

- **Frontend:** HTML + CSS + JS vanilla (o Alpine.js si hace falta reactividad — evitar frameworks pesados para un proyecto personal instalable).
- **Instalable como PWA:** `manifest.json` + `service worker` básico (cache de assets + JSON de contenido, para que funcione sin señal en el campo).
- **Guardado:** `localStorage` (progreso, XP por categoría, historial de racha).
- **Contenido:** `content/scenarios.json`, validado contra un JSON Schema.
- **Herramientas de desarrollo (no para el jugador):**
  - `tools/validar.html`: valida que cada escenario cumpla el schema, recalcula el cálculo declarado y vuelve a derivar el veredicto desde `criterio` para compararlo con `respuesta_correcta`.
  - `tools/servir.ps1`: server estático local (el juego necesita `http://`, no anda sobre `file://`).
  - `tools/iconos.ps1`: genera los PNG del manifest.

> **Revisión v0.2 (implementado).** El borrador pedía estas herramientas en Python.
> En la máquina donde se desarrolla no hay Python ni Node instalados, así que se
> hicieron en el navegador y en PowerShell, que no requieren instalar nada.
> El validador en el navegador tiene además una ventaja propia: usa exactamente el
> mismo `src/calculo.js` que el juego, así que no puede aprobar un escenario que el
> juego resolvería distinto.
>
> `generate_scenarios.py` no se construyó: con 15 escenarios escritos a mano no
> paga, y conviene definirlo cuando esté claro qué variantes valen la pena.

## 8. Estructura de carpetas

> **Revisión v0.2 (implementado).** `index.html`, `manifest.json` y `sw.js` quedaron
> en la **raíz**, no dentro de `src/`. Un service worker sólo intercepta pedidos
> dentro de su propia carpeta: desde `/src/sw.js` no podría cachear
> `/content/scenarios.json` y el juego no funcionaría sin señal, que es justo lo que
> pide §7. Desde la raíz el scope es `/` y cubre todo. La separación
> código / contenido / herramientas se mantiene.

```
numeros-gruesos/
├── README.md
├── SPEC.md
├── index.html
├── manifest.json
├── sw.js
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
├── src/
│   ├── app.js         juego: tiempo, puntaje, progresión, guardado, pantallas
│   ├── calculo.js     matemática: evalúa los pasos y deriva el veredicto
│   └── style.css
├── content/
│   ├── scenarios.json
│   └── schema.json
└── tools/
    ├── servir.ps1
    ├── validar.html
    └── iconos.ps1
```

## 9. Roadmap para Claude Code

- ~~**M1 — Esqueleto jugable:** PWA instalable, 10 escenarios, loop completo (carta → respuesta → confianza → resultado → puntaje).~~ **Hecho.**
- ~~**M2 — Progresión:** las 6 categorías de habilidad, XP, racha, pantalla de progreso, guardado en localStorage.~~ **Hecho** (más calibración por nivel de confianza, que sale gratis del historial).
- **M3 — Contenido completo:** ~50 escenarios balanceados por categoría y dificultad. Hoy hay **15**, uno o más por categoría. Antes de escribir los 35 que faltan conviene (a) jugar los 15 un tiempo para ver si el loop engancha y si el puntaje está bien calibrado, y (b) verificar los números contra datos reales de mercado — ver §6.
- **M4 (opcional, después de jugarlo un tiempo):** capa narrativa/campaña.

## 10. Fuera de alcance (por ahora)

Multiplayer, cuentas/login, monetización, gráficos/arte más allá de UI limpia funcional, sonido.
