"""Train, evaluate and export the snapshot scorer.

    .venv/Scripts/python train.py --dataset <archive>/datasets/snapshots-<days>.csv [--version v1]

Writes reports/<date>.md and ../src/scoring/models/<version>.json (the TS artefact, with a parity
fixture). See README.md for the protocol.
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
from sklearn.inspection import permutation_importance
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import brier_score_loss, log_loss, mean_absolute_error, r2_score, roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

SEED = 0
HERE = Path(__file__).resolve().parent
LABELS = {
    # label: (task, station, single-feature baseline declared up front)
    "kill60": ("binary", "overall", "w_target_capsule"),
    "damage30": ("regression", "overall", "o_target_hostile"),
    "helms10": ("regression", "helms", "h_in_firing_position"),
    "weapons10": ("regression", "weapons", "h_in_firing_position"),
    "engineer30": ("regression", "engineer", "e_mean_effectiveness"),
    "signals30": ("regression", "signals", "s_target_job_progress"),
}
META_END = "target_id"
HGB_GAIN_THRESHOLD = 0.05  # trees must cut CV loss by >= 5% over the linear model to be chosen
MAP_HOLDOUT = "training_t1"


def ece(y, p, bins=10):
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(p, edges) - 1, 0, bins - 1)
    return sum(abs(y[idx == b].mean() - p[idx == b].mean()) * (idx == b).mean() for b in range(bins) if (idx == b).any())


def metrics(task, y, p):
    if task == "binary":
        p = np.clip(p, 1e-6, 1 - 1e-6)
        return {
            "logloss": log_loss(y, p, labels=[0, 1]),
            "brier": brier_score_loss(y, p),
            "auc": roc_auc_score(y, p) if len(set(y)) > 1 else float("nan"),
            "ece": ece(y, p),
        }
    return {"mse": float(np.mean((y - p) ** 2)), "mae": mean_absolute_error(y, p), "r2": r2_score(y, p) if len(y) > 1 else float("nan")}


def loss_key(task):
    return "logloss" if task == "binary" else "mse"


def make_model(kind, task):
    if kind == "linear":
        est = LogisticRegression(C=1.0, max_iter=2000) if task == "binary" else Ridge(alpha=1.0)
        return make_pipeline(StandardScaler(), est)
    common = dict(max_iter=200, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=40, l2_regularization=1.0, early_stopping=False, random_state=SEED)
    return HistGradientBoostingClassifier(**common) if task == "binary" else HistGradientBoostingRegressor(**common)


def predict(model, task, X):
    p = model.predict_proba(X)[:, 1] if task == "binary" else model.predict(X)
    return np.clip(p, 0.0, 1.0)


def oof(kind, task, X, y, groups, folds=5):
    out = np.zeros(len(y))
    for tr, va in GroupKFold(n_splits=folds).split(X, y, groups):
        if task == "binary" and len(set(y[tr])) < 2:
            out[va] = y[tr].mean()
            continue
        m = make_model(kind, task).fit(X[tr], y[tr])
        out[va] = predict(m, task, X[va])
    return out


def fmt(d):
    return ", ".join(f"{k} {v:.4f}" for k, v in d.items())


def export_linear(model, task):
    scaler, est = model[0], model[-1]
    return {
        "kind": "logistic" if task == "binary" else "linear",
        "mean": scaler.mean_.tolist(),
        "scale": scaler.scale_.tolist(),
        "coef": np.ravel(est.coef_).tolist(),
        "intercept": float(np.ravel(est.intercept_)[0]),
    }


def export_hgb(model, task):
    trees = []
    for [pred] in model._predictors:
        n = pred.nodes
        trees.append(
            {
                "feature": n["feature_idx"].tolist(),
                "threshold": n["num_threshold"].tolist(),
                "missingLeft": n["missing_go_to_left"].astype(int).tolist(),
                "left": n["left"].tolist(),
                "right": n["right"].tolist(),
                "leaf": n["is_leaf"].astype(int).tolist(),
                "value": n["value"].tolist(),
            }
        )
    return {"kind": "hgb-logistic" if task == "binary" else "hgb", "baseline": float(np.ravel(model._baseline_prediction)[0]), "trees": trees}


def eval_export(art, X):
    """numpy re-implementation of the TS evaluator, checked against sklearn before export."""
    if art["kind"] in ("logistic", "linear"):
        z = ((X - np.array(art["mean"])) / np.array(art["scale"])) @ np.array(art["coef"]) + art["intercept"]
    else:
        z = np.full(len(X), art["baseline"])
        for t in art["trees"]:
            for r in range(len(X)):
                i = 0
                while not t["leaf"][i]:
                    v = X[r, t["feature"][i]]
                    go_left = t["missingLeft"][i] if math.isnan(v) else v <= t["threshold"][i]
                    i = t["left"][i] if go_left else t["right"][i]
                z[r] += t["value"][i]
    p = 1 / (1 + np.exp(-z)) if art["kind"] in ("logistic", "hgb-logistic") else z
    return np.clip(p, 0.0, 1.0)


def calibrate(art, X):
    p = eval_export(art, X)
    cal = art.get("calibration")
    return np.interp(p, cal["x"], cal["y"]) if cal else p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True)
    ap.add_argument("--version", default="v1")
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    args = ap.parse_args()
    np.random.seed(SEED)

    df = pd.read_csv(args.dataset, low_memory=False)
    manifest = json.loads(Path(args.dataset.replace(".csv", ".manifest.json")).read_text())
    cols = list(df.columns)
    features = cols[cols.index(META_END) + 1 : cols.index("kill60")]
    assert features == manifest["features"], "dataset feature list differs from its manifest"
    df = df[np.isfinite(df[features]).all(axis=1)].reset_index(drop=True)

    # held-out test by seed range: per scenario, the top 20% of distinct seeds; live runs (no seed) stay in train
    df["seed"] = df["seed"].fillna(-1)
    cut = df[df.seed >= 0].groupby("scenario")["seed"].transform(lambda s: np.quantile(s.unique(), 0.8))
    df["split"] = "train"
    df.loc[cut.index[(df.loc[cut.index, "seed"] > cut).to_numpy()], "split"] = "test"
    train, test = df[df.split == "train"], df[df.split == "test"]
    assert not set(train.run_id) & set(test.run_id)

    rep = [f"# Snapshot scorer training report {args.date}\n"]
    rep.append(f"Dataset `{Path(args.dataset).name}` sha256 `{manifest['sha256'][:16]}`: {manifest['runs']} runs, {len(df)} rows "
               f"({train.run_id.nunique()} train runs / {len(train)} rows, {test.run_id.nunique()} test runs / {len(test)} rows). "
               f"{len(features)} features. Test = top 20% of seeds per scenario. CV = 5-fold GroupKFold by run on train.\n")
    rep.append("Rows by scenario and crew policy:\n\n```\n" + df.groupby(["scenario", "policy"]).size().unstack(fill_value=0).to_string() + "\n```\n")

    artefact = {
        "version": args.version,
        "created": args.date,
        "features": features,
        "featureHash": hashlib.sha256("\n".join(features).encode()).hexdigest()[:16],
        "dataset": {"file": manifest["out"], "sha256": manifest["sha256"], "runs": manifest["runs"], "rows": len(df)},
        "models": {},
    }
    fixture_rows = test.sample(n=min(40, len(test)), random_state=SEED)

    for label, (task, station, single) in LABELS.items():
        tr = train[train[label].notna()]
        te = test[test[label].notna()]
        Xtr, ytr, gtr = tr[features].to_numpy(float), tr[label].to_numpy(float), tr.run_id.to_numpy()
        Xte, yte = te[features].to_numpy(float), te[label].to_numpy(float)
        rep.append(f"## {label} ({station}, {task})\n\nRows: train {len(tr)} ({tr.run_id.nunique()} runs), test {len(te)}; label mean {ytr.mean():.3f} train / {yte.mean():.3f} test.\n")
        rows = []
        const = np.full(len(yte), ytr.mean())
        cv_const = metrics(task, ytr, np.full(len(ytr), ytr.mean()))  # in-sample constant: upper bound on its CV quality
        rows.append(("constant (train mean)", cv_const, metrics(task, yte, const)))
        j = features.index(single)
        cv1 = oof("linear", task, Xtr[:, [j]], ytr, gtr)
        m1 = make_model("linear", task).fit(Xtr[:, [j]], ytr)
        rows.append((f"single feature `{single}`", metrics(task, ytr, cv1), metrics(task, yte, predict(m1, task, Xte[:, [j]]))))
        cv = {}
        fitted = {}
        for kind in ("linear", "hgb"):
            cv[kind] = oof(kind, task, Xtr, ytr, gtr)
            fitted[kind] = make_model(kind, task).fit(Xtr, ytr)
            rows.append((kind, metrics(task, ytr, cv[kind]), metrics(task, yte, predict(fitted[kind], task, Xte))))
        lk = loss_key(task)
        lin_loss, hgb_loss = metrics(task, ytr, cv["linear"])[lk], metrics(task, ytr, cv["hgb"])[lk]
        kind = "hgb" if hgb_loss < lin_loss * (1 - HGB_GAIN_THRESHOLD) else "linear"
        model = fitted[kind]
        art = export_linear(model, task) if kind == "linear" else export_hgb(model, task)
        # parity of the exported form against sklearn
        assert np.allclose(eval_export(art, Xte[:200]), predict(model, task, Xte[:200]), atol=1e-9), f"{label}: export parity"
        if task == "binary":
            iso = IsotonicRegression(out_of_bounds="clip", y_min=0, y_max=1).fit(cv[kind], ytr)  # fitted on validation folds only
            art["calibration"] = {"x": iso.X_thresholds_.tolist(), "y": iso.y_thresholds_.tolist()}
            rows.append((f"{kind} + isotonic (CV column: calibrated in-sample on OOF)", metrics(task, ytr, iso.predict(cv[kind])), metrics(task, yte, calibrate(art, Xte))))
        final_te = calibrate(art, Xte)
        rep.append("| model | CV | test |\n|---|---|---|")
        rep += [f"| {n} | {fmt(c)} | {fmt(t)} |" for n, c, t in rows]
        rep.append(f"\nChosen: **{kind}** (CV {lk} linear {lin_loss:.4f} vs hgb {hgb_loss:.4f}; trees need >= {HGB_GAIN_THRESHOLD:.0%} gain).\n")

        # per-scenario breakdown on test
        br = []
        for sc, part in te.groupby("scenario"):
            if len(part) >= 20:
                y = part[label].to_numpy(float)
                br.append(f"| {sc} | {len(part)} | {y.mean():.3f} | {fmt(metrics(task, y, calibrate(art, part[features].to_numpy(float))))} |")
        rep.append("Per scenario (test):\n\n| scenario | rows | label mean | metrics |\n|---|---|---|---|\n" + "\n".join(br) + "\n")

        # map holdout: train without MAP_HOLDOUT, test on it
        hold_tr = tr[tr["map"] != MAP_HOLDOUT]
        hold_te = df[(df["map"] == MAP_HOLDOUT) & df[label].notna()]
        if len(hold_te) and len(set(hold_tr[label])) > 1:
            mh = make_model(kind, task).fit(hold_tr[features].to_numpy(float), hold_tr[label].to_numpy(float))
            yh = hold_te[label].to_numpy(float)
            rep.append(f"Map holdout (train without `{MAP_HOLDOUT}`, test on all its {len(hold_te)} rows): {fmt(metrics(task, yh, predict(mh, task, hold_te[features].to_numpy(float))))}; "
                       f"constant: {fmt(metrics(task, yh, np.full(len(yh), hold_tr[label].mean())))}\n")

        # permutation importance (test), aggregated by station prefix
        scoring = "neg_log_loss" if task == "binary" else "neg_mean_squared_error"
        pi = permutation_importance(model, Xte, yte, scoring=scoring, n_repeats=5, random_state=SEED)
        order = np.argsort(-pi.importances_mean)[:8]
        rep.append("Permutation importance (test, top 8): " + ", ".join(f"`{features[i]}` {pi.importances_mean[i]:.4f}" for i in order))
        groups = {}
        for i, f in enumerate(features):
            groups[f[0]] = groups.get(f[0], 0) + pi.importances_mean[i]
        rep.append("; by group: " + ", ".join(f"{g} {v:.4f}" for g, v in sorted(groups.items(), key=lambda kv: -kv[1])) + "\n")

        # leakage: does time-in-run add information beyond the snapshot?
        Xt = np.column_stack([Xtr, tr["t"].to_numpy(float)])
        cv_t = oof(kind, task, Xt, ytr, gtr)
        rep.append(f"Leakage check: corr(t, label) {np.corrcoef(tr['t'], ytr)[0, 1]:.3f}; CV {lk} with `t` added {metrics(task, ytr, cv_t)[lk]:.4f} vs {metrics(task, ytr, cv[kind])[lk]:.4f} without.\n")
        # drift across policies
        by_pol = tr.groupby("policy")[label].agg(["size", "mean"])
        rep.append("Label by crew policy (train): " + ", ".join(f"{p} {r['mean']:.3f} (n={int(r['size'])})" for p, r in by_pol.iterrows()) + "\n")

        art["task"] = task
        art["station"] = station
        art["metrics"] = {"cv": metrics(task, ytr, cv[kind]), "test": metrics(task, yte, final_te), "testConstant": metrics(task, yte, const)}
        artefact["models"][label] = art

    # feature drift across policies: largest standardised mean differences jev vs reference
    a, b = df[df.policy == "jev"][features], df[df.policy == "reference"][features]
    if len(a) and len(b):
        smd = ((a.mean() - b.mean()) / df[features].std().replace(0, np.nan)).abs().sort_values(ascending=False).head(8)
        rep.append("## Feature drift jev vs reference crews\n\nLargest |standardised mean difference|: " + ", ".join(f"`{k}` {v:.2f}" for k, v in smd.items()) + "\n")

    Xf = fixture_rows[features].to_numpy(float)
    artefact["fixture"] = {
        "features": Xf.tolist(),
        "predictions": {label: calibrate(art, Xf).tolist() for label, art in artefact["models"].items()},
    }
    for v in artefact["models"].values():
        v["metrics"] = {s: {k: (None if isinstance(x, float) and math.isnan(x) else round(float(x), 6)) for k, x in m.items()} for s, m in v["metrics"].items()}
    out = HERE.parent / "src" / "scoring" / "models" / f"{args.version}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(artefact, separators=(",", ":")) + "\n", newline="\n")
    rep.append(f"## Artefact\n\n`modules/ai/src/scoring/models/{args.version}.json`: feature hash `{artefact['featureHash']}`, models: "
               + ", ".join(f"{k} {v['kind']}" for k, v in artefact["models"].items()) + ".\n")
    (HERE / "reports").mkdir(exist_ok=True)
    (HERE / "reports" / f"{args.date}.md").write_text("\n".join(rep) + "\n", newline="\n")
    print("\n".join(rep))


if __name__ == "__main__":
    main()
