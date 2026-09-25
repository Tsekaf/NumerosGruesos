<#
  servir.ps1 - Server estatico para desarrollo, sin instalar nada.

  Por que hace falta:
    - El juego carga content/scenarios.json con fetch(), y fetch NO funciona
      sobre file:// (el navegador lo bloquea por CORS).
    - El service worker solo se registra en un "origen seguro": https o
      localhost. file:// no cuenta.

  Esta maquina no tiene Python ni Node, asi que el server lo levanta PowerShell
  con System.Net.HttpListener, que viene con Windows.

  Uso:
      powershell -NoProfile -ExecutionPolicy Bypass -File tools\servir.ps1
      powershell -NoProfile -ExecutionPolicy Bypass -File tools\servir.ps1 -Port 9000

  Ctrl+C para cortarlo.
#>

param(
  [int]$Port = 8080
)

# La raiz del sitio es la carpeta del proyecto (el padre de tools\).
$Raiz = (Get-Item (Join-Path $PSScriptRoot '..')).FullName

$TiposMime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.png'  = 'image/png'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
  '.webmanifest' = 'application/manifest+json'
  '.md'   = 'text/markdown; charset=utf-8'
  '.txt'  = 'text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")

try {
  $listener.Start()
} catch {
  Write-Host ""
  Write-Host "No se pudo abrir el puerto $Port." -ForegroundColor Red
  Write-Host "Causas tipicas: ya hay algo escuchando ahi (probá -Port 9000)," -ForegroundColor Yellow
  Write-Host "o Windows pide elevacion para registrar el prefijo." -ForegroundColor Yellow
  Write-Host "Detalle: $($_.Exception.Message)" -ForegroundColor DarkGray
  exit 1
}

Write-Host ""
Write-Host "  Numeros Gruesos - server de desarrollo" -ForegroundColor Cyan
Write-Host "  raiz : $Raiz" -ForegroundColor DarkGray
Write-Host "  juego: http://localhost:$Port/" -ForegroundColor Green
Write-Host "  valid: http://localhost:$Port/tools/validar.html" -ForegroundColor Green
Write-Host "  icono: http://localhost:$Port/tools/icono.html" -ForegroundColor Green
Write-Host "  (Ctrl+C para cortar)" -ForegroundColor DarkGray
Write-Host ""

try {
  while ($listener.IsListening) {
    $contexto = $listener.GetContext()
    $pedido   = $contexto.Request
    $respuesta = $contexto.Response
    $metodo   = $pedido.HttpMethod
    $rutaRel  = 'index.html'
    $estado   = 500

    # Un pedido raro (HEAD, una conexion cortada a mitad, un cliente que se va)
    # no tiene que voltear el server: cada uno se atiende aislado.
    try {
      $rutaRel = [System.Uri]::UnescapeDataString($pedido.Url.LocalPath).TrimStart('/')
      if ($rutaRel -eq '') { $rutaRel = 'index.html' }
      $rutaAbs = Join-Path $Raiz ($rutaRel -replace '/', '\')

      # No servimos nada de afuera de la raiz (evita ../../ en la URL).
      $normalizada = [System.IO.Path]::GetFullPath($rutaAbs)
      $dentro = $normalizada.StartsWith($Raiz, [System.StringComparison]::OrdinalIgnoreCase)

      if ($dentro -and (Test-Path -LiteralPath $normalizada -PathType Leaf)) {
        $ext = [System.IO.Path]::GetExtension($normalizada).ToLower()
        $mime = $TiposMime[$ext]
        if (-not $mime) { $mime = 'application/octet-stream' }

        $bytes = [System.IO.File]::ReadAllBytes($normalizada)
        $respuesta.ContentType = $mime
        # Sin cache del lado del server: queremos ver los cambios al recargar.
        $respuesta.Headers.Add('Cache-Control', 'no-store')
        $estado = 200
      } else {
        $respuesta.StatusCode = 404
        $bytes = [System.Text.Encoding]::UTF8.GetBytes("404 - no existe: /$rutaRel")
        $respuesta.ContentType = 'text/plain; charset=utf-8'
        $estado = 404
      }

      $respuesta.ContentLength64 = $bytes.Length
      # A un HEAD se le contestan los headers y nada mas: escribirle un cuerpo
      # es lo que rompia el server (ProtocolViolationException).
      if ($metodo -ne 'HEAD') {
        $respuesta.OutputStream.Write($bytes, 0, $bytes.Length)
      }
    } catch {
      $estado = 500
      Write-Host "  !! $metodo /$rutaRel -> $($_.Exception.Message)" -ForegroundColor Red
    } finally {
      try { $respuesta.OutputStream.Close() } catch { }
    }

    $color = if ($estado -eq 200) { 'DarkGray' } elseif ($estado -eq 404) { 'Yellow' } else { 'Red' }
    Write-Host "  $estado  $metodo /$rutaRel" -ForegroundColor $color
  }
} finally {
  $listener.Stop()
  $listener.Close()
  Write-Host "`n  Server cortado." -ForegroundColor DarkGray
}
