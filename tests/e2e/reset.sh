set -e
cd /home/claude/earldeign-portal
pkill -f "next start" || true; pkill -f "next-server" || true; sleep 1
psql -h localhost -U postgres -q -c "drop database portal with (force)" -c "create database portal"
npx tsx scripts/migrate.ts >/dev/null 2>&1; npx tsx scripts/seed.ts >/dev/null; npx tsx scripts/demo-users.ts >/dev/null; rm -rf storage
(NODE_ENV=production nohup npx next start -p 3000 > /tmp/next.log 2>&1 &)
sleep 5
