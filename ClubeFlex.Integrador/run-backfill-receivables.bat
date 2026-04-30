@echo off
REM Backfill de títulos a receber: reenvia TODOS os títulos ignorando checksum
REM Use uma única vez para corrigir inadimplência fantasma (títulos cancelados/pagos
REM no ERP que ficaram com status='A' no Financeiro).
REM
REM Após rodar este script com sucesso, volte a usar run-sync.bat normal.

taskkill /F /IM "ClubeFlex.Integrador.exe" >nul 2>&1
timeout /t 2 /nobreak >nul

cd /d "%~dp0"

echo =====================================================
echo  BACKFILL DE TITULOS - IGNORA CHECKSUM
echo  Reenvia TODOS os titulos para o Financeiro
echo =====================================================
echo.

"%~dp0ClubeFlex.Integrador.exe" --backfill-receivables --interactive

exit /b %ERRORLEVEL%
