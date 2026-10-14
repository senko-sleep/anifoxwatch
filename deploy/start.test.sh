#!/bin/bash
# Real process regression: a failed child must stop its sibling despite `set -e`.
set -eu
test_dir="$(pwd)/.artifacts/start-script-test-${BASHPID}"
mkdir -p "$test_dir"
cat > "$test_dir/node" <<'EOF'
#!/bin/bash
sleep 0.3
exit 7
EOF
cat > "$test_dir/media-proxy" <<'EOF'
#!/bin/bash
echo "$$" > "$START_TEST_DIR/proxy.pid"
trap 'echo stopped > "$START_TEST_DIR/proxy.stopped"; exit 0' TERM
while true; do sleep 0.1; done
EOF
chmod +x "$test_dir/node" "$test_dir/media-proxy"
status=0
PATH="$test_dir:$PATH" START_TEST_DIR="$test_dir" WATCHDOG_GRACE=1 bash deploy/start.sh || status=$?
if [ "$status" -ne 7 ]; then
    echo "FAIL: child exit code was $status, expected 7"
    exit 1
fi
for _ in {1..20}; do
    if [ -f "$test_dir/proxy.stopped" ]; then
        echo 'PASS: failed Node exit preserved; sibling proxy received shutdown'
        exit 0
    fi
    sleep 0.1
done
echo 'FAIL: sibling proxy was not terminated'
kill -TERM "$(cat "$test_dir/proxy.pid")" 2>/dev/null || true
exit 1
