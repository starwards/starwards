"""Train, evaluate and export the snapshot scorer.

    .venv/Scripts/python train.py --dataset <archive>/datasets/snapshots-<name>.csv --version v2 [--baseline v1]

Writes reports/<date>-<version>-training.md and ../src/scoring/models/<version>.json (the TS artefact, with
a parity fixture). See README.md for the protocol.
"""

import argparse
import datetime
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

SEED = 0
HERE = Path(__file__).resolve().parent
MODELS = HERE.parent / "src" / "scoring" / "models"
# label: (task, layer, persistence horizon in seconds = the label's own window)
LABELS = {
    "kill60": ("binary", "overall", 60),
    "damage30": ("regression", "overall", 30),
    "tactical45": ("regression", "tactical", 45),
    "opportunity45": ("regression", "tactical", 45),
    "conversion45": ("regression", "tactical", 45),
    "helms10": ("regression", "helms", 10),
    "engineer_kpi30": ("regression", "engineer", 30),
    "helms_score30": ("regression", "helms", 30),
}
OVERALL = ["kill60", "damage30"]
META_END = "target_id"
HGB_GAIN_THRESHOLD = 0.05  # trees must cut CV loss by >= 5% over the linear model to be chosen
TRAIN_STRIDE = 2  # fits use every 2nd frame of a run (1 Hz frames are strongly autocorrelated); evaluation uses all
BOOT = 300
MIN_SCENARIO_RUNS = 4
CAL_EPS = 0.001
# backwards benchmark: a scenario regresses only when the whole CI of Δ loss lies above this noise floor
# (the calibration floor alone costs up to -log(1 - CAL_EPS) ≈ 0.001 logloss), on at least this many runs
NOISE_FLOOR = {"binary": 0.002, "regression": 0.0005}
MIN_EVIDENCE_RUNS = 5
VALIDATION_SOURCES = ("engineer-kpi-2306/", "weapons-score/", "helms-score/")
# Energy mechanics a run was recorded under. Since #2306 energy draw grows as (power / NORMAL)² per unit of
# output; these code commits recorded under the merged mechanics (warp fix included; 6310123b is master after #2321). Every other commit
# predates it (flat draw). Engineer heads train and test only on power-draw runs.
POWER_DRAW_COMMITS = {"fe2d23bd", "d32e1f50", "6310123b", "9f79cc38"}
POWER_DRAW_ONLY = {"engineer_kpi30"}


def ece(y, p, bins=10):
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(p, edges) - 1, 0, bins - 1)
    return sum(abs(y[idx == b].mean() - p[idx == b].mean()) * (idx == b).mean() for b in range(bins) if (idx == b).any())


def reliability(y, p, bins=10):
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(p, edges) - 1, 0, bins - 1)
    return [(f"{edges[b]:.1f}-{edges[b + 1]:.1f}", int((idx == b).sum()), float(p[idx == b].mean()), float(y[idx == b].mean())) for b in range(bins) if (idx == b).any()]


def loss(task, y, p):
    if task == "binary":
        return float(log_loss(y, np.clip(p, 1e-6, 1 - 1e-6), labels=[0, 1]))
    return float(np.mean((y - p) ** 2))


def metrics(task, y, p):
    if task == "binary":
        pc = np.clip(p, 1e-6, 1 - 1e-6)
        return {"logloss": log_loss(y, pc, labels=[0, 1]), "brier": brier_score_loss(y, pc), "auc": roc_auc_score(y, pc) if len(set(y)) > 1 else float("nan"), "ece": ece(y, pc)}
    var = float(np.var(y))
    mse = float(np.mean((y - p) ** 2))
    return {"mse": mse, "mae": float(np.mean(np.abs(y - p))), "r2": 1 - mse / var if var > 0 else float("nan")}


def loss_name(task):
    return "logloss" if task == "binary" else "mse"


def make_model(kind, task):
    if kind == "linear":
        est = LogisticRegression(C=1.0, max_iter=2000) if task == "binary" else Ridge(alpha=1.0)
        return make_pipeline(StandardScaler(), est)
    common = dict(max_iter=200, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=40, l2_regularization=1.0, early_stopping=False, random_state=SEED)
    return HistGradientBoostingClassifier(**common) if task == "binary" else HistGradientBoostingRegressor(**common)


