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
