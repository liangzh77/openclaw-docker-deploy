#!/bin/sh
# Usage: call-peer.sh <container-name> <token> <message>
PEER_HOST="$1"
PEER_TOKEN="$2"
MESSAGE="$3"
IDEM_KEY="peer-$(date +%s)-$$"

# Resolve container name to IP (cut avoids awk quoting issues)
PEER_IP=$(getent hosts "$PEER_HOST" | cut -d' ' -f1)
if [ -z "$PEER_IP" ]; then
  echo "ERROR: Cannot resolve $PEER_HOST" >&2
  exit 1
fi

# JSON-escape the message
JSON_MSG=$(node -e "process.stdout.write(JSON.stringify(process.argv[1]))" "$MESSAGE")

cd /app
export OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1
exec node openclaw.mjs gateway call agent \
  --url "ws://${PEER_IP}:18789/ws" \
  --token "$PEER_TOKEN" \
  --json \
  --expect-final \
  --timeout 120000 \
  --params "{\"message\":${JSON_MSG},\"idempotencyKey\":\"${IDEM_KEY}\",\"sessionId\":\"peer-comm\"}"