def fit(kind, task, X, y):
    if task == "binary" and len(set(y)) < 2:
        return ("const", float(y.mean()))
    return make_model(kind, task).fit(X, y)


def predict(model, task, X):
    if isinstance(model, tuple):
        return np.full(len(X), model[1])
    p = model.predict_proba(X)[:, 1] if task == "binary" else model.predict(X)
    return np.clip(p, 0.0, 1.0)


def thin(df):
    return df[(df["frame"] % TRAIN_STRIDE) == 0]


def oof(kind, task, d, features, label, folds=5):
    """Out-of-fold predictions on all rows of d (5-fold GroupKFold by run); fits on the thinned training folds."""
    out = np.zeros(len(d))
    X = d[features].to_numpy(float)
    y = d[label].to_numpy(float)
    keep = ((d["frame"] % TRAIN_STRIDE) == 0).to_numpy()
    for tr, va in GroupKFold(n_splits=folds).split(X, y, d["run_id"].to_numpy()):
        tr = tr[keep[tr]]
        out[va] = predict(fit(kind, task, X[tr], y[tr]), task, X[va])
    return out


def export_linear(model, task):
    scaler, est = model[0], model[-1]
    return {"kind": "logistic" if task == "binary" else "linear", "mean": scaler.mean_.tolist(), "scale": scaler.scale_.tolist(), "coef": np.ravel(est.coef_).tolist(), "intercept": float(np.ravel(est.intercept_)[0])}


def export_hgb(model, task):
    trees = []
    for [pred] in model._predictors:
        n = pred.nodes
        trees.append({"feature": n["feature_idx"].tolist(), "threshold": n["num_threshold"].tolist(), "missingLeft": n["missing_go_to_left"].astype(int).tolist(), "left": n["left"].tolist(), "right": n["right"].tolist(), "leaf": n["is_leaf"].astype(int).tolist(), "value": n["value"].tolist()})
    return {"kind": "hgb-logistic" if task == "binary" else "hgb", "baseline": float(np.ravel(model._baseline_prediction)[0]), "trees": trees}


def eval_export(art, X):
    """numpy re-implementation of the TS evaluator (`model.ts`), checked against sklearn before export."""
    if art["kind"] in ("logistic", "linear"):
        z = ((X - np.array(art["mean"])) / np.array(art["scale"])) @ np.array(art["coef"]) + art["intercept"]
    else:
        z = np.full(len(X), art["baseline"])
        for t in art["trees"]:
            feat, thr, ml, lf, rt, leaf, val = (np.array(t[k]) for k in ("feature", "threshold", "missingLeft", "left", "right", "leaf", "value"))
            node = np.zeros(len(X), dtype=int)
            active = leaf[node] == 0
            while active.any():
                r = np.nonzero(active)[0]
                v = X[r, feat[node[r]]]
                go_left = np.where(np.isnan(v), ml[node[r]] == 1, v <= thr[node[r]])
                node[r] = np.where(go_left, lf[node[r]], rt[node[r]])
                active = leaf[node] == 0
            z = z + val[node]
    p = 1 / (1 + np.exp(-z)) if art["kind"] in ("logistic", "hgb-logistic") else z
    p = np.clip(p, 0.0, 1.0)
    cal = art.get("calibration")
    return np.interp(p, cal["x"], cal["y"]) if cal else p


def boot_ci(items, stat, n=BOOT, seed=SEED):
    """95% bootstrap CI of stat over resamples of items (runs or seeds)."""
    rng = np.random.default_rng(seed)
    k = len(items)
    if k < 2:
        return (float("nan"), float("nan"))
    stats = [stat([items[i] for i in rng.integers(0, k, k)]) for _ in range(n)]
    return (float(np.percentile(stats, 2.5)), float(np.percentile(stats, 97.5)))


def paired_loss_delta(task, parts):
    """parts: per-run (y, p_a, p_b) -> loss(a) - loss(b) over the pooled rows."""
    y = np.concatenate([p[0] for p in parts])
    return loss(task, y, np.concatenate([p[1] for p in parts])) - loss(task, y, np.concatenate([p[2] for p in parts]))


