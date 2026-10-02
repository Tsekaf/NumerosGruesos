# Hoja de ruta y estado

Este archivo alcanza para retomar el proyecto sin ningún otro contexto.
Última actualización: 26/9/2026.

---

## Dónde está parado

| | |
|---|---|
| Escenarios (cartas) | **50** |
| Fichas de teoría | **30** |
| Preguntas de repaso | **125** |
| Cartas con ficha enlazada | 47 de 50 |
| Validador | 0 errores |

Hitos de [SPEC.md](SPEC.md): **M1, M2 y M3 completos**, más la repetición
espaciada, que no estaba en la spec original. M4 (campaña narrativa) sin empezar.

### Para levantarlo

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File tools\servir.ps1
```

- Juego: <http://localhost:8080>
- Validador: <http://localhost:8080/tools/validar.html> — **tiene que dar 0 errores
  antes de dar por buena cualquier carta o ficha nueva.**

No hay Python ni Node en esta máquina: todo el tooling es PowerShell o corre en
el navegador. No proponer scripts que necesiten instalar un runtime.

---

## Decisiones ya tomadas (no volver a discutirlas)

Están explicadas en detalle en [README.md](README.md) y [SPEC.md](SPEC.md). El
resumen de lo que no hay que rediscutir:

1. **La matemática vive en un solo lugar.** Los escenarios guardan `pasos` con
   expresiones, no resultados escritos a mano, y el texto que ve el jugador se
   genera desde ahí. `src/calculo.js` lo usan el juego y el validador, así que
   el validador no puede aprobar algo que el juego resuelve distinto.
2. **El veredicto es derivable.** `criterio` define cómo se pasa de la métrica al
   veredicto; `respuesta_correcta` se declara a mano y el validador compara.
3. **`index.html`, `manifest.json` y `sw.js` van en la raíz.** Un service worker
   sólo intercepta dentro de su carpeta: desde `/src/` no cubriría `/content/`.
4. **El service worker es mixto:** html/js/json por red primero (para que una
   versión nueva llegue al celu), estáticos cache-first (para que abra al
   instante). En `localhost` todo va por red.
5. **Lo volátil se cuenta sin números.** En vacunas, categorías de hacienda,
   impuestos y fechas de siembra se explica *qué existe y por qué*, nunca el
   número o la fecha, que caducan. Cada ficha lleva `confianza`, `volatilidad` y
   `verificar_con`.
6. **Sin límite de tiempo = modo estudio:** suma XP pero no puntos ni racha. Si
   puntuara igual que con reloj, los tiempos no significarían nada.
7. **El repaso es autoevaluación**, no multiple choice: reconocer la opción
   correcta y acordarse no son lo mismo, y lo segundo es lo que se borra.

---

## Lo hecho

- ~~**Conectar fichas ↔ cartas.**~~ Al errar aparece un botón a la ficha que lo
  explica, y volvés a la carta, no al índice.
- ~~**Ganadería: 6 fichas.**~~ Estado corporal, carga animal y EV, toros,
  parásitos, agua, cría/invernada/ciclo completo.
- ~~**Cartas de ganadería: 9 escenarios.**~~ Desbaste, costo del kilo producido,
  precio de reposición, carga y equilibrio, criar vs. comprar, esperar o vender,
  tasa de destete, conversión de tropa, suplementación.
- ~~**Agricultura: 9 fichas.**~~ Rotación, barbecho, siembra directa,
  fertilización, malezas resistentes, calidad de grano, máquina propia vs.
  contratista, arrendamiento y costo por hectárea.
- ~~**Impositivo: 7 fichas.**~~ Mapa general, IVA, retenciones, Ingresos Brutos,
  Inmobiliario Rural, Ganancias y condición fiscal. Sin cifras, a propósito.
- ~~**M3: 26 cartas nuevas.**~~ De 24 a 50, con 8 o más por categoría y el
  reparto de respuestas balanceado para que adivinar no pague.
- ~~**Repetición espaciada.**~~ Calendario por pregunta, tope de 20 por sesión,
  y el repaso del día en la portada con el contador a la vista.

---

## Los tramos, del más rápido al más lento

Están todos hechos. Se dejan listados porque explican por qué cada cosa está
como está.

| # | Tramo | Tamaño | Qué produce |
|---|---|---|---|
| ~~4~~ | ~~Agricultura: fichas~~ | hecho | 9 fichas |
| ~~5~~ | ~~Impositivo, en modo mapa~~ | hecho | 7 fichas, sin una sola cifra |
| ~~6~~ | ~~M3: llegar a ~50 cartas~~ | hecho | 50 cartas, 8+ por categoría |
| ~~7~~ | ~~Repetición espaciada~~ | hecho | calendario por pregunta, tope de 20 |

Una *tanda* es un tramo de trabajo que termina con algo probado y andando. Lo que
importa es el orden relativo, no una cantidad de horas.

### ~~4. Agricultura: fichas~~ · hecho

Nueve fichas: rotación, barbecho, siembra directa, fertilización, malezas
resistentes, calidad de grano y descuentos, máquina propia vs. contratista,
arrendamiento y costo por hectárea.

Quedan tres cartas sin ficha, y son las que marcan los temas que todavía faltan:
`conversion-flete-003` (flete y logística), `roi-embolsadora-001` (almacenaje y
silobolsa) y `roi-riego-002` (riego). Son buenos candidatos para la próxima tanda
de contenido.

### ~~5. Impositivo, en modo mapa~~ · hecho

Siete fichas: el mapa general, IVA y el saldo a favor, retenciones (derechos de
exportación vs. retenciones impositivas), Ingresos Brutos, Inmobiliario Rural,
Ganancias y la existencia de mercadería sin vender, y monotributo vs.
responsable inscripto.

Todas con `confianza: baja` y sin una sola alícuota, mínimo ni fecha. Son un mapa
para saber qué preguntarle al contador, no una guía para decidir.

### ~~6. M3: llegar a ~50 cartas~~ · hecho

50 cartas, con 8 o más por categoría como pedía SPEC.md §6. Cobertura final:
margen bruto 9, punto de equilibrio 8, costo unitario 8, ROI 8, comprar vs.
alquilar 8, conversión 9.

Al completarlo apareció algo que el validador no mira: **dos categorías donde
ninguna carta daba "malo"**. Tirando siempre a "bueno" se acertaba el 67% en
margen bruto y el 75% en ROI, o sea que el jugador podía puntuar sin calcular.
Se dieron vuelta cuatro cartas. El reparto global quedó 36% bueno, 34% ajustado,
30% malo, y ninguna categoría pasa del 56% en su respuesta más frecuente.

**Al agregar cartas conviene revisar ese reparto**, porque es fácil escribir de
más en una dirección sin darse cuenta:

```bash
powershell -NoProfile -File tools/reparto.ps1
```

### Lo que falta calibrar con uso real

El puntaje, el tiempo por carta y la dificultad asignada a cada escenario se
fijaron a ojo. Todo eso se toca sin reescribir contenido: el puntaje y los
tiempos están en las constantes al principio de `src/app.js`, y la dificultad es
un campo de cada escenario. Conviene ajustarlo después de jugar un tiempo.

### ~~7. Repetición espaciada~~ · hecho

Cada pregunta tiene su propio calendario, en `src/srs.js`. Acertarla la aleja;
fallarla la trae de vuelta enseguida. Así el repaso se concentra sólo en lo que
está por borrarse, en vez de hacerte revisar de nuevo lo que ya sabés.

Tres decisiones que conviene conocer antes de tocarlo:

- **Escalera fija (Leitner), no SM-2.** Los intervalos son
  `[0, 1, 3, 7, 16, 35, 75, 160]` días: acertar sube un escalón, fallar vuelve al
  primero. Para 125 preguntas la diferencia práctica contra un algoritmo con
  factores de facilidad es mínima, y esto se explica en una línea.
- **Tope de 20 preguntas por sesión.** Existe para el caso que motivó todo:
  volver después de meses. Sin tope te encontrás las 125 vencidas de golpe, que
  es la forma más rápida de no hacer ninguna. Probado: con tres meses sin abrir
  la app, la sesión sigue dando 20, de 14 fichas distintas.
- **La clave de cada pregunta es un hash de su texto**, no su posición en la
  ficha. Si fuera la posición, agregar una pregunta en el medio correría todas
  las demás y el progreso quedaría asignado a la pregunta equivocada. Con el
  texto, reordenar no rompe nada y editar una pregunta la trata como nueva, que
  es lo correcto.

La pregunta fallada además vuelve al final de esa misma cola, para no terminar
la sesión con el último recuerdo de haberla errado.

El repaso por ficha sigue existiendo para estudiar un tema puntual, y también
alimenta el calendario.

---

## Pendientes que no son míos

1. **Verificar los números.** Ninguna carta ni ficha tiene `verificado: true`.
   Los valores son rangos plausibles, no datos de mercado chequeados. Al revisar
   uno, poner `"verificado": true` y el validador deja de marcarlo.
   Las cartas de ganadería son las más fáciles de corregir primero.
2. **Identidad de git.** Los dos repos (`numeros-gruesos` y `la-hora-robada`)
   están inicializados en `main` con todo en escena y **0 commits**, esperando
   `user.name` y `user.email`. Conviene el alias noreply de GitHub para no
   exponer el mail real en un repo público.
3. **Al subir por la web de GitHub:** el selector de archivos no puede tomar
   carpetas y aplana todo. Hay que arrastrar desde el Explorador, con
   *Vista → Elementos ocultos* activado, si no se pierden `.gitignore`,
   `.gitattributes` y `.claude/`.

---

## Recordatorio al tocar contenido

Al cambiar cualquier archivo de `ASSETS` en `sw.js`, subir la constante
`VERSION` (hoy `ng-v11`). Es lo que borra el cache viejo en el `activate`; sin
eso, un celu que ya tiene la app instalada puede seguir con la versión anterior.
