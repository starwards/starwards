// ERRAND-PLAN step 1 retry (v2): TTD from incoming hit DPS on the station (sidecar `damage` events)
// with station armour modelled before the capsule. Rows from errand-check.ts (with `hits`, `ah`, `ab`).
//   node errand-ttd-v2.mjs <rows-dir> <waves.json>...
// Calibrates on even seeds, reports on odd seeds.
import fs from 'node:fs';
import path from 'node:path';

const [dir, ...wavesFiles] = process.argv.slice(2);
const meta = new Map();
for (const f of wavesFiles) for (const r of JSON.parse(fs.readFileSync(f, 'utf8'))) meta.set(r.seed, r);
const runs = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl')))
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n'))
        if (line.trim()) {
            const r = JSON.parse(line);
            r.seed = Number(/seed(\d+)/.exec(r.file)[1]);
            r.meta = meta.get(r.seed);
            if (r.meta && r.hits) runs.push(r);
        }
const isCal = (r) => r.seed % 2 === 0;
const STATIONS = ['station-large', 'station-platform', 'station-small'];
const tierMid = (h) => (h > 0.9 ? 0.95 : h > 0.4 ? 0.65 : h > 0.15 ? 0.275 : 0.075);
const tierLow = (h) => (h > 0.9 ? 0.9 : h > 0.4 ? 0.4 : h > 0.15 ? 0.15 : 0.0375);
const raw = (h) => h;

function series(r, id) {
    const s = [];
    let loss = null;
    for (let i = 0; i < r.frames.length; i++) {
        const f = r.frames[i];
        const x = f.st[id];
        if (!x) {
            if (s.length && loss === null) loss = (r.frames[i - 1].t + f.t) / 2;
            break;
        }
        s.push({ t: f.t, cap: x.cap, a: x.ah / x.am, ah: x.ah, ab: x.ab });
    }
    const hits = r.hits.filter((h) => h[1] === id).map(([t, , amt, pl]) => ({ t, amt, pl }));
    return { s, loss, hits };
}
const frameBefore = (s, t) => {
    let j = 0;
    while (j + 1 < s.length && s[j + 1].t <= t) j++;
    return s[j];
};

// calibration per station: capsule per damage (c0, damaged phase), capsule per (damage x broken frac) (k),
// plate health lost per damage (d)
const cal = {};
for (const id of STATIONS) {
    let capLoss = 0,
        capLossDmg = 0,
        dmgDamaged = 0,
        dmgB = 0,
        dmg = 0,
        pl = 0;
    for (const r of runs.filter(isCal)) {
        const { s, loss, hits } = series(r, id);
        if (!s.length) continue;
        const end = loss ?? s[s.length - 1].t;
        const capEnd = loss !== null ? 0 : s[s.length - 1].cap;
        capLoss += 1 - capEnd;
        const firstDmg = s.find((p) => p.cap < 1);
        for (const h of hits) {
            if (h.t > end) continue;
            dmg += h.amt;
            pl += h.pl;
            dmgB += h.amt * frameBefore(s, h.t).ab;
            if (firstDmg && h.t >= firstDmg.t) dmgDamaged += h.amt;
        }
        if (firstDmg) capLossDmg += firstDmg.cap - capEnd;
    }
    cal[id] = { c0: capLossDmg / dmgDamaged, k: capLoss / dmgB, d: pl / dmg };
}

function spearman(a, b) {
    const rank = (v) => {
        const idx = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]);
        const r = new Array(v.length);
        for (let i = 0; i < idx.length; ) {
            let j = i;
            while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
            for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2;
            i = j + 1;
        }
        return r;
    };
    const ra = rank(a),
        rb = rank(b),
        n = a.length;
    const ma = ra.reduce((x, y) => x + y) / n,
        mb = rb.reduce((x, y) => x + y) / n;
    let num = 0,
        da = 0,
        db = 0;
    for (let i = 0; i < n; i++) {
        num += (ra[i] - ma) * (rb[i] - mb);
        da += (ra[i] - ma) ** 2;
        db += (rb[i] - mb) ** 2;
    }
    return num / Math.sqrt(da * db);
}
const median = (v) => {
    const s = [...v].sort((a, b) => a - b);
    return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};

