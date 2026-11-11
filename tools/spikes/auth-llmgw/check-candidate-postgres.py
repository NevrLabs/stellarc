"""Read-only/rolled-back checks for the prepared Talos candidate; never prints DSNs."""
from pathlib import Path
import json
import os
import subprocess
import urllib.parse

config = Path.home() / '.config/stellarc-gateway/runtime.env'
url = urllib.parse.urlparse(config.read_text().strip().split('=', 1)[1])
assert url.hostname == '127.0.0.1' and url.port == 55438
assert url.username == 'stellarc_gateway_runtime'
assert url.path == '/stellarc_gateway_candidate'
env = dict(os.environ, PGPASSWORD=url.password, PGCONNECT_TIMEOUT='3')
command = ['/usr/lib/postgresql/18/bin/psql', '-X', '-A', '-t', '-v',
           'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', '55438',
           '-U', url.username, '-d', url.path[1:]]

def query(text, args=None):
    return subprocess.run(args or command, input=text, env=env,
                          capture_output=True, text=True, timeout=12)

baseline = query('SELECT (SELECT count(*) FROM gw_identity_binding),'
                 '(SELECT count(*) FROM gw_principal),(SELECT count(*) FROM gw_run),'
                 '(SELECT count(*) FROM gw_audit);')
assert baseline.returncode == 0
counts = baseline.stdout.strip().split('|')
assert len(counts) == 4 and counts[:3] == ['0', '0', '0'] and int(counts[3]) >= 0
checks = []
for name, statement in [
    ('identity-update-denied', "UPDATE gw_identity_binding SET issuer='https://denied.invalid'"),
    ('installation-delete-denied', 'DELETE FROM gw_installation'),
    ('audit-delete-denied', 'DELETE FROM gw_audit'),
    ('audit-update-denied', "UPDATE gw_audit SET kind='denied'"),
    ('audit-truncate-denied', 'TRUNCATE gw_audit'),
    ('owner-role-denied', 'SET ROLE stellarc_gateway_owner'),
    ('schema-create-denied', 'CREATE SCHEMA forbidden_candidate_probe'),
]:
    result = query('BEGIN; ' + statement + '; ROLLBACK;')
    assert result.returncode != 0 and 'permission denied' in result.stderr, name
    checks.append(name)
shared = command.copy()
shared[shared.index('55438')] = '5432'
shared[shared.index('stellarc_gateway_candidate')] = 'postgres'
result = query('SELECT current_user;', shared)
assert result.returncode != 0 and ('authentication failed' in result.stderr or
                                  'does not exist' in result.stderr or
                                  'no pg_hba.conf entry' in result.stderr)
checks.append('candidate-credential-rejected-by-shared-cluster')
after = query('SELECT (SELECT count(*) FROM gw_identity_binding),'
              '(SELECT count(*) FROM gw_principal),(SELECT count(*) FROM gw_run),'
              '(SELECT count(*) FROM gw_audit);')
assert after.returncode == 0 and after.stdout == baseline.stdout
checks.append('protected-row-counts-unchanged-after-negative-checks')
print(json.dumps({'scope': 'actual candidate runtime login; rolled-back negative checks; no login or gateway activation proof',
                  'checks': checks, 'database': url.path[1:], 'port': url.port}))
