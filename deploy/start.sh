#!/bin/bash
# Runs the two halves of the API in one container: the Node application and the Rust data plane
# in front of it (see media-proxy/src/main.rs).
#
# The only real requirement of a two-process container is that it must not outlive either half.
# A container whose Node died but whose proxy still answers the health check is worse than one
# that is plainly down: the platform sees health and leaves it serving errors. So the first exit
# of either process takes the container with it, and the platform restarts a clean one.

set -eu

NODE_PORT="${NODE_PORT:-3001}"
PORT="${PORT:-8080}"

echo "[start] node on 127.0.0.1:${NODE_PORT}, media-proxy on 0.0.0.0:${PORT}"

# Node binds loopback only. The proxy is the sole public listener, so there is no second door
# into the API that would skip it.
HOST=127.0.0.1 PORT="${NODE_PORT}" node dist/index.js &
node_pid=$!

PORT="${PORT}" NODE_PORT="${NODE_PORT}" media-proxy &
proxy_pid=$!

# Exiting is not the only way Node fails. On a 512MB instance it can wedge instead — alive,
# answering nothing — while the proxy keeps the platform's TCP health check green, so the
# instance is never replaced (seen 2026-10-13: 45 minutes of silence, reported HEALTHY).
# Node's own /health is asked directly; if it stays silent the process is killed, `wait -n`
# below sees the exit, and the platform restarts a clean container.
WATCHDOG_GRACE="${WATCHDOG_GRACE:-90}"
WATCHDOG_INTERVAL="${WATCHDOG_INTERVAL:-20}"
WATCHDOG_STRIKES="${WATCHDOG_STRIKES:-4}"
(
    sleep "$WATCHDOG_GRACE"
    strikes=0
    while kill -0 "$node_pid" 2>/dev/null; do
        if curl -fsS -m 10 -o /dev/null "http://127.0.0.1:${NODE_PORT}/health"; then
            strikes=0
        else
            strikes=$((strikes + 1))
            echo "[watchdog] node /health unanswered (${strikes}/${WATCHDOG_STRIKES})"
            if [ "$strikes" -ge "$WATCHDOG_STRIKES" ]; then
                echo "[watchdog] node is unresponsive; killing it so the container restarts"
                kill -KILL "$node_pid" 2>/dev/null || true
                exit 1
            fi
        fi
        sleep "$WATCHDOG_INTERVAL"
    done
) &

# Forward a shutdown to both, so a deploy drains rather than drops connections.
terminate() {
    echo "[start] signal received, stopping children"
    kill -TERM "$node_pid" "$proxy_pid" 2>/dev/null || true
    wait "$node_pid" 2>/dev/null || true
    wait "$proxy_pid" 2>/dev/null || true
    exit 0
}
trap terminate TERM INT

# `wait -n` returns on the first child to exit, whichever it is.
wait -n
status=$?

echo "[start] a child exited with status ${status}; stopping the container"
kill -TERM "$node_pid" "$proxy_pid" 2>/dev/null || true
exit "$status"
