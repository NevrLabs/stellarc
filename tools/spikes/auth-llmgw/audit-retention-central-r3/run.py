#!/usr/bin/env python3
"""Exact central-binary retention gate. Run via run.sh on fxbuilder only."""
import collections
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
BIN = str(ROOT / 'central')
SHA = 'dcda64b76fa64497d571f75da5681ae1a54f35c52edde89a1f8b81df384cc5f6'
ATTR = re.compile(r'->\s*fixture\.case:\s*Str\(([^)]+)\)')
ERROR = re.compile(r'(?i)(failed to execute|error evaluating|evaluation error|failed to evaluate|error.*(?:filter|ottl)|(?:filter|ottl).*error|\b(?:warn|error|fatal)\b)')


def save(name, obj):
    Path(name).write_text(json.dumps(obj, indent=2, sort_keys=True) + '\n')


def receipt(name, rc):
    Path(name + '.exit').write_text(str(rc) + '\n')


def inspect(text, expected):
    counts = collections.Counter(ATTR.findall(text))
    failures = []
    if counts != collections.Counter({x: 1 for x in expected}):
        failures.append('exact ID occurrence mismatch')
    blocks = re.split(r'^LogRecord #', text, flags=re.M)[1:]
    if any(len(ATTR.findall(block)) != 1 for block in blocks) or len(blocks) != sum(counts.values()):
        failures.append('exported record without exactly one case attribute')
    errors = []
    for line in text.splitlines():
        # Match structured diagnostic fields, not WARN/ERROR inside fixture data
        # or the INFO startup message that quotes the configured expressions.
        fields = line.split('\t', 4)
        if len(fields) >= 4 and re.match(r'^\d{4}-\d\d-\d\dT', fields[0]):
            if fields[1] in ('warn', 'error', 'fatal', 'panic') or ERROR.search(fields[3]):
                errors.append(line)
    if errors:
        failures.append('collector runtime diagnostic')
    return {'counts': dict(sorted(counts.items())), 'expected': sorted(expected),
            'unexpected': sorted(set(counts) - set(expected)),
            'errors': errors, 'failures': failures}


def selfcheck():
    clean = 'LogRecord #0\n     -> fixture.case: Str(P01)\n'
    assert not inspect(clean, ['P01'])['failures']
    for bad in (clean + clean, clean.replace('P01', 'ALIEN'), clean + 'LogRecord #1\n',
                clean + '2026-11-08T00:00:00Z\twarn\tfilter/processor.go:1\tfailed to execute OTTL condition\n'):
        assert inspect(bad, ['P01'])['failures']
    receipt('checker-selfcheck', 0)


def command(name, args):
    with open(name + '.log', 'wb') as out:
        r = subprocess.run(args, stdout=out, stderr=subprocess.STDOUT, timeout=30)
    receipt(name, r.returncode)
    return r.returncode


def execute(name, cfg, payload, expected):
    log = Path(name + '.log')
    proc = None
    try:
        with socket.socket() as s:
            assert s.connect_ex(('127.0.0.1', 43119)) != 0, 'port already occupied'
        with log.open('wb') as out:
            proc = subprocess.Popen([BIN, '--config', cfg], stdout=out, stderr=subprocess.STDOUT,
                                    start_new_session=True, close_fds=True)
            for _ in range(120):
                if proc.poll() is not None:
                    raise RuntimeError('collector exited before readiness')
                with socket.socket() as s:
                    ready = s.connect_ex(('127.0.0.1', 43119)) == 0
                if ready:
                    break
                time.sleep(0.1)
            else:
                raise RuntimeError('receiver readiness timeout')
            req = urllib.request.Request('http://127.0.0.1:43119/v1/logs',
                data=json.dumps(payload).encode(), headers={'content-type': 'application/json'})
            with urllib.request.urlopen(req, timeout=10) as response:
                body = response.read().decode()
                save(name + '-http.json', {'status': response.status, 'body': body})
                assert response.status == 200
                parsed = json.loads(body)
                assert not parsed.get('partialSuccess'), 'partial OTLP rejection'
            time.sleep(2)
            proc.send_signal(signal.SIGTERM)
            rc = proc.wait(timeout=15)
        receipt(name + '-collector', rc)
        result = inspect(log.read_text(), expected)
        if rc != 0:
            result['failures'].append('nonzero collector exit')
    except Exception as e:
        result = {'failures': [str(e)]}
    finally:
        if proc is not None and proc.poll() is None:
            os.killpg(proc.pid, signal.SIGTERM)
            proc.wait(timeout=15)
    save(name + '-assertions.json', result)
    receipt(name, int(bool(result['failures'])))
    return result


def original_payload():
    # Reuse the byte-identical R2 sender; capture its request without changing it.
    import runpy
    from unittest.mock import patch
    requests = []
    class Response:
        status = 200
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def read(self): return b'{}'
    def capture(req, timeout):
        requests.append(json.loads(req.data))
        return Response()
    with patch('urllib.request.urlopen', capture):
        runpy.run_path('send_cases.py', run_name='__main__')
    assert len(requests) == 1
    return requests[0]


