<#
  iconos.ps1 - Genera los PNG que pide manifest.json.

  Esta maquina no tiene Python ni un editor de imagenes, asi que los iconos se
  dibujan con System.Drawing, que viene con Windows. Es la unica definicion del
  icono: si lo queres cambiar, se cambia aca y se vuelve a correr.

  Uso:
      powershell -NoProfile -ExecutionPolicy Bypass -File tools\iconos.ps1

  Despues de correrlo, subi la VERSION de sw.js para que se recacheen.
#>

Add-Type -AssemblyName System.Drawing

$Destino = Join-Path (Get-Item (Join-Path $PSScriptRoot '..')).FullName 'icons'
if (-not (Test-Path $Destino)) { New-Item -ItemType Directory -Path $Destino | Out-Null }

function Rectangulo-Redondeado([int]$x, [int]$y, [int]$w, [int]$h, [int]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc(($x + $w - $d), $y, $d, $d, 270, 90)
  $p.AddArc(($x + $w - $d), ($y + $h - $d), $d, $d, 0, 90)
  $p.AddArc($x, ($y + $h - $d), $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Dibujar([int]$S, [string]$archivo) {
  $bmp = New-Object System.Drawing.Bitmap($S, $S)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  $u = $S / 100.0

  # Fondo a sangre: el 20% del borde lo puede recortar Android (maskable).
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml('#0f1115'))

  # Panel interior, dentro de la zona segura.
  $m = [int]($S * 0.1)
  $lado = $S - $m * 2
  $panel = Rectangulo-Redondeado $m $m $lado $lado ([int](14 * $u))
  $g.FillPath((New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#171a21'))), $panel)

  # "NG"
  $fuente = New-Object System.Drawing.Font('Segoe UI', (38 * $u), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $formato = New-Object System.Drawing.StringFormat
  $formato.Alignment = [System.Drawing.StringAlignment]::Center
  $formato.LineAlignment = [System.Drawing.StringAlignment]::Center
  $caja = New-Object System.Drawing.RectangleF(0, (-4 * $u), $S, $S)
  $g.DrawString('NG', $fuente, (New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#e7ebf0'))), $caja, $formato)

  # Barra de tiempo: dos tercios en verde, como en el juego.
  $bw = $lado * 0.62
  $bh = [int](5 * $u)
  $bx = [int](($S - $bw) / 2)
  $by = [int]($S / 2 + 19 * $u)
  $canal = Rectangulo-Redondeado $bx $by ([int]$bw) $bh ([int]($bh / 2))
  $g.FillPath((New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#272b33'))), $canal)
  $relleno = Rectangulo-Redondeado $bx $by ([int]($bw * 0.66)) $bh ([int]($bh / 2))
  $g.FillPath((New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#3fb950'))), $relleno)

  $ruta = Join-Path $Destino $archivo
  $bmp.Save($ruta, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Host "  $archivo  ($S x $S)" -ForegroundColor Green
}

Write-Host ""
Write-Host "  Generando iconos en $Destino" -ForegroundColor Cyan
Dibujar 192 'icon-192.png'
Dibujar 512 'icon-512.png'
Write-Host ""
