"""Train, evaluate and export the radar isochrone heatmaps.

    ../.venv/Scripts/python train_heatmap.py --base <archive>/datasets/heatmap-<days> [--version v1]

Reads <base>-{threat,cells,iso}.csv (written by `npm --prefix modules/ai run heatmap:dataset`), writes
../reports/<date>-heatmap.md and ../../src/heatmap/models/<version>.json. Protocol: ../README.md#heatmaps.
"""

import argparse
import datetime
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from train import ece, eval_export, export_hgb, export_linear  # noqa: E402

SEED = 0
SECTORS, BANDS = 8, 4
CELLS = SECTORS * BANDS
BAND_EDGES = [5, 15, 40]
HORIZONS = [5, 10]
MAP_HOLDOUT = "training_t1"
MIN_POS = 30  # a per-cell model needs this many positives in train, else the cell keeps its frequency
GRID_GAIN = 0.02  # the across-grid model must cut CV loss by >= 2% over the per-cell models
FOLDS = 5
THREAT_CELL = ["is_current", "is_drift", "drift_km"]
POSITION_CELL = ["centre_range_km", "centre_aim_off", "centre_in_band"]


def cell_id(c):
    s, b = c // BANDS, c % BANDS
    a = s * 2 * math.pi / SECTORS
    return [math.cos(a), math.sin(a)] + [1.0 if i == b else 0.0 for i in range(BANDS)]


CELL_ID = np.array([cell_id(c) for c in range(CELLS)])


def split(df):
    df["seed"] = df["seed"].fillna(-1)
    seeded = df[df.seed >= 0]
    cut = seeded.groupby("scenario")["seed"].transform(lambda s: np.quantile(s.unique(), 0.8))
    df["split"] = "train"
    df.loc[cut.index[(seeded["seed"] > cut).to_numpy()], "split"] = "test"
    assert not set(df[df.split == "train"].run_id) & set(df[df.split == "test"].run_id)
    return df


def bins(train_frame):
    """Baseline conditioning: closing-speed terciles (train) x target aspect thirds."""
    q = np.quantile(train_frame["closing_speed"], [1 / 3, 2 / 3]).tolist()
    return {"closingEdges": q, "aspectEdges": [1 / 3, 2 / 3]}


def bin_index(df, b):
    return np.digitize(df["closing_speed"], b["closingEdges"]) * 3 + np.digitize(df["target_aspect"], b["aspectEdges"])


def fmt(d):
    return ", ".join(f"{k} {v:.4f}" for k, v in d.items())


# ---------------------------------------------------------------- threat (categorical over cells)


def threat_cells(df, h):
    """(rows, CELLS, 3) per-cell inputs."""
    drift_km = df[[f"drift_km_{h}_{c}" for c in range(CELLS)]].to_numpy(float)
    cur = df["current"].to_numpy(int)[:, None] == np.arange(CELLS)[None, :]
    dri = df[f"drift_cell_{h}"].to_numpy(int)[:, None] == np.arange(CELLS)[None, :]
    return np.stack([cur.astype(float), dri.astype(float), drift_km], axis=2)


def threat_metrics(y, P):
    P = np.clip(P, 1e-6, 1)
    P = P / P.sum(1, keepdims=True)
    rank = np.argsort(-P, axis=1)
    onehot = np.zeros_like(P)
    onehot[np.arange(len(y)), y] = 1
    return {
        "logloss": float(-np.mean(np.log(P[np.arange(len(y)), y]))),
        "top1": float(np.mean(rank[:, 0] == y)),
        "top3": float(np.mean((rank[:, :3] == y[:, None]).any(1))),
        "brier": float(np.mean(np.sum((P - onehot) ** 2, 1))),
        "ece": float(ece(onehot.ravel(), P.ravel())),
    }


class Marginal:
    def fit(self, F, C, y, frame):
        self.p = (np.bincount(y, minlength=CELLS) + 1) / (len(y) + CELLS)
        return self

    def predict(self, F, C, frame):
        return np.tile(self.p, (len(F), 1))


