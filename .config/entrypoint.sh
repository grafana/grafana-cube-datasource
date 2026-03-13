#!/bin/sh

# Validate plugin is built — dist/ is volume-mounted from the host
PLUGIN_DIR="/var/lib/grafana/plugins/grafana-cube-datasource"
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
    echo "  Or use 'npm run server' which auto-builds the frontend."
    echo ""
    if [ "${DEV}" != "true" ]; then
        exit 1
    fi
    echo "  Continuing in dev mode — start 'npm run dev' on the host."
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