def add_persistence(df, label, h):
    """label(t) predicted by its own value at t - h (the window that ends at t), same run."""
    past = df[["run_id", "t", label]].copy()
    past["t"] = (past["t"] + h).round().astype(int)
    past = past.rename(columns={label: "_past"}).drop_duplicates(["run_id", "t"])
    key = df[["run_id"]].copy()
    key["t"] = df["t"].round().astype(int)
    return key.merge(past, on=["run_id", "t"], how="left")["_past"].to_numpy(float)


def persistence_predict(task, past, train_y, train_past):
    """Regression: the past value itself. Binary: P(y | past value) from the training rows (a raw 0/1 would score infinite log loss)."""
    if task != "binary":
        return past
    ok = ~np.isnan(train_past)
    table = {v: float(np.clip(np.mean(train_y[ok][train_past[ok] == v]), CAL_EPS, 1 - CAL_EPS)) for v in (0.0, 1.0) if (train_past[ok] == v).any()}
    return np.array([np.nan if np.isnan(v) else table.get(v, float(np.mean(train_y))) for v in past])


def against(rep, args, name, label, task, features, te, pte):
    """Appends the table of the model's loss against the earlier artefact `name` on the same test rows, per mechanics and scenario."""
    other = json.loads((MODELS / f"{name}.json").read_text())
    if label not in other["models"]:
        return
    idx = [features.index(f) for f in other["features"]]
    pc = te.assign(_p=pte, _o=eval_export(other["models"][label], te[features].to_numpy(float)[:, idx]))
    groups = [(f"{a} / {b}", g) for (a, b), g in pc.groupby(["mechanics", "scenario"])] + list(pc.groupby("mechanics")) + [("all", pc)]
    rows = []
    for grp, part in groups:
        if part.run_id.nunique() < 2:
            continue
        per = [(g[label].to_numpy(float), g._p.to_numpy(), g._o.to_numpy()) for _, g in part.groupby("run_id")]
        d = paired_loss_delta(task, per)
        lo, hi = boot_ci(per, lambda ps: paired_loss_delta(task, ps))
        if lo > NOISE_FLOOR[task]:
            verdict = "**regressed**" if part.run_id.nunique() >= MIN_EVIDENCE_RUNS else "worse, insufficient evidence"
        else:
            verdict = "better" if hi < 0 else "no regression"
        y = part[label].to_numpy(float)
        rows.append(f"| {grp} | {part.run_id.nunique()} | {f4(loss(task, y, part._o.to_numpy()))} | {f4(loss(task, y, part._p.to_numpy()))} | {f4(d)} [{f4(lo)}, {f4(hi)}] | {verdict} |")
    rep.append(f"Against `{name}` on the same test rows ({loss_name(task)}; Δ = {args.version} − {name}, 95% CI over runs; regressed = CI above {NOISE_FLOOR[task]} on >= {MIN_EVIDENCE_RUNS} runs):\n\n"
               f"| mechanics / scenario | runs | {name} | {args.version} | Δ | {args.version} is |\n|---|---|---|---|---|---|\n" + "\n".join(rows) + "\n")


