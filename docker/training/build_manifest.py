"""Builds <archive day>/manifest.jsonl: one line per recording with its header, the brains that
played each station, sidecar event counts, the run outcome from the run reports beside it and the
Node version it ran on (from the nearest runtime.json stamp above it, `unknown` without one).

Canonical copy: starwards docker/training/build_manifest.py (baked into the training image);
helios/training-archive/build_manifest.py is a copy of it.

    python build_manifest.py 2026-10-02 <code commit>
    ARCHIVE=/training-archive python3 /app/build_manifest.py 2026-10-02 <code commit>
"""
import glob
import gzip
import json
import os
import subprocess
import sys

day, commit = sys.argv[1], sys.argv[2]
# the archive root: $ARCHIVE when set (the training image), else the folder holding this script
os.chdir(os.path.join(os.environ.get('ARCHIVE') or os.path.dirname(os.path.abspath(__file__)), day))
KEEP = ('crew', 'brain', 'brains', 'killed', 'seconds', 'shellsFired', 'blastHits', 'killZoneFraction',
        'targetHealth', 'armorStrippedAt', 'metrics', 'decisions', 'fallbacks', 'refused', 'inputTokens',
        'failedChecks', 'scenario', 'benchmark', 'kills', 'enemies', 'waves')


def key(path):
    path = path.replace(os.sep, '/').replace('\\', '/')
    parts = path.split('/')
    return (parts[-2] + '/' + parts[-1]).lower()


outcomes = {}
for report in glob.glob('**/*.json', recursive=True):
    try:
        data = json.load(open(report, encoding='utf-8'))
    except Exception:
        continue
    if isinstance(data, list):
        for run in data:
            if isinstance(run, dict) and run.get('recording'):
                outcomes[key(run['recording'])] = {k: run[k] for k in KEEP if k in run}

# The code commit of each run: commits.json maps a path prefix to the commit that recorded it (longest
# prefix wins); runs it does not cover keep the commit an earlier manifest gave them; new runs get argv[2].
prefixes = json.load(open('commits.json', encoding='utf-8')) if os.path.exists('commits.json') else {}
previous = {}
if os.path.exists('manifest.jsonl'):
    for line in open('manifest.jsonl', encoding='utf-8'):
        entry = json.loads(line)
        previous[entry['path']] = entry.get('codeCommit')


def commit_of(path):
    matches = [p for p in prefixes if path.startswith(p)]
    if matches:
        return prefixes[max(matches, key=len)]
    return previous.get(path) or commit


def node_of(sgr):
    """The `node` of the nearest runtime.json in the recording's folder or above it, within the day."""
    folder = os.path.dirname(sgr)
    while True:
        stamp = os.path.join(folder, 'runtime.json')
        if os.path.exists(stamp):
            try:
                return json.load(open(stamp, encoding='utf-8')).get('node') or 'unknown'
            except Exception:
                return 'unknown'
        if not folder:
            return 'unknown'
        folder = os.path.dirname(folder)


def sidecar_lines(sidecar):
    """A sidecar's lines: zstd through the `zstd` CLI (stdlib-only Python has no zstd before 3.14), gzip, or plain."""
    if sidecar.endswith('.zst'):
        out = subprocess.run(['zstd', '-dcq', sidecar], check=True, stdout=subprocess.PIPE).stdout
        return out.decode('utf-8').splitlines()
    if sidecar.endswith('.gz'):
        return gzip.open(sidecar, 'rt', encoding='utf-8')
    return open(sidecar, encoding='utf-8')


count = with_outcome = 0
with open('manifest.jsonl', 'w', encoding='utf-8', newline='\n') as out:
    for sgr in sorted(glob.glob('**/*.sgr', recursive=True)):
        with open(sgr, encoding='utf-8') as f:
            header = json.loads(f.readline())
            frames = sum(1 for _ in f)
        plain = sgr[:-4] + '.events.jsonl'
        sidecar = next((s for s in (plain + '.zst', plain, plain + '.gz') if os.path.exists(s)), None)
        stations, kinds = {}, {}
        if sidecar:
            for line in sidecar_lines(sidecar):
                try:
                    event = json.loads(line)
                except Exception:
                    continue
                kinds[event['kind']] = kinds.get(event['kind'], 0) + 1
                if event['kind'] == 'brain_request':
                    d = event.get('data', {})
                    played = {k: d.get(k) for k in ('brain', 'version', 'specHash', 'policy', 'model')}
                    if 'seats' in d:
                        played['seats'] = d['seats']
                    stations.setdefault(d.get('station'), played)
        path = sgr.replace(os.sep, '/')
        outcome = outcomes.get(key(sgr))
        with_outcome += outcome is not None
        out.write(json.dumps({
            'path': path,
            'source': '/'.join(path.split('/')[:2]),
            'group': path.split('/')[-2],
            'map': header.get('mapName'),
            'seed': header.get('seed'),
            'params': header.get('params'),
            'hz': header.get('hz'),
            'startedAt': header.get('startedAt'),
            'frames': frames,
            'frameIntervalMs': header.get('intervalMs'),
            'live': header.get('seed') is None,
            'sidecar': sidecar is not None,
            'eventCounts': kinds,
            'stations': stations,
            'outcome': outcome,
            'codeCommit': commit_of(path),
            'node': node_of(sgr),
            'energyModel': header.get('energyModel'),
        }, ensure_ascii=False) + '\n')
        count += 1
print(f'{count} entries, {with_outcome} with outcomes')
