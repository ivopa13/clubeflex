@echo off
REM ==========================================================
REM  SINCRONIZACAO CACAMBAS (projeto "FlexAmbiental")
REM  Rodada leve: apenas base de clientes (CLIENTE do CPlus).
REM  Agendada a cada 5 minutos.
REM
REM  NAO usa taskkill: mataria a rodada do Flex Fidelidade que
REM  roda no mesmo executavel. A protecao contra sobreposicao
REM  vem da politica IgnoreNew da tarefa agendada.
REM ==========================================================

cd /d "%~dp0"

"%~dp0ClubeFlex.Integrador.exe" --only=FlexAmbiental

exit /b %ERRORLEVEL%