// TTD models. dps = incoming damage/s over trailing W.
const models = {
    // capsule only: H / (c0 * dps)
    hitsNoArmour: (p, H, A, dps, c) => H / (c.c0 * dps),
    // armour first: plates drain at d*dps; capsule rate k*dps*b, b rises linearly b0 -> 1 as armour drains
    hitsArmour: (p, H, A, dps, c) => {
        const kd = c.k * dps;
        const b0 = p.ab;
        if (A <= 0 || b0 >= 1) return H / kd;
        const T1 = (A * p.ah) / p.a / (c.d * dps); // A is the (possibly tiered) armour fraction
        const L1 = (kd * T1 * (b0 + 1)) / 2;
        if (L1 < H) return T1 + (H - L1) / kd;
        // kd*(b0 t + (1-b0) t^2/(2 T1)) = H
        const qa = (kd * (1 - b0)) / (2 * T1),
            qb = kd * b0;
        return (-qb + Math.sqrt(qb * qb + 4 * qa * H)) / (2 * qa);
    },
};

const out = [];
const log = (s) => out.push(s);
const testFail = runs.filter((r) => !isCal(r) && !r.meta.passed);
log(`runs ${runs.length} (cal ${runs.filter(isCal).length}); test FAIL runs ${testFail.length}`);
log(
    `cal: ${STATIONS.map((id) => `${id} c0=${cal[id].c0.toExponential(2)} k=${cal[id].k.toExponential(2)} d=${cal[id].d.toFixed(2)}`).join('; ')}`,
);
log('| variant | stations | points | TTD=inf | median abs err | median pred/actual | err after oracle rescale | spearman | gate |');
log('|---|---|---|---|---|---|---|---|---|');
for (const W of [30, 60])
    for (const [mn, mf] of Object.entries(models))
        for (const [hn, hf] of Object.entries({ raw, tierMid, tierLow }))
            for (const [sn, sel] of [
                ['first', (pts) => pts.slice(0, 1)],
                ['all', (pts) => pts],
            ]) {
                const pred = [],
                    act = [],
                    errs = [],
                    ratio = [];
                let inf = 0,
                    n = 0;
                for (const r of testFail)
                    for (const id of STATIONS) {
                        const { s, loss, hits } = series(r, id);
                        if (loss === null) continue;
                        n++;
                        for (const p of sel(s.filter((p) => p.cap < 1 && p.t < loss))) {
                            const dps = hits.filter((h) => h.t <= p.t && h.t > p.t - W).reduce((a, h) => a + h.amt, 0) / W;
                            const ttd = dps > 0 ? mf(p, hf(p.cap), hf(p.a), dps, cal[id]) : Infinity;
                            const a = loss - p.t;
                            if (!isFinite(ttd)) inf++;
                            pred.push(isFinite(ttd) ? ttd : 1e9);
                            act.push(a);
                            ratio.push(ttd / a);
                            errs.push(isFinite(ttd) ? Math.abs(ttd - a) / a : Infinity);
                        }
                    }
                const k = median(ratio);
                const oracle = median(pred.map((x, j) => (x >= 1e9 ? Infinity : Math.abs(x / k - act[j]) / act[j])));
                const med = median(errs),
                    rho = spearman(pred, act);
                log(
                    `| ${mn} W${W} hull=${hn} ${sn} | ${n} | ${errs.length} | ${((inf / errs.length) * 100).toFixed(0)}% | ${(med * 100).toFixed(0)}% | ${k.toFixed(2)} | ${(oracle * 100).toFixed(0)}% | ${rho.toFixed(2)} | ${med < 0.3 && rho > 0.6 ? 'PASS' : 'FAIL'} |`,
                );
            }
console.log(out.join('\n'));
