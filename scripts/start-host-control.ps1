# Host Control API 启动脚本
# 用法：powershell -ExecutionPolicy Bypass -File .\scripts\start-host-control.ps1

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverJs = Join-Path (Split-Path -Parent $scriptDir) "services\host-control\server.js"

if (-not (Test-Path $serverJs)) {
    Write-Error "找不到 $serverJs"
    exit 1
}

Write-Host "启动 Host Control API..." -ForegroundColor Green
Write-Host "服务文件: $serverJs"
Write-Host "按 Ctrl+C 停止"
Write-Host ""

node $serverJs
