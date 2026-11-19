#!/usr/bin/env bash
set -Eeuo pipefail
# Ubuntu/Debian; root. Exemplo:
# sudo ARCHIVE=/home/user/omniroute-state-xxx.tar.gz bash 02-install-linux.sh
APP_DIR="${APP_DIR:-/opt/omniroute}"
APP_USER="${APP_USER:-omniroute}"
PORT="${PORT:-20128}"
BRANCH="${BRANCH:-release/v3.8.52}"
REPO="${REPO:-https://github.com/fabriciocs/OmniRoute.git}"
ARCHIVE="${ARCHIVE:-}"
PUBLISH="${PUBLISH:-no}" # yes configura nginx, sem liberar firewall
PUBLIC_PORT="${PUBLIC_PORT:-8088}"
ALLOW_IP="${ALLOW_IP:-}"
START_CMD="${START_CMD:-}" # opcional, ex: npm run start
LOG="/var/log/omniroute-migration-$(date -u +%Y%m%dT%H%M%SZ).log"
[[ $EUID -eq 0 ]] || { echo 'Execute como root' >&2; exit 1; }
exec > >(tee -a "$LOG") 2>&1
trap 'echo "ERRO na linha $LINENO; log: $LOG" >&2' ERR
command -v apt-get >/dev/null || { echo 'Apenas Ubuntu/Debian'; exit 1; }
[[ "$PORT" =~ ^[0-9]+$ && "$PUBLIC_PORT" =~ ^[0-9]+$ ]] || { echo 'Porta inválida'; exit 1; }
[[ "$APP_DIR" == /* && "$APP_DIR" != / && "$APP_DIR" != /opt && "$APP_DIR" != *'..'* ]] || exit 1
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y git curl ca-certificates tar rsync python3 nginx
if ! command -v node >/dev/null || ! node -e 'process.exit(Number(process.versions.node.split(".")[0])>=22?0:1)'; then
 echo 'Node.js >=22 obrigatório. Instale Node.js 24 LTS e execute novamente.' >&2; exit 2
fi
command -v npm >/dev/null || { echo 'npm ausente'; exit 2; }
if [[ -n "$ARCHIVE" ]]; then
 [[ -f "$ARCHIVE" ]] || { echo "Arquivo não encontrado: $ARCHIVE"; exit 3; }
 HASH_FILE="$ARCHIVE.sha256"
 if [[ -f "$HASH_FILE" ]]; then (cd "$(dirname "$ARCHIVE")" && sha256sum -c "$(basename "$HASH_FILE")"); else echo 'AVISO: sem arquivo SHA256; transferência não verificada'; fi
fi
if ! id "$APP_USER" &>/dev/null; then useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"; fi
install -d -m 750 -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
install -d -m 700 /var/backups/omniroute
if [[ ! -d "$APP_DIR/.git" ]]; then
 [[ -z "$(ls -A "$APP_DIR")" ]] || { echo 'Destino não vazio sem Git: abortando'; exit 4; }
 git clone --branch "$BRANCH" --single-branch "$REPO" "$APP_DIR"
else
 echo 'Repositório existente preservado; sem git pull automático.'
fi
if [[ -n "$ARCHIVE" ]]; then
 STAGE="$(mktemp -d)"
 trap 'rm -rf "$STAGE"' EXIT
 python3 - "$ARCHIVE" <<'PY'
import pathlib,sys,tarfile
with tarfile.open(sys.argv[1],'r:gz') as tf:
 for m in tf:
  p=pathlib.PurePosixPath(m.name)
  if p.is_absolute() or '..' in p.parts or not (m.isfile() or m.isdir()):
   raise SystemExit('Entrada tar insegura: '+m.name)
  if m.name.startswith(('.git/','node_modules/')):
   raise SystemExit('Conteúdo não permitido: '+m.name)
PY
 tar -xzf "$ARCHIVE" -C "$STAGE" --no-same-owner --no-same-permissions
 for file in .env .env.local .env.production .env.production.local; do
  if [[ -f "$STAGE/$file" ]]; then
   if [[ -e "$APP_DIR/$file" ]]; then
    install -m 600 "$STAGE/$file" "/var/backups/omniroute/${file#.}.incoming.$(date +%s)"
    echo "Configuração existente preservada: $file; recebido em backups"
   else
    install -m 600 -o "$APP_USER" -g "$APP_USER" "$STAGE/$file" "$APP_DIR/$file"
   fi
  fi
 done
 for dir in data storage uploads prisma/db database db backups dumps database-dumps; do
  if [[ -d "$STAGE/$dir" ]]; then
   install -d "$APP_DIR/$dir"
   rsync -a --ignore-existing --no-links "$STAGE/$dir/" "$APP_DIR/$dir/"
  fi
 done
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
cd "$APP_DIR"
[[ -f package.json ]] || { echo 'package.json ausente'; exit 5; }
if [[ -f package-lock.json ]]; then runuser -u "$APP_USER" -- npm ci; else runuser -u "$APP_USER" -- npm install; fi
if node -e 'process.exit(require("./package.json").scripts?.build?0:1)'; then runuser -u "$APP_USER" -- npm run build; fi
if [[ -z "$START_CMD" ]]; then
 if node -e 'process.exit(require("./package.json").scripts?.start?0:1)'; then START_CMD='npm run start';
 else echo 'Não há npm start. Informe START_CMD explicitamente após inspecionar package.json'; exit 6; fi
fi
# Permitir apenas comandos simples (sem shell), sem interpolação ou operadores.
read -r -a CMD_PARTS <<< "$START_CMD"
[[ ${#CMD_PARTS[@]} -ge 2 && "${CMD_PARTS[0]}" == npm && "${CMD_PARTS[1]}" == run ]] || { echo 'START_CMD permitido: npm run NOME'; exit 6; }
[[ ${#CMD_PARTS[@]} -eq 3 && "${CMD_PARTS[2]}" =~ ^[a-zA-Z0-9:_-]+$ ]] || exit 6
NPM_PATH="$(command -v npm)"
cat > /etc/systemd/system/omniroute.service <<EOF
[Unit]
Description=OmniRoute local gateway
Wants=network-online.target
After=network-online.target
[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=HOSTNAME=127.0.0.1
Environment=PORT=$PORT
ExecStart=$NPM_PATH run ${CMD_PARTS[2]}
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=$APP_DIR
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now omniroute
HEALTH_OK=0
for _ in $(seq 1 30); do
 if curl -fsS --max-time 3 "http://127.0.0.1:$PORT/healthz" >/dev/null; then HEALTH_OK=1; break; fi
 sleep 3
done
if [[ "$HEALTH_OK" -ne 1 ]]; then
 systemctl --no-pager status omniroute || true
 journalctl -u omniroute -n 60 --no-pager || true
 echo 'Health check não aprovado; nginx não será publicado.' >&2; exit 7
fi
if [[ "$PUBLISH" == yes ]]; then
 [[ -n "$ALLOW_IP" ]] || { echo 'Defina ALLOW_IP para publicar com restrição de origem.'; exit 8; }
 [[ "$ALLOW_IP" =~ ^[0-9a-fA-F:.]+$ ]] || { echo 'ALLOW_IP inválido'; exit 8; }
 cat > /etc/nginx/sites-available/omniroute <<EOF
server {
    listen $PUBLIC_PORT;
    server_name _;
    allow $ALLOW_IP;
    deny all;
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
 ln -sfn /etc/nginx/sites-available/omniroute /etc/nginx/sites-enabled/omniroute
 nginx -t
 systemctl reload nginx || systemctl start nginx
 echo "Nginx configurado na porta $PUBLIC_PORT para $ALLOW_IP. Firewall NÃO alterado. Configure TLS/autenticação antes da Internet."
fi
echo "SUCESSO: serviço local HTTP 200 em http://127.0.0.1:$PORT/healthz"
echo "Log: $LOG"
echo 'ATENÇÃO: valide variáveis .env, bancos externos, permissões, modelos, provedores e rotas antes do cutover.'
