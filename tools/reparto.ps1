<#
  reparto.ps1 - Muestra como estan repartidas las respuestas de las cartas.

  Por que existe: el validador chequea que cada carta este bien, pero no ve un
  problema que aparece solo mirando el conjunto. Si en una categoria casi todas
  las cartas dan "bueno", el jugador puede acertar sin calcular nada, y esa
  categoria deja de entrenar.

  La regla practica: que ninguna categoria pase de ~50-55% en su respuesta mas
  frecuente, y que las tres respuestas existan en todas.

  Uso:
      powershell -NoProfile -File tools\reparto.ps1
#>

$ruta = Join-Path (Get-Item (Join-Path $PSScriptRoot '..')).FullName 'content\scenarios.json'
$escenarios = (Get-Content $ruta -Raw -Encoding UTF8 | ConvertFrom-Json).escenarios
$total = $escenarios.Count

Write-Host ""
Write-Host "  $total cartas" -ForegroundColor Cyan
Write-Host ""

Write-Host "  GLOBAL" -ForegroundColor White
foreach ($g in ($escenarios | Group-Object respuesta_correcta | Sort-Object Name)) {
  $pct = [math]::Round($g.Count / $total * 100)
  Write-Host ("    {0,-10}{1,3}   {2,3}%" -f $g.Name, $g.Count, $pct) -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "  POR CATEGORIA" -ForegroundColor White
Write-Host ("    {0,-22}{1,6}{2,10}{3,6}   {4}" -f 'categoria', 'bueno', 'ajustado', 'malo', 'la mas frecuente') -ForegroundColor DarkGray

foreach ($g in ($escenarios | Group-Object categoria | Sort-Object Name)) {
  $b = @($g.Group | Where-Object respuesta_correcta -eq 'bueno').Count
  $a = @($g.Group | Where-Object respuesta_correcta -eq 'ajustado').Count
  $m = @($g.Group | Where-Object respuesta_correcta -eq 'malo').Count
  $mayor = [math]::Max($b, [math]::Max($a, $m))
  $pct = [math]::Round($mayor / $g.Count * 100)

  # Rojo si adivinar la respuesta mas comun rinde demasiado, o si falta alguna.
  $color = if ($pct -gt 55 -or $b -eq 0 -or $a -eq 0 -or $m -eq 0) { 'Red' } else { 'Green' }
  $nota = if ($b -eq 0 -or $a -eq 0 -or $m -eq 0) { "$pct%  (falta una respuesta)" } else { "$pct%" }

  Write-Host ("    {0,-22}{1,6}{2,10}{3,6}   {4}" -f $g.Name, $b, $a, $m, $nota) -ForegroundColor $color
}
Write-Host ""
