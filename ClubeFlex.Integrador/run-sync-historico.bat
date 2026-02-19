@echo off
REM ==========================================================
REM  SINCRONIZAÇÃO HISTÓRICA COMPLETA
REM  Use este script UMA VEZ para sincronizar todos os
REM  títulos/faturas/pagamentos históricos sem filtro de data.
REM
REM  ATENÇÃO: Pode demorar muito tempo dependendo do volume.
REM  Após a primeira execução histórica, volte a usar run-sync.bat
REM ==========================================================

cd /d "%~dp0"

echo.
echo ================================================
echo   MODO HISTORICO COMPLETO - SEM FILTRO DE DATA
echo ================================================
echo.
echo Este modo buscara TODOS os registros do ERP
echo independente da data. Use apenas uma vez.
echo.
echo Pressione CTRL+C para cancelar ou qualquer tecla para continuar...
pause > nul

REM Executar em modo histórico (--full-history remove o filtro de data)
"%~dp0ClubeFlex.Integrador.exe" --full-history --interactive

echo.
echo Sincronizacao historica concluida!
pause
