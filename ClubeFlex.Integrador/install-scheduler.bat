@echo off
REM Script para instalar tarefa no Agendador de Tarefas do Windows
REM Execute como Administrador

echo ====================================
echo Clube Flex - Instalador de Tarefa Agendada
echo ====================================
echo.

REM Definir caminho do executável (AJUSTE conforme sua instalação)
set EXE_PATH=%~dp0ClubeFlex.Integrador.exe

REM Verificar se o executável existe
if not exist "%EXE_PATH%" (
    echo ERRO: Executavel nao encontrado em: %EXE_PATH%
    echo Por favor, compile o projeto antes de executar este script
    pause
    exit /b 1
)

echo Executavel encontrado: %EXE_PATH%
echo.

REM Perguntar intervalo de sincronização
set /p INTERVALO="Digite o intervalo de sincronizacao em minutos (padrao: 5): "
if "%INTERVALO%"=="" set INTERVALO=5

echo.
echo Criando tarefa agendada...
echo - Nome: ClubeFlexSync
echo - Intervalo: A cada %INTERVALO% minutos
echo - Caminho: %EXE_PATH%
echo.

REM Remover tarefa existente (se houver)
schtasks /Delete /TN "ClubeFlexSync" /F >nul 2>&1

REM Criar nova tarefa
schtasks /Create /TN "ClubeFlexSync" /TR "\"%EXE_PATH%\"" /SC MINUTE /MO %INTERVALO% /RL HIGHEST /F

if %ERRORLEVEL% equ 0 (
    echo.
    echo ====================================
    echo Tarefa criada com sucesso!
    echo ====================================
    echo.
    echo A sincronizacao sera executada automaticamente a cada %INTERVALO% minutos.
    echo.
    echo Para gerenciar a tarefa, use o Agendador de Tarefas do Windows ou:
    echo   - Iniciar manualmente: schtasks /Run /TN "ClubeFlexSync"
    echo   - Desabilitar: schtasks /Change /TN "ClubeFlexSync" /DISABLE
    echo   - Habilitar: schtasks /Change /TN "ClubeFlexSync" /ENABLE
    echo   - Remover: schtasks /Delete /TN "ClubeFlexSync" /F
    echo.
) else (
    echo.
    echo ERRO: Falha ao criar tarefa agendada
    echo Certifique-se de executar este script como Administrador
    echo.
)

pause
