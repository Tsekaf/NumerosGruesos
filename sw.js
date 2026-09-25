/*
 * sw.js - Service worker de Numeros Gruesos
 *
 * Esta en la RAIZ a proposito. Un service worker solo puede interceptar
 * pedidos dentro de su propio scope, y el scope es la carpeta donde vive el
 * archivo: desde /src/sw.js no podria cachear /content/scenarios.json, y el
 * juego no funcionaria sin señal. Desde la raiz el scope es / y cubre todo.
 *
 * Estrategia: cache-first. Es un juego sin backend, el contenido cambia solo
 * cuando yo edito los archivos, y la prioridad es que abra al instante en el
 * campo sin datos.
 *
 * Al editar cualquier archivo de la lista hay que subir la VERSION, si no el
 * navegador sigue sirviendo la copia vieja.
 */

const VERSION = 'ng-v1';

/*
 * En desarrollo (localhost) invertimos la estrategia: primero la red, y el
 * cache solo como respaldo. Con cache-first, cada edicion de un archivo queda
 * tapada por la copia vieja hasta subir la VERSION, y se pierde media hora
 * debuggeando un bug que ya estaba arreglado. En produccion sigue siendo
 * cache-first, que es lo que hace que el juego abra sin señal.
 */
const DESARROLLO = ['localhost', '127.0.0.1'].indexOf(self.location.hostname) !== -1;

const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'src/app.js',
  'src/calculo.js',
  'src/style.css',
  'content/scenarios.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(VERSION)
      // addAll es todo-o-nada: si falta un archivo no se instala nada. Cacheamos
      // de a uno para que un icono ausente no deje al juego sin offline.
      .then((cache) => Promise.all(
        ASSETS.map((url) => cache.add(url).catch(() => {
          console.warn('[sw] no se pudo cachear:', url);
        }))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves.filter((c) => c !== VERSION).map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  const pedido = ev.request;

  // Solo GET del mismo origen: nada de POST ni de recursos externos.
  if (pedido.method !== 'GET' || new URL(pedido.url).origin !== self.location.origin) return;

  ev.respondWith(DESARROLLO ? redPrimero(pedido) : cachePrimero(pedido));
});

/** Produccion: si esta en cache se sirve al instante y no se toca la red. */
function cachePrimero(pedido) {
  return caches.match(pedido).then((cacheado) => {
    if (cacheado) return cacheado;
    return desdeLaRed(pedido);
  });
}

/** Desarrollo: siempre la version fresca; el cache queda como red de seguridad. */
function redPrimero(pedido) {
  return desdeLaRed(pedido).catch(() => caches.match(pedido).then((cacheado) => {
    if (cacheado) return cacheado;
    throw new Error('sin conexion y sin copia en cache');
  }));
}

function desdeLaRed(pedido) {
  return fetch(pedido)
    .then((respuesta) => {
      // Guardamos lo que pidamos de mas (una navegacion, un icono nuevo).
      if (respuesta.ok && respuesta.type === 'basic') {
        const copia = respuesta.clone();
        caches.open(VERSION).then((cache) => cache.put(pedido, copia));
      }
      return respuesta;
    })
    .catch((e) => {
      // Sin red y sin cache: si es una navegacion, devolvemos el juego.
      if (pedido.mode === 'navigate') {
        return caches.match('index.html').then((r) => r || Promise.reject(e));
      }
      throw e;
    });
}
