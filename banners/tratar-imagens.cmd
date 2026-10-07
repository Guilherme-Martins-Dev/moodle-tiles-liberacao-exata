@echo off
rem Trata as fotos (img\psicanalistas e img\temas) e regera os banners.
rem Carrega o .ps1 como bloco de script, o que funciona mesmo com a execucao de scripts .ps1 bloqueada.
rem Uso: duplo clique, ou "banners\tratar-imagens.cmd" na raiz do projeto.
cd /d "%~dp0.."
powershell -NoProfile -Command "& ([scriptblock]::Create((Get-Content -Raw -Encoding UTF8 'banners\tratar-imagens.ps1'))) %*"
node banners\gerar.js
pause
