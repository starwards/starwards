"""Measures blast geometry from weapons-score sidecars: plates a HiExp blast erodes, and capsule,
gun and thruster defects per hit, intact vs stripped armor, fit seeds 1-8 against held-out 9-12.

    python modules/ai/ml/blast_geometry.py <training-archive day>/weapons-score
"""
import json,glob,collections,re,sys
root = sys.argv[1]
TOT={'T0':400,'T1':400,'T1-MK2':600}
def runs(seeds):
    for sc in ['T0','T1','T1-MK2']:
        for crew in ['reference','wrong-ammo','spray-fire']:
            for f in glob.glob(f'{root}/{sc}/weapons-{crew}/{sc}_seed*.events.jsonl'):
                s=int(re.search(r'seed(\d+)',f).group(1))
                if s in seeds: yield sc,f
def measure(seeds):
    st=collections.defaultdict(lambda: collections.defaultdict(float))
    for sc,f in runs(seeds):
        ticks=collections.defaultdict(lambda:{'hits':[],'def':[]})
        for l in open(f,encoding='utf-8'):
            if '"objectId":"target"' not in l: continue
            if '"kind":"damage"' in l or '"kind":"defect"' in l:
                e=json.loads(l)
                if e['kind']=='damage' and e['data']['shooterId']=='GVTS': ticks[e['t']]['hits'].append(e['data'])
                elif e['kind']=='defect' and e['data']['cause']=='hit': ticks[e['t']]['def'].append(e['data']['system'])
        lost=0
        for t in sorted(ticks):
            g=ticks[t]
            if len(g['hits'])!=1:
                for h in g['hits']: lost+=h['plateLoss']
                continue
            h=g['hits'][0]; ty=h['damageType']
            stripped = lost >= 0.9*TOT[sc]
            k=(ty,'stripped' if stripped else 'intact')
            d=st[k]; d['n']+=1
            if not stripped and h['plateLoss']>0: d['platesTouched']+=h['plateLoss']/(h['amount']*{'HiExp':1,'ArmPen':2,'Frag':1}[ty]); d['nPlate']+=1
            d['capsule']+=sum(1 for s in g['def'] if s=='Capsule')
            d['gun']+=sum(1 for s in g['def'] if s.startswith('Chain gun'))
            d['thruster']+=sum(1 for s in g['def'] if s.startswith('Thruster'))
            d['defects']+=len(g['def'])
            lost+=h['plateLoss']
    for k,d in sorted(st.items()):
        n=d['n']
        print(k,'n=%d'%n,'platesTouched=%.2f'%(d['platesTouched']/d['nPlate'] if d['nPlate'] else float('nan')),'capsule/hit=%.4f'%(d['capsule']/n),'gun/hit=%.4f'%(d['gun']/n),'thruster/hit=%.4f'%(d['thruster']/n),'defects/hit=%.3f'%(d['defects']/n))
print('fit seeds 1-8'); measure(set(range(1,9)))
print('held-out 9-12'); measure(set(range(9,13)))
