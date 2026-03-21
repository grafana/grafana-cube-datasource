#!/bin/sh

# Validate plugin is built — dist/ is volume-mounted from the host
PLUGIN_DIR="/var/lib/grafana/plugins/grafana-cube-datasource"
SRC_DIR="/root/grafana-cube-datasource/src"

if [ ! -f "$PLUGIN_DIR/module.js" ]; then
    echo ""
    echo "ERROR: Plugin frontend is not built (dist/module.js is missing)."
    echo ""
    echo "  The dist/ directory is volume-mounted from the host."
    echo "  Build the plugin before starting:"
    echo ""
    echo "    npm run build        # frontend"
    echo "    mage -v build:linux  # backend"
    echo ""
    if [ "${DEV}" != "true" ]; then
        exit 1
    fi
    echo "  Continuing in dev mode — start 'npm run dev' on the host."
    echo ""
elif [ -d "$SRC_DIR" ] && [ -n "$(find "$SRC_DIR" -newer "$PLUGIN_DIR/module.js" \( -name '*.ts' -o -name '*.tsx' \) -print -quit 2>/dev/null)" ]; then
    echo ""
    echo "WARNING: Plugin frontend may be stale (source files are newer than dist/module.js)."
    echo ""
    echo "  If you switched branches or pulled changes, rebuild:"
    echo ""
    echo "    npm run build   # one-shot rebuild"
    echo "    npm run dev     # or start watch mode"
    echo ""
fi

if [ "${DEV}" = "false" ]; then
    echo "Starting test mode"
    exec /run.sh
fi

echo "Starting development mode"

if grep -i -q alpine /etc/issue; then
    exec /usr/bin/supervisord -c /etc/supervisord.conf
elif grep -i -q ubuntu /etc/issue; then
    exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
else
    echo 'ERROR: Unsupported base image'
    exit 1
fi
