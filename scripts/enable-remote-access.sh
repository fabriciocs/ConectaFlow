#!/usr/bin/env bash
set -euo pipefail

DOMAIN="wa.evomenu.com.br"
EXPECTED_IP="187.77.226.178"
APP_DIR="/opt/WA-AKG"
NGINX_SRC="$APP_DIR/deploy/nginx/wa-evomenu.conf"
NGINX_AVAIL="/etc/nginx/sites-available/wa-evomenu"
NGINX_ENABLED="/etc/nginx/sites-enabled/wa-evomenu"
PM2="/home/evomenu/.nvm/versions/node/v24.15.0/bin/pm2"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="/var/backups/wa-evomenu-$STAMP"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: execute as root (sudo $0)"
  exit 77
fi

echo "[1/9] Preflight"
test -f "$NGINX_SRC"
test -f "$APP_DIR/.env"
test -x "$PM2"
command -v nginx >/dev/null
command -v certbot >/dev/null
mkdir -p "$BACKUP_DIR"

RESOLVED_IP="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}')"
if [ "$RESOLVED_IP" != "$EXPECTED_IP" ]; then
  echo "ERROR: $DOMAIN resolves to '$RESOLVED_IP', expected '$EXPECTED_IP'"
  exit 10
fi
echo "DNS OK: $DOMAIN -> $RESOLVED_IP"

LOCAL_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:43000/ || true)"
if [ "$LOCAL_CODE" != "200" ]; then
  echo "ERROR: app is not healthy on 127.0.0.1:43000 (HTTP $LOCAL_CODE)"
  exit 11
fi
echo "App OK: HTTP 200 on 127.0.0.1:43000"

echo "[2/9] Backup"
cp -a "$APP_DIR/.env" "$BACKUP_DIR/.env"
if [ -e "$NGINX_AVAIL" ]; then
  cp -a "$NGINX_AVAIL" "$BACKUP_DIR/nginx-wa-evomenu"
fi

echo "[3/9] Install Nginx virtual host"
install -o root -g root -m 0644 "$NGINX_SRC" "$NGINX_AVAIL"
ln -sfn "$NGINX_AVAIL" "$NGINX_ENABLED"
nginx -t
systemctl reload nginx

echo "[4/9] Validate HTTP virtual host"
HTTP_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 -H "Host: $DOMAIN" http://127.0.0.1/ || true)"
if [ "$HTTP_CODE" != "200" ]; then
  echo "ERROR: Nginx vhost returned HTTP $HTTP_CODE"
  exit 12
fi
echo "HTTP proxy OK"

echo "[5/9] Issue/install Let's Encrypt certificate"
certbot --nginx -d "$DOMAIN" --redirect --non-interactive

echo "[6/9] Validate Nginx after Certbot"
nginx -t
systemctl reload nginx

echo "[7/9] Switch application canonical URL to HTTPS and loopback bind"
python3 - <<'PY'
from pathlib import Path
p = Path("/opt/WA-AKG/.env")
lines = p.read_text().splitlines()
updates = {
    "BASE_URL": "https://wa.evomenu.com.br",
    "NEXTAUTH_URL": "https://wa.evomenu.com.br",
    "NEXT_PUBLIC_APP_URL": "https://wa.evomenu.com.br",
    "NEXT_PUBLIC_API_URL": "https://wa.evomenu.com.br/api",
    "HOSTNAME": "127.0.0.1",
    "PORT": "43000",
    "APP_NAME": "wa-evomenu",
}
seen = set()
out = []
for line in lines:
    if "=" in line and not line.lstrip().startswith("#"):
        key = line.split("=", 1)[0].strip()
        if key in updates:
            out.append(f'{key}="{updates[key]}"')
            seen.add(key)
            continue
    out.append(line)
for key, value in updates.items():
    if key not in seen:
        out.append(f'{key}="{value}"')
p.write_text("\n".join(out) + "\n")
p.chmod(0o600)
PY
chown evomenu:evomenu "$APP_DIR/.env"

echo "[8/9] Reload PM2 as evomenu"
runuser -u evomenu -- env HOME=/home/evomenu "$PM2" reload "$APP_DIR/ecosystem.config.js" --only wa-evomenu --env production --update-env
runuser -u evomenu -- env HOME=/home/evomenu "$PM2" save
sleep 3

echo "[9/9] Final validation"
LOCAL_HTTPS="$(curl -skS -o /dev/null -w '%{http_code}' --max-time 15 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" || true)"
PUBLIC_HTTPS="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "https://$DOMAIN/" || true)"
AUTH_BOUNDARY="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "https://$DOMAIN/api/sessions" || true)"

echo "HTTPS local-vhost: $LOCAL_HTTPS"
echo "HTTPS public-name: $PUBLIC_HTTPS"
echo "Unauthenticated /api/sessions: $AUTH_BOUNDARY"
echo "Listener 43000:"
ss -ltnp '( sport = :43000 )' || true
echo "Certificate:"
echo | openssl s_client -connect 127.0.0.1:443 -servername "$DOMAIN" 2>/dev/null | openssl x509 -noout -subject -issuer -dates -ext subjectAltName

if [ "$LOCAL_HTTPS" != "200" ] || [ "$PUBLIC_HTTPS" != "200" ] || [ "$AUTH_BOUNDARY" != "401" ]; then
  echo "ERROR: final validation failed. Backup: $BACKUP_DIR"
  exit 20
fi

echo "REMOTE_ACCESS_READY https://$DOMAIN"
echo "Backup: $BACKUP_DIR"