class Binned:
    """P(cell | target's current cell, closing tercile, aspect third), shrunk to the marginal."""

    def fit(self, F, C, y, frame):
        self.b = bins(frame)
        self.marg = (np.bincount(y, minlength=CELLS) + 1) / (len(y) + CELLS)
        key = frame["current"].to_numpy(int) * 9 + bin_index(frame, self.b)
        counts = np.zeros((CELLS * 9, CELLS))
        np.add.at(counts, (key, y), 1)
        self.table = (counts + 5 * self.marg) / (counts.sum(1, keepdims=True) + 5)
        return self

    def predict(self, F, C, frame):
        return self.table[frame["current"].to_numpy(int) * 9 + bin_index(frame, self.b)]

    def export(self):
        return {"kind": "binned", "by": "current", **self.b, "table": self.table.tolist()}


def logistic():
    return make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=2000))


def hgb(task):
    common = dict(max_iter=200, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=40, l2_regularization=1.0, early_stopping=False, random_state=SEED)
    return HistGradientBoostingClassifier(**common) if task == "binary" else HistGradientBoostingRegressor(**common)


class PerCellBinary:
    """One logistic model per cell on frame inputs + that cell's inputs; sparse cells keep their frequency."""

    def __init__(self, task="binary"):
        self.task = task

    def fit(self, F, C, y, frame):
        # y: (rows, CELLS) 0/1 targets (threat) or per-row cell + label (positions, see PositionPerCell)
        self.models = []
        for c in range(CELLS):
            yc = y[:, c]
            X = np.hstack([F, C[:, c, :]])
            if yc.sum() >= MIN_POS and (len(yc) - yc.sum()) >= MIN_POS:
                self.models.append(logistic().fit(X, yc))
            else:
                self.models.append(float((yc.sum() + 0.5) / (len(yc) + 1)))
        return self

    def predict(self, F, C, frame):
        out = np.zeros((len(F), CELLS))
        for c, m in enumerate(self.models):
            out[:, c] = m if isinstance(m, float) else m.predict_proba(np.hstack([F, C[:, c, :]]))[:, 1]
        return out

    def export(self):
        return {"kind": "per-cell", "models": [{"constant": m} if isinstance(m, float) else {**export_linear(m, "binary"), "task": "binary"} for m in self.models]}


class GridBinary:
    """One HGB over (frame, cell) pairs: frame inputs + cell inputs + cell identity."""

    def fit(self, F, C, y, frame, subsample=4):
        X, Y = long(F, C), y.ravel()
        rng = np.random.default_rng(SEED)
        keep = (Y == 1) | (rng.random(len(Y)) < 1 / subsample)  # negatives subsampled; reweighted below
        w = np.where(Y[keep] == 1, 1.0, float(subsample))
        self.m = hgb("binary").fit(X[keep], Y[keep], sample_weight=w)
        return self

    def predict(self, F, C, frame):
        return self.m.predict_proba(long(F, C))[:, 1].reshape(len(F), CELLS)

    def export(self):
        return {"kind": "grid", "model": {**export_hgb(self.m, "binary"), "task": "binary"}}


def long(F, C):
    n = len(F)
    return np.hstack([np.repeat(F, CELLS, axis=0), C.reshape(n * CELLS, -1), np.tile(CELL_ID, (n, 1))])


