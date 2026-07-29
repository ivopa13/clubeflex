@echo off
REM ==========================================================
REM  SINCRONIZACAO FLEX FIDELIDADE (projeto "ClubeFlex")
REM  Rodada pesada: faturas + pagamentos + clientes.
REM  Agendada a cada 60 minutos (era 2x por dia).
REM
REM  NAO usa taskkill: mataria a rodada das Cacambas que roda
REM  no mesmo executavel. A protecao contra sobreposicao vem
REM  da politica IgnoreNew da tarefa agendada.
REM ==========================================================

cd /d "%~dp0"

"%~dp0ClubeFlex.Integrador.exe" --only=ClubeFlex

exit /b %ERRORLEVEL%
