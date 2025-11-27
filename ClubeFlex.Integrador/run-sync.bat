@echo off
REM Script para executar sincronização garantindo que não há processo anterior travado
REM Use este script no Agendador de Tarefas ao invés do .exe diretamente

REM Matar qualquer processo anterior do integrador que possa estar travado
taskkill /F /IM "ClubeFlex.Integrador.exe" >nul 2>&1

REM Aguardar 2 segundos para garantir que o processo foi encerrado
timeout /t 2 /nobreak >nul

REM Definir diretório de trabalho como o diretório do script
cd /d "%~dp0"

REM Executar o integrador em modo silencioso (fecha automaticamente)
"%~dp0ClubeFlex.Integrador.exe" --silent

REM Código de saída
exit /b %ERRORLEVEL%
