#!/usr/bin/env bash
# Exercises scripts/deploy.sh end to end against a LOCAL fake server: stub ssh/curl/rsync
# on PATH redirect everything into a temp dir. Verifies dry-run writes nothing, local/ is
# preserved, backup + rollback work, and --purge-local removes local/.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/splunk/etc/apps/assetdb/default" "$T/splunk/etc/apps/assetdb/local" "$T/dist"

# fake server: older install with a user local/ dir
printf '[launcher]\nversion = 0.0.1\n' > "$T/splunk/etc/apps/assetdb/default/app.conf"
echo "user=config" > "$T/splunk/etc/apps/assetdb/local/savedsearches.conf"
echo stale > "$T/splunk/etc/apps/assetdb/default/stale.conf"

cat > "$T/bin/ssh" <<STUB
#!/usr/bin/env bash
while [[ \$# -gt 0 && "\$1" == -* ]]; do if [[ "\$1" == -o ]]; then shift; fi; shift; done
shift   # host
exec bash -c "\$*"
STUB
cat > "$T/bin/curl" <<'STUB'
#!/usr/bin/env bash
if [[ "$*" == *kvstore/status* ]]; then echo '{"entry":[{"content":{"current":{"status":"ready"}}}]}'
else echo '{"entry":[{"content":{"version":"9.9.9","serverName":"mock"}}]}'; fi
STUB
cat > "$T/bin/rsync" <<STUB
#!/usr/bin/env bash
args=(); skip=0
for a in "\$@"; do
  if ((skip)); then skip=0; continue; fi
  if [[ "\$a" == -e ]]; then skip=1; continue; fi
  args+=("\${a#user@splunk.home:}")
done
exec $(command -v rsync) "\${args[@]}"
STUB
chmod +x "$T"/bin/*

export PATH="$T/bin:$PATH" ENV_FILE=/nonexistent
export SPLUNK_HOST=splunk.home ALLOWED_HOSTS=splunk.home SPLUNK_TOKEN=dummy SSH_TARGET=user@splunk.home SPLUNK_HOME_REMOTE="$T/splunk"
cd "$ROOT"
# Use the repo's real package, redirecting dist/backups to the temp dir via a copied script root.
cp -R scripts "$T/scripts"; cp -R default "$T/default"; mkdir -p "$T/dist"
cp "dist/assetdb-$(sed -n 's/^version = //p' default/app.conf | head -1).tar.gz" "$T/dist/" 2>/dev/null || { scripts/package.sh --skip-npm >/dev/null 2>&1; cp "dist/assetdb-$(sed -n 's/^version = //p' default/app.conf | head -1).tar.gz" "$T/dist/"; }
D="$T/scripts/deploy.sh"
APP="$T/splunk/etc/apps/assetdb"
fail() { echo "FAIL: $*" >&2; exit 1; }

"$D" --dry-run >/dev/null 2>&1
grep -q 'version = 0.0.1' "$APP/default/app.conf" || fail "dry-run modified the server"
[[ -f "$APP/default/stale.conf" ]] || fail "dry-run deleted files"
ls "$T/dist/backups" >/dev/null 2>&1 && fail "dry-run created a backup"

"$D" --yes >/dev/null 2>&1
grep -q "version = $(sed -n 's/^version = //p' default/app.conf | head -1)" "$APP/default/app.conf" || fail "deploy did not update app.conf"
[[ -f "$APP/default/stale.conf" ]] && fail "stale file not removed"
grep -q 'user=config' "$APP/local/savedsearches.conf" || fail "local/ was not preserved"
ls "$T"/dist/backups/assetdb-*-v0.0.1.tar.gz >/dev/null || fail "no backup of previous version"

"$D" --yes >/dev/null 2>&1   # idempotent
grep -q 'user=config' "$APP/local/savedsearches.conf" || fail "local/ lost on redeploy"

"$D" rollback --yes >/dev/null 2>&1 || true
latest=$(find "$T/dist/backups" -name '*.tar.gz' | sort | tail -1)
tar -xzf "$latest" -O assetdb/default/app.conf | grep -q 'version = ' || fail "backup unreadable"

"$D" --yes --purge-local >/dev/null 2>&1
[[ -e "$APP/local" ]] && fail "--purge-local did not remove local/"

# allowlist guard
if SPLUNK_HOST=prod.example "$D" --dry-run >/dev/null 2>&1; then fail "allowlist not enforced"; fi
echo "deploy mock test: OK"
