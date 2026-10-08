# moodle-tiles-liberacao-exata · Copyright (c) 2026 Guilherme Martins. Todos os direitos reservados.
# Uso, cópia e modificação dependem de autorização por escrito (ver LICENSE).
#
# Trata as fotos dos psicanalistas e as imagens temáticas para os banners.
#
# Uso (na raiz do projeto):
#   powershell -ExecutionPolicy Bypass -File banners\tratar-imagens.ps1
#
# Lê   img\psicanalistas\<slug>.jpg|jpeg|png  (ex.: freud.jpg, anna-freud.png)
#      img\temas\<slug>.jpg|jpeg|png          (ex.: psicopatologia.jpg)
# Gera img\_tratadas\<slug>-arco.jpg  (360×450, retrato em arco)
#      img\_tratadas\<slug>-med.jpg   (120×120, medalhão)
# Tudo em escala de cinza: o tom do núcleo é aplicado no banner (duotone via CSS).
# Depois rode: node banners\gerar.js

param([string]$Origem, [string]$Destino)

# Pela .cmd (bloco de script) $PSScriptRoot fica vazio: nesse caso, a raiz é a pasta atual.
$raiz = if ($PSScriptRoot) { Join-Path $PSScriptRoot '..' } else { (Get-Location).Path }
if (-not $Origem) { $Origem = Join-Path $raiz 'img' }
if (-not $Destino) { $Destino = Join-Path $raiz 'img\_tratadas' }

Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $Destino | Out-Null

$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$qualidade = New-Object System.Drawing.Imaging.EncoderParameters 1
$qualidade.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 80L

# Matriz de luminância (escala de cinza) com leve ganho de contraste.
$c = 1.08; $o = -0.03
$cinza = New-Object System.Drawing.Imaging.ColorMatrix (,[single[][]]@(
  [single[]]@((0.299*$c), (0.299*$c), (0.299*$c), 0, 0),
  [single[]]@((0.587*$c), (0.587*$c), (0.587*$c), 0, 0),
  [single[]]@((0.114*$c), (0.114*$c), (0.114*$c), 0, 0),
  [single[]]@(0, 0, 0, 1, 0),
  [single[]]@($o, $o, $o, 0, 1)
))
$atributos = New-Object System.Drawing.Imaging.ImageAttributes
$atributos.SetColorMatrix($cinza)

# Recorta na proporção alvo (viés para o alto da foto, onde costuma estar o rosto) e salva em JPEG.
function Salvar($img, [int]$w, [int]$h, [double]$viesTopo, [string]$arquivo) {
  $alvo = $w / $h
  if ($img.Width / $img.Height -gt $alvo) {
    $ch = $img.Height; $cw = [int]($ch * $alvo); $cx = [int](($img.Width - $cw) / 2); $cy = 0
  } else {
    $cw = $img.Width; $ch = [int]($cw / $alvo); $cx = 0; $cy = [int](($img.Height - $ch) * $viesTopo)
  }
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'HighQuality'; $g.PixelOffsetMode = 'HighQuality'
  $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $w, $h), $cx, $cy, $cw, $ch, [System.Drawing.GraphicsUnit]::Pixel, $atributos)
  $g.Dispose()
  $bmp.Save($arquivo, $jpeg, $qualidade)
  $bmp.Dispose()
}

$total = 0
foreach ($pasta in @('psicanalistas', 'temas')) {
  $dir = Join-Path $Origem $pasta
  if (-not (Test-Path $dir)) { continue }
  Get-ChildItem $dir -File | Where-Object { $_.Extension -match '^\.(jpe?g|png)$' } | ForEach-Object {
    $slug = $_.BaseName.ToLower()
    $img = [System.Drawing.Image]::FromFile($_.FullName)
    try {
      if ($img.Width -lt 600) { Write-Warning "$($_.Name): $($img.Width)px de largura (recomendado ≥ 600px)" }
      Salvar $img 360 450 0.2 (Join-Path $Destino "$slug-arco.jpg")
      Salvar $img 120 120 0.15 (Join-Path $Destino "$slug-med.jpg")
      $total++
      Write-Host "ok  $pasta\$($_.Name) -> $slug-arco.jpg, $slug-med.jpg"
    } finally { $img.Dispose() }
  }
}
Write-Host "$total imagem(ns) tratada(s) em $Destino. Agora rode: node banners\gerar.js"