def probes():
    payload = original_payload()
    group = copy.deepcopy(payload['resourceLogs'][0])
    template = group['scopeLogs'][0]['logRecords'][0]
    records = []
    variants = [('T01', {'intValue': '42'}), ('T02', {'boolValue': True}),
                ('T03', {'arrayValue': {'values': [{'stringValue': 'x'}]}}),
                ('T04', {'kvlistValue': {'values': [{'key': 'x', 'value': {'stringValue': 'y'}}]}}),
                ('T07', {'doubleValue': 1.5}), ('T08', {'bytesValue': 'eA=='}),
                ('T09', {'arrayValue': {'values': [{'stringValue': template['attributes'][-1]['value']['stringValue']}]}})]
    for cid, value in variants:
        rec = copy.deepcopy(template)
        for attr in rec['attributes']:
            if attr['key'] == 'fixture.case': attr['value'] = {'stringValue': cid}
            if attr['key'] == 'event.id': attr['value'] = value
        records.append(rec)
    for cid, body in [('T05', None), ('T06', {'kvlistValue': {'values': []}}),
                      ('T10', {'intValue': '42'}), ('T11', {'boolValue': True}),
                      ('T12', {'arrayValue': {'values': [{'stringValue': 'auth.login.begin'}]}}),
                      ('T13', {'bytesValue': 'eA=='})]:
        rec = copy.deepcopy(template)
        for attr in rec['attributes']:
            if attr['key'] == 'fixture.case': attr['value'] = {'stringValue': cid}
        if body is None: rec.pop('body')
        else: rec['body'] = body
        records.append(rec)
    group['scopeLogs'][0]['logRecords'] = records
    payload = {'resourceLogs': [group]}
    save('type-probes.json', payload)
    return payload


def main():
    assert hashlib.sha256(Path(BIN).read_bytes()).hexdigest() == SHA
    # A network namespace with only loopback prevents accidental remote export.
    net = Path('/proc/net/route').read_text()
    assert len(net.splitlines()) == 1, 'network namespace has non-loopback route'
    Path('network-route.log').write_text(net)
    selfcheck()
    spec = json.loads(Path('cases.json').read_text())['cases']
    ids = [c['id'] for c in spec]
    expected_ids = {f'P{i:02}' for i in range(1, 23)} | {f'C{i:02}' for i in range(1, 10)} | {f'N{i:02}' for i in [1,2,3,4,5,6,7,8,9,11,12,13]}
    assert len(ids) == 43 and set(ids) == expected_ids and len(set(ids)) == 43
    receipt('case-set', 0)
    command('components', [BIN, 'components'])
    validation = {mode: command('validate-' + mode, [BIN, 'validate', '--config', 'config-' + mode + '.yaml']) for mode in ['baseline', 'proposed']}
    payload = original_payload()
    save('original-payload.json', payload)
    outcomes = {}
    for mode in ['baseline', 'proposed']:
        if validation[mode] == 0:
            expected = [c['id'] for c in spec if c['expect_' + mode] == 'R']
            outcomes[mode] = execute(mode, 'config-' + mode + '.yaml', payload, expected)
    typed = probes()
    for mode in ['baseline', 'proposed']:
        if validation[mode] == 0:
            outcomes['types-' + mode] = execute('types-' + mode, 'config-' + mode + '.yaml', typed, [])
    # Separate deliberately broken predicate: prove ignore-mode fail-open and
    # that the checker rejects it. This is NOT a proposed policy change.
    candidate = Path('config-proposed.yaml').read_text()
    Path('config-error-canary.yaml').write_text(candidate.replace(
        'severity_number > 0 and severity_number < 13',
        'ParseJSON(body)["x"] == true and severity_number > 0 and severity_number < 13', 1))
    canary_validation = command('validate-error-canary', [BIN, 'validate', '--config', 'config-error-canary.yaml'])
    canary = execute('error-canary', 'config-error-canary.yaml', payload, []) if canary_validation == 0 else {}
    canary_ok = bool(canary.get('errors') and canary.get('counts', {}).get('P01') == 1
                     and canary.get('failures') and canary_validation == 0)
    receipt('error-canary-detected', int(not canary_ok))
    failed = bool(any(validation.values()) or any(x['failures'] for x in outcomes.values()) or not canary_ok)
    save('results.json', {'binary_sha256': SHA, 'case_ids': sorted(ids), 'validation': validation,
                         'outcomes': outcomes, 'error_canary_detected': canary_ok, 'pass': not failed})
    receipt('run', int(failed))
    print(json.dumps({'validation': validation, 'failures': {k:v['failures'] for k,v in outcomes.items()}, 'pass': not failed}))
    return int(failed)


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        receipt('run', 1)
        raise