def threat_section(df, frame_features, rep, artefact, fixture):
    for h in HORIZONS:
        lab = f"cell{h}"
        d = df[df[lab].notna()].reset_index(drop=True)
        d[lab] = d[lab].astype(int)
        tr, te = d[d.split == "train"].reset_index(drop=True), d[d.split == "test"].reset_index(drop=True)
        F = lambda x: x[frame_features].to_numpy(float)  # noqa: E731
        Y = lambda x: np.eye(CELLS)[x[lab].to_numpy(int)]  # noqa: E731
        rep.append(f"## threat{h}: P(target in cell at t+{h} s)\n\nRows: train {len(tr)} ({tr.run_id.nunique()} runs), test {len(te)} ({te.run_id.nunique()} runs). "
                   f"Target cell frequency (train, top 6): " + ", ".join(f"{c} {v:.3f}" for c, v in tr[lab].value_counts(normalize=True).head(6).items()) + "\n")
        stay = float(np.mean(tr[lab] == tr["current"]))
        rep.append(f"Share of rows where the target is still in its current cell: {stay:.3f}; cells with >= {MIN_POS} train positives: "
                   f"{int((np.bincount(tr[lab], minlength=CELLS) >= MIN_POS).sum())}/{CELLS}.\n")
        makers = {"marginal": Marginal, "binned (current cell x closing x aspect)": Binned, "per-cell logistic": PerCellBinary, "grid hgb": GridBinary}
        rows, cvloss, fitted = [], {}, {}
        groups = tr.run_id.to_numpy()
        for name, mk in makers.items():
            oof = np.zeros((len(tr), CELLS))
            for a, b in GroupKFold(n_splits=FOLDS).split(tr, groups=groups):
                ta, tb = tr.iloc[a].reset_index(drop=True), tr.iloc[b].reset_index(drop=True)
                m = mk().fit(F(ta), threat_cells(ta, h), Y(ta) if mk in (PerCellBinary, GridBinary) else ta[lab].to_numpy(int), ta)
                oof[b] = m.predict(F(tb), threat_cells(tb, h), tb)
            m = mk().fit(F(tr), threat_cells(tr, h), Y(tr) if mk in (PerCellBinary, GridBinary) else tr[lab].to_numpy(int), tr)
            fitted[name] = m
            cvm = threat_metrics(tr[lab].to_numpy(int), oof)
            cvloss[name] = cvm["logloss"]
            rows.append((name, cvm, threat_metrics(te[lab].to_numpy(int), m.predict(F(te), threat_cells(te, h), te))))
        rep.append("| model | CV | test |\n|---|---|---|")
        rep += [f"| {n} | {fmt(c)} | {fmt(t)} |" for n, c, t in rows]
        best_simple = min(["binned (current cell x closing x aspect)", "per-cell logistic"], key=lambda n: cvloss[n])
        chosen = "grid hgb" if cvloss["grid hgb"] < cvloss[best_simple] * (1 - GRID_GAIN) else best_simple
        rep.append(f"\nChosen: **{chosen}** (CV logloss: " + ", ".join(f"{n} {v:.4f}" for n, v in cvloss.items()) + f"; grid needs >= {GRID_GAIN:.0%} over the best simpler model).\n")
        # unseen map
        htr = tr[tr["map"] != MAP_HOLDOUT].reset_index(drop=True)
        hte = d[d["map"] == MAP_HOLDOUT].reset_index(drop=True)
        mk = makers[chosen]
        res = []
        for name in dict.fromkeys(["marginal", "binned (current cell x closing x aspect)", chosen]):
            mk2 = makers[name]
            m = mk2().fit(F(htr), threat_cells(htr, h), Y(htr) if mk2 in (PerCellBinary, GridBinary) else htr[lab].to_numpy(int), htr)
            res.append(f"{name}: {fmt(threat_metrics(hte[lab].to_numpy(int), m.predict(F(hte), threat_cells(hte, h), hte)))}")
        rep.append(f"Unseen map (train without `{MAP_HOLDOUT}` = {len(htr)} rows, test on its {len(hte)} rows):\n\n" + "\n".join(f"- {r}" for r in res) + "\n")
        by = []
        m = fitted[chosen]
        for sc, part in te.groupby("scenario"):
            if len(part) >= 50:
                part = part.reset_index(drop=True)
                by.append(f"| {sc} | {len(part)} | {fmt(threat_metrics(part[lab].to_numpy(int), m.predict(F(part), threat_cells(part, h), part)))} |")
        rep.append("Per scenario (test, chosen):\n\n| scenario | rows | metrics |\n|---|---|---|\n" + "\n".join(by) + "\n")
        art = m.export()
        art["normalise"] = True
        art["metrics"] = {"cv": cvloss[chosen], "test": rows[list(makers).index(chosen)][2]}
        artefact["targets"][f"threat{h}"] = art
        fx = te.sample(n=min(10, len(te)), random_state=SEED).reset_index(drop=True)
        fixture[f"threat{h}"] = {"frame": F(fx).tolist(), "current": fx["current"].astype(int).tolist(), "closing": fx["closing_speed"].tolist(), "aspect": fx["target_aspect"].tolist(),
                                 "cells": threat_cells(fx, h).tolist(), "predictions": norm(m.predict(F(fx), threat_cells(fx, h), fx)).tolist()}


