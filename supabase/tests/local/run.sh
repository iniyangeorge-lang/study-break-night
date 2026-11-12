#!/usr/bin/env bash
# Runs schema.sql + logic tests + race tests in a throwaway local Postgres.
# Needs Docker. Never touches the real Supabase project.
set -euo pipefail

cd "$(dirname "$0")/../.."   # -> supabase/
NAME=sbn-test-db
PSQL=(docker exec -i "$NAME" psql -U postgres -q -v ON_ERROR_STOP=1)

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=test postgres:15 -c max_connections=300 >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
sleep 1

echo "--- loading schema"
"${PSQL[@]}" < tests/local/supabase_stub.sql
"${PSQL[@]}" < schema.sql
# Simulate an older version (telegram + cancel_code columns, 3-arg rsvp),
# then re-run schema.sql: it must upgrade cleanly and be safe to re-run.
"${PSQL[@]}" -c "alter table attendees add column telegram text, add column cancel_code text;
  create function rsvp(text, text, text) returns jsonb language sql as 'select null::jsonb';
  create function cancel_rsvp(text, text) returns jsonb language sql as 'select null::jsonb';"
"${PSQL[@]}" < schema.sql
"${PSQL[@]}" -tAc "select 'leftover old objects: ' || (
    (select count(*) from information_schema.columns where table_name = 'attendees' and column_name in ('telegram', 'cancel_code'))
  + (select count(*) from pg_proc where proname in ('rsvp', 'cancel_rsvp')) - 2)"

echo "--- logic tests"
"${PSQL[@]}" < tests/logic_test.sql 2>&1 | grep -E 'pass:|FAIL|ERROR|PASSED' | sed 's/^psql:.*NOTICE: *//'

echo "--- race test: 200 simultaneous RSVPs, cap 150"
"${PSQL[@]}" -c "truncate attendees restart identity; update settings set rsvp_cap=150, cap=150, rsvp_open=true,
  checkin_opens=now()-interval '1 hour', checkin_closes=now()+interval '1 hour', release_at=now()-interval '1 minute';"
for i in $(seq 1 200); do
  docker exec "$NAME" psql -U postgres -qtAc "set role anon; select rsvp('P$i', 'e$(printf %07d "$i")@u.nus.edu')->>'status'" &
done > /tmp/sbn_rsvp_race.txt
wait
sort /tmp/sbn_rsvp_race.txt | uniq -c
"${PSQL[@]}" -tAc "select 'rsvp rows in table: ' || count(*) from attendees"

echo "--- race test: 200 simultaneous check-ins (150 RSVPs + 50 walk-ins), cap 150"
for i in $(seq 1 200); do
  docker exec "$NAME" psql -U postgres -qtAc "set role anon; select check_in('e$(printf %07d "$i")@u.nus.edu', 'Walk $i')->>'status'" &
done > /tmp/sbn_checkin_race.txt
wait
sort /tmp/sbn_checkin_race.txt | uniq -c
"${PSQL[@]}" -tAc "select 'cups: ' || count(*) || ', distinct: ' || count(distinct cup_number) || ', min: ' || min(cup_number) || ', max: ' || max(cup_number)
                   from attendees where checked_in_at is not null"
