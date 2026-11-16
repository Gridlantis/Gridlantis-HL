#!/bin/sh
# Install the Discord bot agent on a runit box whose bots live in /opt/bots,
# run as the bots user and listening only on the tailnet IP, then check it.
# Usage: tools/bots/deploy-agent.sh <ip>
set -e
IP=${1:?usage: tools/bots/deploy-agent.sh <ip>}
cd "$(dirname "$0")/../.."
ssh root@"$IP" "mkdir -p /opt/openhl-bots-agent /etc/sv/openhl-bots-agent && cat > /opt/openhl-bots-agent/discord-bots.js" < src/domains/discord-bots.js
ssh root@"$IP" "cat > /etc/sv/openhl-bots-agent/run && chmod +x /etc/sv/openhl-bots-agent/run && ln -sfn /etc/sv/openhl-bots-agent /etc/runit/runsvdir/default/openhl-bots-agent && sleep 8 && sv restart openhl-bots-agent && sleep 2 && sv status openhl-bots-agent" <<RUN
#!/bin/sh
exec chpst -u bots:bots env DISCORD_BOTS_DIR=/opt/bots BOTS_AGENT_HOST=$IP BOTS_AGENT_PORT=4610 node /opt/openhl-bots-agent/discord-bots.js >> /opt/bots/logs/openhl-bots-agent.log 2>&1
RUN
curl -s --max-time 5 "http://$IP:4610/bots"; echo
