from pathlib import Path
import subprocess, json, secrets, os, socket, re
base = Path.home()/'.local/share/stellarc-gateway'
data = base/'postgres'
sock = base/'socket'
config = Path.home()/'.config/stellarc-gateway'
unit = Path.home()/'.config/systemd/user/stellarc-gateway-postgres.service'
bin = Path('/usr/lib/postgresql/18/bin')
assert not base.exists() and not config.exists() and not unit.exists(), 'Candidate state exists: inspect before retry'
probe=socket.socket(); assert probe.connect_ex(('127.0.0.1',55438)) != 0; probe.close()
def run(args, **kw):
    r=subprocess.run(args,capture_output=True,text=True,timeout=45,**kw)
    if r.returncode: raise RuntimeError('Candidate command failed: '+str(args[0])+'; details withheld')
    return r.stdout
for p in [base,sock,config]: p.mkdir(parents=True,exist_ok=False); p.chmod(0o700)
run([str(bin/'initdb'),'-D',str(data),'--username=stellarc_gateway_admin','--auth-local=trust','--auth-host=scram-sha-256','--encoding=UTF8','--no-locale'])
with (data/'postgresql.conf').open('a') as f:
    f.write("\nlisten_addresses = '127.0.0.1'\nport = 55438\nunix_socket_directories = '"+str(sock)+"'\nshared_buffers = '32MB'\nmax_connections = 24\nlogging_collector = off\n")
unit.parent.mkdir(parents=True,exist_ok=True)
unit.write_text('[Unit]\nDescription=Isolated Stellarc gateway candidate PostgreSQL\n[Service]\nExecStart='+str(bin/'postgres')+' -D '+str(data)+'\nRestart=on-failure\nRestartSec=5\nTimeoutStopSec=60\nKillSignal=SIGINT\nUMask=0077\nNoNewPrivileges=true\nPrivateTmp=true\nProtectSystem=strict\nProtectHome=read-only\nReadWritePaths='+str(base)+'\n[Install]\nWantedBy=default.target\n')
unit.chmod(0o600)
run(['systemctl','--user','daemon-reload'])
run(['systemctl','--user','start',unit.stem])
for n in range(50):
    r=subprocess.run([str(bin/'pg_isready'),'-h',str(sock),'-p','55438','-U','stellarc_gateway_admin'],capture_output=True,timeout=5)
    if r.returncode==0: break
    import time; time.sleep(.1)
else: raise RuntimeError('Candidate PostgreSQL readiness failed')
psql=[str(bin/'psql'),'-X','-v','ON_ERROR_STOP=1','-h',str(sock),'-p','55438','-U','stellarc_gateway_admin']
owner_password=secrets.token_hex(32); runtime_password=secrets.token_hex(32)
run(psql+['-d','postgres'],input="CREATE ROLE stellarc_gateway_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+owner_password+"';\nCREATE ROLE stellarc_gateway_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+runtime_password+"';\nCREATE DATABASE stellarc_gateway_candidate OWNER stellarc_gateway_owner;\n")
# Only this fresh candidate database is modified; shared cluster is not contacted.
run(psql+['-d','stellarc_gateway_candidate'],input="REVOKE ALL ON DATABASE stellarc_gateway_candidate FROM PUBLIC; GRANT CONNECT ON DATABASE stellarc_gateway_candidate TO stellarc_gateway_owner,stellarc_gateway_runtime; REVOKE CREATE ON SCHEMA public FROM PUBLIC;")
for name,password in [('owner',owner_password),('runtime',runtime_password)]:
    path=config/(name+'.env'); path.write_text('GATEWAY_'+('OWNER_DATABASE_URL' if name=='owner' else 'DATABASE_URL')+'=postgres://stellarc_gateway_'+name+':'+password+'@127.0.0.1:55438/stellarc_gateway_candidate\n');path.chmod(0o600)
print(json.dumps({'database':'stellarc_gateway_candidate','port':55438,'unit':str(unit),'data':str(data),'credentialPaths':[str(config/'owner.env'),str(config/'runtime.env')],'unitActive':run(['systemctl','--user','is-active',unit.stem]).strip(),'automaticBootEnabled':False,'schemaInitialized':False,'oidcPinned':False}))
