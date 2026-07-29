@echo off
REM Instala as tarefas agendadas do integrador no Windows
REM Execute como Administrador
REM
REM Cria DUAS tarefas separadas, porque as cargas sao muito diferentes:
REM   - FlexIntegradorCacambas: leve (so clientes)      -> a cada 5 min
REM   - FlexIntegradorFidelidade: pesada (faturas etc.) -> a cada 60 min
REM
REM As tarefas usam a politica padrao IgnoreNew: se a rodada anterior
REM ainda estiver executando, a nova e descartada em vez de sobrepor.

echo ====================================
echo Integrador Flex - Instalador de Tarefas
echo ====================================
echo.

set CACAMBA_SCRIPT=%~dp0run-sync-cacamba.bat
set FIDELIDADE_SCRIPT=%~dp0run-sync-clubeflex.bat
set EXE_PATH=%~dp0ClubeFlex.Integrador.exe

if not exist "%EXE_PATH%" (
    echo ERRO: Executavel nao encontrado em: %EXE_PATH%
    pause
    exit /b 1
)
if not exist "%CACAMBA_SCRIPT%" (
    echo ERRO: run-sync-cacamba.bat nao encontrado
    pause
    exit /b 1
)
if not exist "%FIDELIDADE_SCRIPT%" (
    echo ERRO: run-sync-clubeflex.bat nao encontrado
    pause
    exit /b 1
)

set /p INT_CACAMBA="Intervalo das CACAMBAS em minutos (padrao: 5): "
if "%INT_CACAMBA%"=="" set INT_CACAMBA=5

set /p INT_FIDELIDADE="Intervalo do FLEX FIDELIDADE em minutos (padrao: 60): "
if "%INT_FIDELIDADE%"=="" set INT_FIDELIDADE=60

echo.
echo Removendo tarefa antiga unica (se existir)...
schtasks /Delete /TN "ClubeFlexSync" /F >nul 2>&1
schtasks /Delete /TN "FlexIntegradorCacambas" /F >nul 2>&1
schtasks /Delete /TN "FlexIntegradorFidelidade" /F >nul 2>&1

echo Criando tarefa FlexIntegradorCacambas (a cada %INT_CACAMBA% min)...
schtasks /Create /TN "FlexIntegradorCacambas" /TR "\"%CACAMBA_SCRIPT%\"" /SC MINUTE /MO %INT_CACAMBA% /RL HIGHEST /F
if %ERRORLEVEL% neq 0 goto :erro

echo Criando tarefa FlexIntegradorFidelidade (a cada %INT_FIDELIDADE% min)...
schtasks /Create /TN "FlexIntegradorFidelidade" /TR "\"%FIDELIDADE_SCRIPT%\"" /SC MINUTE /MO %INT_FIDELIDADE% /RL HIGHEST /F
if %ERRORLEVEL% neq 0 goto :erro

echo.
echo ====================================
echo Tarefas criadas com sucesso!
echo ====================================
echo   Cacambas .....: a cada %INT_CACAMBA% minuto(s)
echo   Fidelidade ...: a cada %INT_FIDELIDADE% minuto(s)
echo.
echo Comandos uteis:
echo   schtasks /Run    /TN "FlexIntegradorCacambas"
echo   schtasks /Query  /TN "FlexIntegradorFidelidade" /V /FO LIST
echo   schtasks /Delete /TN "FlexIntegradorCacambas" /F
echo.
pause
exit /b 0

:erro
echo.
echo ERRO: Falha ao criar tarefa agendada.
echo Certifique-se de executar este script como Administrador.
echo.
pause
exit /b 1
