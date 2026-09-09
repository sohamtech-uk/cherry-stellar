#!/usr/bin/env bash
set -euo pipefail

# Container jobs retain their existing command; the verifier is needed by Apache only.
if [[ "${1:-}" != "apache2-foreground" ]]; then
  exec cherrybank-entrypoint "$@"
fi

# The verifier listens on loopback, runs unprivileged and receives no application secrets.
runuser -u www-data -- env -i PATH=/usr/local/bin:/usr/bin:/bin NODE_ENV=production \
  node /opt/cherry-stellar/scripts/verifier.mjs &
verifier_pid=$!
web_pid=''
stop_services() {
  trap - EXIT TERM INT
  kill -TERM "${verifier_pid}" ${web_pid:+"${web_pid}"} 2>/dev/null || true
  wait "${verifier_pid}" ${web_pid:+"${web_pid}"} 2>/dev/null || true
}
trap stop_services EXIT
trap 'exit 0' TERM INT
cherrybank-entrypoint "$@" &
web_pid=$!
set +e
wait -n "${verifier_pid}" "${web_pid}"
status=$?
set -e
# An unexpected clean exit of either long-running service must also restart the container.
if [[ "${status}" == 0 ]]; then status=1; fi
exit "${status}"
