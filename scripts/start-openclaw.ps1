docker rm -f openclaw

docker run -d --name openclaw `
  --restart unless-stopped `
  --add-host=host.docker.internal:host-gateway `
  -p 18789:18789 `
  -p 18790:18790 `
  openclaw:local

Write-Host "OpenClaw container started."
Write-Host "Next: copy config/openclaw.template.json to config/openclaw.json, fill API key and token, then run scripts/copy-config-and-restart.ps1"