def calibration_runs(d):
    """The held-out calibration fold: 20% of d's runs, drawn once with the fixed seed."""
    runs = np.array(sorted(d.run_id.unique()))
    return set(np.random.default_rng(SEED).choice(runs, size=max(1, len(runs) // 5), replace=False))


def isotonic(p, y):
    """Isotonic calibration bounded to [CAL_EPS, 1 - CAL_EPS]: a fold of a few hundred runs cannot support a probability of exactly 0 or 1."""
    return IsotonicRegression(out_of_bounds="clip", y_min=CAL_EPS, y_max=1 - CAL_EPS).fit(p, y)


def skill(task, y, p, base):
    """Persistence gain 1 - loss(p) / loss(base); undefined where the baseline is already exact (a constant label)."""
    lb = loss(task, y, base)
    return 1 - loss(task, y, p) / lb if lb > 1e-6 else float("nan")


def fmt(d):
    return ", ".join(f"{k} {v:.4f}" for k, v in d.items())


def f4(x):
    return "–" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x:.4f}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True)
    ap.add_argument("--version", default="v2")
    ap.add_argument("--baseline", default="v1")
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    ap.add_argument("--compare", action="append", default=[], help="earlier artefact to score on the same test rows")
    ap.add_argument("--inherit", help="artefact whose heads are copied unchanged (not retrained), except those named by --train")
    ap.add_argument("--train", action="append", default=[], help="with --inherit: the heads to train; every other head is copied")
    args = ap.parse_args()
    np.random.seed(SEED)

    df = pd.read_csv(args.dataset, low_memory=False)
    manifest = json.loads(Path(args.dataset.replace(".csv", ".manifest.json")).read_text())
    cols = list(df.columns)
    features = cols[cols.index(META_END) + 1 : cols.index(next(iter(LABELS)))]
    assert features == manifest["features"], "dataset feature list differs from its manifest"
    df = df[np.isfinite(df[features]).all(axis=1)].reset_index(drop=True)
    df["seed"] = df["seed"].fillna(-1)
    df["day"] = df["day"].astype(str)
    df["source"] = df["source"].astype(str)
    # recorded exponent decides; runs archived before headers carried it fall back to the commit set
    exponent = pd.to_numeric(df["power_draw_exponent"], errors="coerce") if "power_draw_exponent" in df else pd.Series(np.nan, index=df.index)
    by_commit = df["code_commit"].astype(str).isin(POWER_DRAW_COMMITS)
    df["mechanics"] = np.where(exponent.notna(), np.where(exponent != 1, "power-draw", "flat-draw"), np.where(by_commit, "power-draw", "flat-draw"))
    for label in POWER_DRAW_ONLY:
        df.loc[df.mechanics != "power-draw", label] = np.nan
    df["crew"] = df["group"].astype(str).str.replace(r"^(engineer|weapons|helms)-", "", regex=True)

    # seed holdout: per scenario, the top 20% of distinct seeds; live runs (no seed) stay in train
    seeded = df[df.seed >= 0]
    cut = seeded.groupby("scenario")["seed"].transform(lambda s: np.quantile(s.unique(), 0.8))
    df["split"] = "train"
    df.loc[cut.index[(seeded["seed"] > cut).to_numpy()], "split"] = "test"
    assert not set(df[df.split == "train"].run_id) & set(df[df.split == "test"].run_id)

    # the baseline artefact's training runs (its rule: same seed cut over its dataset's days) leave the backwards benchmark
    base_art = json.loads((MODELS / f"{args.baseline}.json").read_text())
    base_idx = [features.index(f) for f in base_art["features"]]
    base_days = base_art["dataset"]["file"].replace("snapshots-", "").replace(".csv", "").split("_")
    old = df[df.day.isin(base_days)]
    old_seeded = old[old.seed >= 0]
    old_cut = old_seeded.groupby("scenario")["seed"].transform(lambda s: np.quantile(s.unique(), 0.8))
    base_train_runs = set(old_seeded.loc[(old_seeded["seed"] <= old_cut).to_numpy(), "run_id"]) | set(old[old.seed < 0].run_id)

    train, test = df[df.split == "train"], df[df.split == "test"]
    rep = [f"# Snapshot scorer {args.version} training report {args.date}\n"]
    rep.append(f"Dataset `{Path(args.dataset).name}` sha256 `{manifest['sha256'][:16]}`: {manifest['runs']} runs, {len(df)} rows "
               f"({train.run_id.nunique()} train runs / {len(train)} rows, {test.run_id.nunique()} test runs / {len(test)} rows), {len(features)} features. "
               f"Fits use every {TRAIN_STRIDE}nd frame of a run; every metric is on all rows. Baseline `{args.baseline}`: {len(base_train_runs)} of these runs were its training runs.\n")
    rep.append("Labelled rows by scenario:\n\n```\n" + df.groupby("scenario")[list(LABELS)].count().to_string() + "\n```\n")

    artefact = {"version": args.version, "created": args.date, "features": features, "featureHash": hashlib.sha256("\n".join(features).encode()).hexdigest()[:16],
                "dataset": {"file": manifest["out"], "sha256": manifest["sha256"], "runs": manifest["runs"], "rows": len(df)}, "models": {}}

    for label, (task, layer, h) in LABELS.items():
        df[f"_past_{label}"] = add_persistence(df, label, h)
        train, test = df[df.split == "train"], df[df.split == "test"]
        tr, te = train[train[label].notna()], test[test[label].notna()]
        if tr.run_id.nunique() < 5 or te.empty:
            rep.append(f"## {label}\n\nToo few labelled runs to train ({tr.run_id.nunique()} train, {te.run_id.nunique()} test).\n")
            continue
        if args.inherit and label not in args.train:
            inherited = json.loads((MODELS / f"{args.inherit}.json").read_text())
            assert inherited["features"] == features, f"{args.inherit} was trained on other features: it cannot be inherited"
            if label not in inherited["models"]:
                continue
            art = inherited["models"][label]
            pte = eval_export(art, te[features].to_numpy(float))
            yte = te[label].to_numpy(float)
            rep.append(f"## {label} ({layer}, {task}): inherited from `{args.inherit}`\n\nCopied unchanged, not retrained. Test rows {len(te)} ({te.run_id.nunique()} runs); test {loss_name(task)} {loss(task, yte, pte):.4f}.\n")
            for name in args.compare:
                against(rep, args, name, label, task, features, te, pte)
            artefact["models"][label] = art
            continue
        ytr, yte = tr[label].to_numpy(float), te[label].to_numpy(float)
        rep.append(f"## {label} ({layer}, {task})\n\nRows: train {len(tr)} ({tr.run_id.nunique()} runs), test {len(te)} ({te.run_id.nunique()} runs); "
                   f"censored {int(df[label].isna().sum())} of {len(df)}. Label mean {ytr.mean():.3f} train / {yte.mean():.3f} test.\n")

        # model family by grouped CV on train
        cv = {k: oof(k, task, tr, features, label) for k in ("linear", "hgb")}
        cvl = {k: loss(task, ytr, v) for k, v in cv.items()}
        kind = "hgb" if cvl["hgb"] < cvl["linear"] * (1 - HGB_GAIN_THRESHOLD) else "linear"

        # single best feature: best grouped-CV loss of a one-feature linear model, among the 10 most correlated
        with np.errstate(divide="ignore", invalid="ignore"):
            corr = tr[features].corrwith(tr[label]).abs().fillna(0).sort_values(ascending=False)
        single = min(list(corr.index[:10]), key=lambda f: loss(task, ytr, oof("linear", task, tr, [f], label)))

        # final fit; the binary head gets isotonic calibration fitted on a held-out calibration fold of train runs
        calib_runs = calibration_runs(tr) if task == "binary" else set()
        fit_rows = thin(tr[~tr.run_id.isin(calib_runs)])
        model = fit(kind, task, fit_rows[features].to_numpy(float), fit_rows[label].to_numpy(float))
        art = export_linear(model, task) if kind == "linear" else export_hgb(model, task)
        Xte = te[features].to_numpy(float)
        assert np.allclose(eval_export(art, Xte[:500]), predict(model, task, Xte[:500]), atol=1e-9), f"{label}: export parity"
        if task == "binary":
            cal_rows = tr[tr.run_id.isin(calib_runs)]
            iso = isotonic(predict(model, task, cal_rows[features].to_numpy(float)), cal_rows[label].to_numpy(float))
            art["calibration"] = {"x": iso.X_thresholds_.tolist(), "y": iso.y_thresholds_.tolist()}
        art["task"], art["station"] = task, layer
        pte = eval_export(art, Xte)
        m1 = fit("linear", task, thin(tr)[[single]].to_numpy(float), thin(tr)[label].to_numpy(float))
        p1 = predict(m1, task, te[[single]].to_numpy(float))
        pconst = np.full(len(te), ytr.mean())
        ppers = persistence_predict(task, te[f"_past_{label}"].to_numpy(float), ytr, tr[f"_past_{label}"].to_numpy(float))
        has_past = ~np.isnan(ppers)

        rep.append(f"Family: **{kind}** (CV {loss_name(task)} linear {cvl['linear']:.4f}, hgb {cvl['hgb']:.4f}). Single best feature `{single}`. "
                   f"Persistence: the label {h} s earlier, available on {has_past.mean():.0%} of test rows.\n")
        rep.append("Seed holdout, pooled test:\n\n| predictor | all test rows | rows with persistence |\n|---|---|---|")
        for name, p in (("constant", pconst), (f"single `{single}`", p1), (args.version, pte), ("persistence", ppers)):
            allrows = "–" if np.isnan(p).any() else fmt(metrics(task, yte, p))
            rep.append(f"| {name} | {allrows} | {fmt(metrics(task, yte[has_past], p[has_past])) if has_past.any() else '–'} |")
        gain = skill(task, yte[has_past], pte[has_past], ppers[has_past]) if has_past.any() else float("nan")
        rep.append(f"\n**Persistence gain** (1 − loss {args.version} / loss persistence, test rows with persistence): {gain:.3f}\n")
        mech = []
        for mname, part in te.assign(_p=pte).groupby("mechanics"):
            y = part[label].to_numpy(float)
            mech.append(f"| {mname} | {part.run_id.nunique()} | {len(part)} | {f4(loss(task, y, part._p.to_numpy()))} | {f4(loss(task, y, np.full(len(y), ytr.mean())))} |")
        rep.append(f"Per energy mechanics (test, {loss_name(task)}):\n\n| mechanics | runs | rows | {args.version} | constant |\n|---|---|---|---|---|\n" + "\n".join(mech) + "\n")
        for name in args.compare:
            against(rep, args, name, label, task, features, te, pte)
        if task == "binary":
            rep.append("Reliability (test, 10 bins):\n\n| bin | rows | mean p | observed |\n|---|---|---|---|\n" + "\n".join(f"| {b} | {n} | {p:.3f} | {o:.3f} |" for b, n, p, o in reliability(yte, pte)) + "\n")

        # per scenario on the seed holdout, with a bootstrap CI over runs of the loss difference model − persistence
        te = te.assign(_p=pte, _pers=ppers, _single=p1)
        rows = []
        for sc, part in te.groupby("scenario"):
            if part.run_id.nunique() < 2:
                continue
            y = part[label].to_numpy(float)
            hp = part[part._pers.notna()]
            per = [(g[label].to_numpy(float), g._p.to_numpy(), g._pers.to_numpy()) for _, g in hp.groupby("run_id")]
            d = paired_loss_delta(task, per) if per else float("nan")
            lo, hi = boot_ci(per, lambda ps: paired_loss_delta(task, ps)) if per else (float("nan"), float("nan"))
            pers = loss(task, hp[label].to_numpy(float), hp._pers.to_numpy()) if len(hp) else float("nan")
            rows.append(f"| {sc} | {part.run_id.nunique()} | {len(part)} | {y.mean():.3f} | {f4(loss(task, y, part._p.to_numpy()))} | {f4(loss(task, y, np.full(len(y), ytr.mean())))} | "
                        f"{f4(loss(task, y, part._single.to_numpy()))} | {f4(pers)} | {f4(d)} [{f4(lo)}, {f4(hi)}] |")
        rep.append(f"Per scenario, seed holdout ({loss_name(task)}; Δ = {args.version} − persistence on rows with persistence, 95% CI over runs):\n\n"
                   f"| scenario | runs | rows | label mean | {args.version} | constant | single | persistence | Δ vs persistence |\n|---|---|---|---|---|---|---|---|---|\n" + "\n".join(rows) + "\n")

        # leave one scenario out: refit (same family) without the scenario, test on all its rows
        lab = df[df[label].notna()]
        loso = []
        for sc, part in lab.groupby("scenario"):
            if part.run_id.nunique() < MIN_SCENARIO_RUNS:
                continue
            rest = lab[lab.scenario != sc]
            cal = calibration_runs(rest) if task == "binary" else set()
            fr = thin(rest[~rest.run_id.isin(cal)])
            if task == "binary" and fr[label].nunique() < 2:
                continue
            m = fit(kind, task, fr[features].to_numpy(float), fr[label].to_numpy(float))
            p = predict(m, task, part[features].to_numpy(float))
            if task == "binary":
                cr = rest[rest.run_id.isin(cal)]
                p = isotonic(predict(m, task, cr[features].to_numpy(float)), cr[label].to_numpy(float)).predict(p)
            y = part[label].to_numpy(float)
            pp = persistence_predict(task, part[f"_past_{label}"].to_numpy(float), rest[label].to_numpy(float), rest[f"_past_{label}"].to_numpy(float))
            hp = ~np.isnan(pp)
            g = skill(task, y[hp], p[hp], pp[hp]) if hp.any() else float("nan")
            loso.append((sc, part.run_id.nunique(), len(part), y.mean(), loss(task, y, p), loss(task, y, np.full(len(y), rest[label].mean())), loss(task, y[hp], pp[hp]) if hp.any() else float("nan"), g))
        rep.append(f"Leave one scenario out ({loss_name(task)}; refit without the scenario{', isotonic on a calibration fold of the rest' if task == 'binary' else ''}):\n\n"
                   "| held out | runs | rows | label mean | model | constant | persistence | persistence gain |\n|---|---|---|---|---|---|---|---|\n"
                   + "\n".join(f"| {sc} | {r} | {n} | {m:.3f} | {f4(a)} | {f4(c)} | {f4(p)} | {f4(g)} |" for sc, r, n, m, a, c, p, g in loso) + "\n")

        # leakage: does time-in-run add information beyond the snapshot?
        cv_t = oof(kind, task, tr.assign(_t=tr["t"]), features + ["_t"], label)
        rep.append(f"Leakage check: CV {loss_name(task)} with `t` added {loss(task, ytr, cv_t):.4f} vs {cvl[kind]:.4f} without.\n")

        art["metrics"] = {"cv": {loss_name(task): cvl[kind]}, "test": metrics(task, yte, pte), "testConstant": metrics(task, yte, pconst), "persistence": {"gain": gain}}
        artefact["models"][label] = art

        # backwards benchmark on the overall heads, per scenario, on test runs the baseline was not trained on
        if label in OVERALL and label in base_art["models"]:
            bt = te[~te.run_id.isin(base_train_runs)]
            bt = bt.assign(_base=eval_export(base_art["models"][label], bt[features].to_numpy(float)[:, base_idx]))
            rows = []
            for sc, part in list(bt.groupby("scenario")) + [("all", bt)]:
                if part.run_id.nunique() < 2:
                    continue
                per = [(g[label].to_numpy(float), g._p.to_numpy(), g._base.to_numpy()) for _, g in part.groupby("run_id")]
                d = paired_loss_delta(task, per)
                lo, hi = boot_ci(per, lambda ps: paired_loss_delta(task, ps))
                y = part[label].to_numpy(float)
                if lo > NOISE_FLOOR[task]:
                    verdict = "**regressed**" if part.run_id.nunique() >= MIN_EVIDENCE_RUNS else "worse, insufficient evidence"
                else:
                    verdict = "better" if hi < 0 else "no regression"
                old_sc = "yes" if (df[(df.scenario == sc) & df.day.isin(base_days)].size or sc == "all") else "no"
                rows.append(f"| {sc} | {old_sc} | {part.run_id.nunique()} | {len(part)} | {f4(loss(task, y, part._base.to_numpy()))} | {f4(loss(task, y, part._p.to_numpy()))} | {f4(d)} [{f4(lo)}, {f4(hi)}] | {verdict} |")
            rep.append(f"Backwards benchmark ({args.baseline} vs {args.version}, {loss_name(task)}, test runs outside {args.baseline}'s training set; Δ = {args.version} − {args.baseline}, 95% CI over runs; regressed = CI above {NOISE_FLOOR[task]} on >= {MIN_EVIDENCE_RUNS} runs):\n\n"
                       f"| scenario | in {args.baseline}'s days | runs | rows | {args.baseline} | {args.version} | Δ | {args.version} is |\n|---|---|---|---|---|---|---|---|\n" + "\n".join(rows) + "\n")

    rep.append(behaviour(df, features, artefact))

    fixture = df[df.split == "test"].sample(n=min(40, int((df.split == "test").sum())), random_state=SEED)
    Xf = fixture[features].to_numpy(float)
    artefact["fixture"] = {"features": Xf.tolist(), "predictions": {k: eval_export(a, Xf).tolist() for k, a in artefact["models"].items()}}
    for v in artefact["models"].values():
        v["metrics"] = {s: {k: (None if isinstance(x, float) and math.isnan(x) else round(float(x), 6)) for k, x in m.items()} for s, m in v["metrics"].items()}
    (MODELS / f"{args.version}.json").write_text(json.dumps(artefact, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")
    rep.append(f"## Artefact\n\n`modules/ai/src/scoring/models/{args.version}.json`: feature hash `{artefact['featureHash']}`, models: " + ", ".join(f"{k} {v['kind']}" for k, v in artefact["models"].items()) + ".\n")
    (HERE / "reports").mkdir(exist_ok=True)
    report = HERE / "reports" / f"{args.date}-{args.version}-training.md"
    report.write_text("\n".join(rep) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {args.version}.json and {report.name}")


ORDERINGS = [
    # (source prefix, head, a, b, scenarios where the ordering is required; None = every scenario with both crews)
    ("engineer-kpi-2306/", "engineer_kpi30", "reference", "idle", None),
    ("engineer-kpi-2306/", "engineer_kpi30", "reference", "all-max", None),
    ("engineer-kpi-2306/", "engineer_kpi30", "reference", "random", None),
    ("engineer-kpi-2306/", "engineer_kpi30", "idle", "all-shutdown", {"T0-constrained", "all"}),
    ("weapons-score/", "tactical45", "reference", "idle", None),
    ("weapons-score/", "conversion45", "reference", "idle", None),
    ("weapons-score/", "conversion45", "reference", "wrong-ammo", None),
    ("weapons-score/", "tactical45", "torpedo-reference", "reference", {"W-outranged"}),
    ("helms-score/", "helms_score30", "reference", "idle", None),
    ("helms-score/", "helms_score30", "reference", "random", None),
    ("helms-score/", "helms_score30", "reference", "charge", None),
    ("helms-score/", "helms_score30", "reference", "close-in", None),
    ("helms-score/", "helms_score30", "reference", "no-weave", None),
    ("helms-score/", "helms_score30", "reference", "far-off", None),
]


def behaviour(df, features, artefact):
    """Run means of each station head's label and of the model's prediction, paired by seed. Predictions are out-of-fold:
    5 folds grouped by seed number, and a fold's fit drops every run with a held seed (the same seed lays out the same scenario)."""
    val = df[df.source.str.startswith(VALIDATION_SOURCES)].copy()
    seeds = np.unique(val.seed)
    for head in sorted({o[1] for o in ORDERINGS}):
        if head not in artefact["models"] or len(seeds) < 5:
            continue
        task = LABELS[head][0]
        kind = "hgb" if artefact["models"][head]["kind"].startswith("hgb") else "linear"
        val[f"_oof_{head}"] = np.nan
        for _, va in GroupKFold(n_splits=5).split(seeds, groups=seeds):
            held = set(seeds[va])
            fr = thin(df[df[head].notna() & ~df.seed.isin(held)])
            m = fit(kind, task, fr[features].to_numpy(float), fr[head].to_numpy(float))
            rows = val.seed.isin(held)
            val.loc[rows, f"_oof_{head}"] = predict(m, task, val.loc[rows, features].to_numpy(float))
    out = ["## Behavioural ordering (matched-seed validation runs)\n",
           "Run mean of the label (labelled frames) and of the model's out-of-fold prediction (every frame with a duel). Δ = a − b paired by seed, "
           "95% bootstrap CI over seeds; ✓ CI above 0, ✗ below. Orderings marked informational are not required there.\n",
           "| source | head | ordering | scenario | seeds | label Δ | model Δ | same sign |\n|---|---|---|---|---|---|---|---|"]
    for src, head, a, b, required in ORDERINGS:
        part = val[val.source.str.startswith(src)]
        if f"_oof_{head}" not in part:
            continue
        runs = part.groupby(["scenario", "crew", "seed"]).agg(label=(head, "mean"), model=(f"_oof_{head}", "mean")).reset_index()
        for sc in sorted(runs.scenario.unique()) + ["all"]:
            r = runs if sc == "all" else runs[runs.scenario == sc]
            j = r[r.crew == a].set_index(["scenario", "seed"]).join(r[r.crew == b].set_index(["scenario", "seed"]), lsuffix="_a", rsuffix="_b", how="inner")
            if not len(j):
                continue
            res = []
            for col in ("label", "model"):
                d = (j[f"{col}_a"] - j[f"{col}_b"]).dropna().to_numpy()
                if not len(d):
                    res.append(("–", None))
                    continue
                lo, hi = boot_ci(list(d), lambda xs: float(np.mean(xs)))
                res.append((f"{d.mean():.3f} [{f4(lo)}, {f4(hi)}]{' ✓' if lo > 0 else ' ✗' if hi < 0 else ''}", d.mean()))
            req = required is None or sc in required
            same = "–" if res[0][1] is None or res[1][1] is None else ("yes" if np.sign(res[0][1]) == np.sign(res[1][1]) else "**no**")
            out.append(f"| {src[:-1]} | {head} | {a} > {b}{'' if req else ' (informational)'} | {sc} | {len(j)} | {res[0][0]} | {res[1][0]} | {same} |")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    main()