def norm(P):
    P = np.clip(P, 1e-6, None)
    return P / P.sum(1, keepdims=True)


# ---------------------------------------------------------------- positions (fire, danger, value)


def bin_metrics(task, y, p):
    if task == "binary":
        p = np.clip(p, 1e-6, 1 - 1e-6)
        return {"logloss": float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))), "brier": float(np.mean((p - y) ** 2)),
                "auc": float(roc_auc_score(y, p)) if len(set(y)) > 1 else float("nan"), "ece": float(ece(y, p))}
    mse = float(np.mean((y - p) ** 2))
    return {"mse": mse, "mae": float(np.mean(np.abs(y - p))), "r2": float(1 - mse / np.var(y)) if np.var(y) > 0 else float("nan")}


class PosCellConst:
    def fit(self, d, lab, task, ff):
        self.mean = d.groupby("cell")[lab].mean().reindex(range(CELLS)).fillna(d[lab].mean()).to_numpy()
        return self

    def predict(self, d, ff):
        return self.mean[d["cell"].to_numpy(int)]


class PosBinned:
    """Per cell x closing tercile x aspect third frequency, shrunk to the cell's frequency."""

    def fit(self, d, lab, task, ff):
        self.b = bins(d)
        cellm = PosCellConst().fit(d, lab, task, ff).mean
        key = d["cell"].to_numpy(int) * 9 + bin_index(d, self.b)
        s = np.bincount(key, weights=d[lab].to_numpy(float), minlength=CELLS * 9)
        n = np.bincount(key, minlength=CELLS * 9)
        prior = np.repeat(cellm, 9)
        self.table = ((s + 5 * prior) / (n + 5)).reshape(CELLS, 9)
        return self

    def predict(self, d, ff):
        return self.table[d["cell"].to_numpy(int), bin_index(d, self.b)]

    def export(self):
        return {"kind": "binned", "by": "cell", **self.b, "table": self.table.tolist()}


class PosPerCell:
    def fit(self, d, lab, task, ff):
        self.task, self.models = task, []
        for c in range(CELLS):
            part = d[d.cell == c]
            y = part[lab].to_numpy(float)
            ok = len(part) >= 2 * MIN_POS and (task != "binary" or min(y.sum(), len(y) - y.sum()) >= MIN_POS)
            if ok:
                est = logistic() if task == "binary" else make_pipeline(StandardScaler(), Ridge(alpha=1.0))
                self.models.append(est.fit(part[ff + POSITION_CELL].to_numpy(float), y))
            else:
                self.models.append(float(y.mean()) if len(y) else float(d[lab].mean()))
        return self

    def predict(self, d, ff):
        out = np.zeros(len(d))
        cells = d["cell"].to_numpy(int)
        X = d[ff + POSITION_CELL].to_numpy(float)
        for c, m in enumerate(self.models):
            i = cells == c
            if i.any():
                out[i] = m if isinstance(m, float) else (m.predict_proba(X[i])[:, 1] if self.task == "binary" else m.predict(X[i]))
        return np.clip(out, 0, 1)

    def export(self):
        return {"kind": "per-cell", "models": [{"constant": m} if isinstance(m, float) else {**export_linear(m, self.task), "task": self.task} for m in self.models]}


