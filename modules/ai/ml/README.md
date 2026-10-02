# Snapshot scorer: training

Trains the heuristic (value) function `scoreSnapshot` in `modules/ai/src/scoring/score.ts`. Features,
labels and the TS evaluator live in `src/scoring/`; this folder only fits and exports models. Data and
fitted models stay out of git; the exported artefact `src/scoring/models/<version>.json` and the
reports in `reports/` are committed.

## Rebuild

```bash
# 1. dataset: one row per recorded frame, from every <day>/manifest.jsonl in the training archive
npm --prefix modules/ai run score:dataset            # -> training-archive/datasets/snapshots-<days>.csv + .manifest.json
#    options: --archive <dir> --days 2026-10-02,... --out <file.csv> --limit <runs>

# 2. environment (once): Python 3.14
cd modules/ai/ml
py -3.14 -m venv .venv && .venv/Scripts/pip install -r requirements.txt

# 3. train, evaluate, export
.venv/Scripts/python train.py --dataset ../../../../training-archive/datasets/snapshots-2026-10-02.csv --version v1

# 4. check parity and the TS side
npx jest --selectProjects=ai modules/ai/src/scoring      # from the repo root
npm --prefix modules/ai run score -- --recording <x.sgr> --every 5
```

A new artefact version needs `score.ts` to import it. Changing `features.ts` changes the feature hash:
`score.ts` refuses an artefact trained on another feature list, so rebuild the dataset and retrain.

## Protocol (`train.py`)

- Labels: see `src/scoring/labels.ts` (future of the same run; censored rows are dropped per label).
- Test set: per scenario, the top 20% of distinct seeds (no run is split). Map transfer: each chosen
  model family is refit without `training_t1` and tested on it.
- CV: 5-fold `GroupKFold` by run on the training set; every model comparison uses out-of-fold predictions.
- Baselines: constant (train mean) and a single feature declared up front per label.
- Models: standardised logistic / ridge regression, and `HistGradientBoosting` (fixed hyper-parameters,
  `random_state=0`). Trees are chosen only when they cut the CV loss (log loss / MSE) by at least 5%;
  otherwise the linear model ships, being smaller and smoother as a search heuristic.
- Calibration: `kill60` gets isotonic calibration fitted on the out-of-fold predictions only.
- Metrics: log loss, Brier, ROC-AUC, ECE (10 bins) for `kill60`; MSE, MAE, R² for the rest; per-scenario
  test breakdown; permutation importance on test; leakage check (time-in-run added as a feature);
  label means by crew policy; feature drift between jev and reference crews.
- Export: coefficients + scaler, or the tree nodes (thresholds on raw feature values) + baseline, plus the
  calibration map. `train.py` asserts its numpy re-implementation of the TS evaluator equals sklearn
  before export, and writes 40 test rows with predictions as the TS parity fixture.
