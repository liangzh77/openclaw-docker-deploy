docker exec openclaw sh -lc "mkdir -p /home/node/.openclaw"
docker cp .\config\openclaw.json openclaw:/home/node/.openclaw/openclaw.json
docker restart openclaw
Write-Host "OpenClaw restarted."
Write-Host "Open: http://127.0.0.1:18789/#token=<YOUR_OPENCLAW_TOKEN>"