class PosGrid:
    def fit(self, d, lab, task, ff):
        self.task = task
        self.m = hgb(task).fit(pos_X(d, ff), d[lab].to_numpy(float) if task != "binary" else d[lab].to_numpy(int))
        return self

    def predict(self, d, ff):
        X = pos_X(d, ff)
        return np.clip(self.m.predict_proba(X)[:, 1] if self.task == "binary" else self.m.predict(X), 0, 1)

    def export(self):
        return {"kind": "grid", "model": {**export_hgb(self.m, self.task), "task": self.task}}


def pos_X(d, ff):
    return np.hstack([d[ff + POSITION_CELL].to_numpy(float), CELL_ID[d["cell"].to_numpy(int)]])


POSITION_TARGETS = {
    "fire": ("binary", "P(a blast hits the target within 10 s of the GVTS entering the cell)"),
    "danger": ("binary", "P(the GVTS is hit or loses integrity within 10 s of entering the cell)"),
    "value": ("regression", "snapshot scorer overall.value 10 s after entering the cell"),
}


def position_section(df, ff, rep, artefact, fixture):
    rep.append("## Position maps (fire, danger, value)\n\nRows are (frame every 2 s, cell the GVTS first entered within 60 s, in that frame's grid); labels are read at entry. "
               "Cells the crews never flew into have no rows: their estimate is the cell-frequency fallback.\n")
    rep.append("Entered-cell rows per band (train+test): " + ", ".join(f"band {b}: {n}" for b, n in (df.cell % BANDS).value_counts().sort_index().items()) + "\n")
    for lab, (task, meaning) in POSITION_TARGETS.items():
        d = df[df[lab].notna()].reset_index(drop=True)
        tr, te = d[d.split == "train"], d[d.split == "test"]
        rep.append(f"### {lab}: {meaning}\n\nRows: train {len(tr)} ({tr.run_id.nunique()} runs), test {len(te)}; label mean {tr[lab].mean():.3f} train / {te[lab].mean():.3f} test.\n")
        rep.append("Label mean by scenario (all rows): " + ", ".join(f"{s} {v:.3f}" for s, v in d.groupby("scenario")[lab].mean().items()) + "\n")
        makers = {"cell frequency": PosCellConst, "binned (cell x closing x aspect)": PosBinned, "per-cell " + ("logistic" if task == "binary" else "ridge"): PosPerCell, "grid hgb": PosGrid}
        rows, cvloss, fitted = [], {}, {}
        key = "logloss" if task == "binary" else "mse"
        for name, mk in makers.items():
            oof = np.zeros(len(tr))
            for a, b in GroupKFold(n_splits=FOLDS).split(tr, groups=tr.run_id):
                oof[b] = mk().fit(tr.iloc[a], lab, task, ff).predict(tr.iloc[b], ff)
            m = mk().fit(tr, lab, task, ff)
            fitted[name] = m
            cvm = bin_metrics(task, tr[lab].to_numpy(float), oof)
            cvloss[name] = cvm[key]
            rows.append((name, cvm, bin_metrics(task, te[lab].to_numpy(float), m.predict(te, ff))))
        rep.append("| model | CV | test |\n|---|---|---|")
        rep += [f"| {n} | {fmt(c)} | {fmt(t)} |" for n, c, t in rows]
        names = list(makers)
        best_simple = min(names[1:3], key=lambda n: cvloss[n])
        chosen = "grid hgb" if cvloss["grid hgb"] < cvloss[best_simple] * (1 - GRID_GAIN) else best_simple
        rep.append(f"\nChosen: **{chosen}** (CV {key}: " + ", ".join(f"{n} {v:.4f}" for n, v in cvloss.items()) + ").\n")
        htr = tr[tr["map"] != MAP_HOLDOUT]
        hte = d[d["map"] == MAP_HOLDOUT]
        if len(hte) and htr[lab].nunique() > 1:
            res = [f"{n}: {fmt(bin_metrics(task, hte[lab].to_numpy(float), makers[n]().fit(htr, lab, task, ff).predict(hte, ff)))}" for n in dict.fromkeys(["cell frequency", chosen])]
            rep.append(f"Unseen map (train without `{MAP_HOLDOUT}` = {len(htr)} rows, label mean {htr[lab].mean():.3f}; test on its {len(hte)} rows, label mean {hte[lab].mean():.3f}):\n\n" + "\n".join(f"- {r}" for r in res) + "\n")
        else:
            rep.append(f"Unseen map: not estimable (train without `{MAP_HOLDOUT}` has a constant label).\n")
        m = fitted[chosen]
        art = m.export()
        art["metrics"] = {"cv": cvloss[chosen], "test": rows[names.index(chosen)][2]}
        artefact["targets"][lab] = art
        fx = te.sample(n=min(20, len(te)), random_state=SEED)
        fixture[lab] = {"frame": fx[ff].to_numpy(float).tolist(), "cell": fx["cell"].astype(int).tolist(), "closing": fx["closing_speed"].tolist(), "aspect": fx["target_aspect"].tolist(),
                        "position": fx[POSITION_CELL].to_numpy(float).tolist(), "predictions": m.predict(fx, ff).tolist()}


# ---------------------------------------------------------------- isochrones


def band(s):
    return np.digitize(s, BAND_EDGES)


def iso_section(iso, rep):
    iso = iso[iso.pred < 120]
    iso = iso.assign(ratio=iso.pred / iso.dt, ok=(iso.pred <= iso.dt + 0.5).astype(float), same=(band(iso.pred) == band(iso.dt)).astype(float))
    rep.append("## Isochrone validation\n\nFor each frame and dt in {2, 5, 10, 20, 30, 45, 60} s: the grid's predicted time-to-reach of the point the GVTS actually "
               "occupied dt seconds later. The prediction is a lower bound (a perfect pilot), so `pred <= dt` should hold; `pred/dt` near 1 means the "
               "crew flew there about as fast as the model says is possible.\n")
    g = iso.groupby("dt")
    t = pd.DataFrame({"rows": g.size(), "bound holds (pred <= dt + 0.5)": g.ok.mean(),
                      "pred/dt median": g.ratio.median(), "pred/dt p90": g.ratio.quantile(0.9), "pred/dt max": g.ratio.max(),
                      "same band": g.same.mean()})
    rep.append("```\n" + t.round(3).to_string() + "\n```\n")
    s = iso.groupby("scenario")
    t2 = pd.DataFrame({"rows": s.size(), "bound holds": s.ok.mean(), "pred/dt p90": s.ratio.quantile(0.9), "pred/dt p99": s.ratio.quantile(0.99)})
    rep.append("By scenario:\n\n```\n" + t2.round(3).to_string() + "\n```\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--version", default="v1")
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    args = ap.parse_args()
    np.random.seed(SEED)
    manifest = json.loads(Path(args.base + ".manifest.json").read_text())
    ff = manifest["frameFeatures"]
    threat = split(pd.read_csv(args.base + "-threat.csv", low_memory=False))
    cells = split(pd.read_csv(args.base + "-cells.csv", low_memory=False))
    iso = pd.read_csv(args.base + "-iso.csv", low_memory=False)
    threat = threat[np.isfinite(threat[ff]).all(axis=1)].reset_index(drop=True)
    cells = cells[np.isfinite(cells[ff + POSITION_CELL]).all(axis=1)].reset_index(drop=True)

    rep = [f"# Radar isochrone heatmaps training report {args.date}\n",
           f"Datasets `{Path(args.base).name}-*` ({manifest['runs']} runs; " + ", ".join(f"{k} {v['rows']} rows sha256 `{v['sha256'][:12]}`" for k, v in manifest["files"].items()) + "). "
           f"Grid {SECTORS} sectors x bands {BAND_EDGES} s (`src/heatmap/grid.ts`). Test = top 20% of seeds per scenario; CV = {FOLDS}-fold GroupKFold by run on train; "
           f"unseen map = `{MAP_HOLDOUT}`. Frame inputs ({len(ff)}): " + ", ".join(f"`{f}`" for f in ff) + ".\n"]
    iso_section(iso, rep)
    artefact = {"version": args.version, "created": args.date, "frameFeatures": ff, "grid": {"sectors": SECTORS, "bandEdges": BAND_EDGES},
                "dataset": {k: {"file": v["file"], "rows": v["rows"], "sha256": v["sha256"]} for k, v in manifest["files"].items()}, "targets": {}}
    fixture = {}
    threat_section(threat, ff, rep, artefact, fixture)
    position_section(cells, ff, rep, artefact, fixture)

    # parity of exported forms against the fitted predictions
    for name, fx in fixture.items():
        art = artefact["targets"][name]
        got = np.array(predict_export(art, fx))
        assert np.allclose(got, np.array(fx["predictions"]), atol=1e-6), f"{name}: export parity {np.abs(got - np.array(fx['predictions'])).max()}"
    artefact["fixture"] = fixture

    def clean(o):
        if isinstance(o, float):
            return None if math.isnan(o) else o
        if isinstance(o, dict):
            return {k: clean(v) for k, v in o.items()}
        if isinstance(o, list):
            return [clean(v) for v in o]
        return o

    out = HERE.parent.parent / "src" / "heatmap" / "models" / f"{args.version}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(clean(artefact), separators=(",", ":")) + "\n", newline="\n")
    rep.append(f"## Artefact\n\n`modules/ai/src/heatmap/models/{args.version}.json`: " + ", ".join(f"{k} {v['kind']}" for k, v in artefact["targets"].items()) + ".\n")
    (HERE.parent / "reports" / f"{args.date}-heatmap.md").write_text("\n".join(rep) + "\n", newline="\n")
    print("\n".join(rep))


def bin_of(closing, aspect, art):
    return int(np.digitize([closing], art["closingEdges"])[0] * 3 + np.digitize([aspect], art["aspectEdges"])[0])


def eval_one(m, x):
    if "constant" in m:
        return m["constant"]
    return float(eval_export(m, np.array([x]))[0])


def predict_export(art, fx):
    """numpy mirror of the TS evaluator (`src/heatmap/heatmap.ts`), one fixture row at a time."""
    out = []
    if "cells" in fx:  # threat
        for r in range(len(fx["frame"])):
            F, C = fx["frame"][r], fx["cells"][r]
            if art["kind"] == "binned":
                p = np.array(art["table"][fx["current"][r] * 9 + bin_of(fx["closing"][r], fx["aspect"][r], art)])
            elif art["kind"] == "per-cell":
                p = np.array([eval_one(art["models"][c], F + C[c]) for c in range(CELLS)])
            else:
                p = np.array([eval_one(art["model"], F + C[c] + cell_id(c)) for c in range(CELLS)])
            out.append(norm(p[None, :])[0].tolist())
        return out
    for r in range(len(fx["frame"])):
        F, c, P = fx["frame"][r], fx["cell"][r], fx["position"][r]
        if art["kind"] == "binned":
            v = art["table"][c][bin_of(fx["closing"][r], fx["aspect"][r], art)]
        elif art["kind"] == "per-cell":
            v = eval_one(art["models"][c], F + P)
        else:
            v = eval_one(art["model"], F + P + cell_id(c))
        out.append(min(1.0, max(0.0, v)))
    return out


if __name__ == "__main__":
    main()
