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

# 3. train, evaluate and export (v1.json stays as the backwards baseline)
.venv/Scripts/python train.py --dataset ../../../../training-archive/datasets/snapshots-2026-10-03-v2.csv --version v2 --baseline v1

# 4. check parity and the TS side
npx jest --selectProjects=ai modules/ai/src/scoring      # from the repo root
npm --prefix modules/ai run score -- --recording <x.sgr> --every 5
```

`score.ts` imports every artefact it serves; adding a version means adding its import. Artefacts are
read by feature name (`featureSelector` in `model.ts`), so adding features keeps earlier versions
scoring; removing or redefining a feature an artefact uses needs a retrain.

## Protocol (`train.py`)

- Labels: `src/scoring/labels.ts` (future of the same run; censored rows are dropped per label). The
  tactical and weapons labels are censored for runs recorded without `shot`/`damage` events.
- Seed holdout: per scenario, the top 20% of distinct seeds are test (no run is split; live runs stay
  in train). Model family by 5-fold `GroupKFold` by run on train: linear (logistic / ridge) or
  `HistGradientBoosting` (fixed hyper-parameters, `random_state=0`), trees only when they cut the CV loss
  by at least 5%. Fits use every 2nd frame of a run; every metric uses all rows.
- Leave one scenario out: the chosen family is refit without each scenario (with >= 4 labelled runs)
  and scored on all of its rows.
- No leakage: every split is by run, so a label window never crosses a split; the behavioural check
  holds out every run with the held seed numbers, whatever its source.
- Calibration (`kill60`): the final model is fitted on 80% of the training runs; isotonic regression,
  bounded to [0.001, 0.999], on the other 20%. Reliability table (10 bins) on test.
- Baselines, per scenario and pooled: constant (train mean), the single best feature (best grouped-CV
  one-feature linear model among the 10 most correlated), and persistence: the label's own value over
  the window that ends at t (label at t − horizon, same run; for `kill60`, P(y | that value) from train).
  Headline: persistence gain `1 − loss(model) / loss(persistence)` on rows where persistence exists,
  undefined where persistence is exact (a constant label). Per-scenario Δ against persistence carries a
  95% bootstrap CI over runs.
- Backwards benchmark: on `kill60` and `damage30`, the new artefact against `--baseline` per scenario,
  on test runs outside the baseline's training set, Δ loss with a 95% bootstrap CI over runs. A scenario
  regresses only when the whole CI lies above the noise floor (0.002 logloss, 0.0005 mse) on at least 5
  runs; above the floor on fewer runs is reported as insufficient evidence.
- Behavioural ordering: on the matched-seed validation runs (`engineer-kpi/`, `weapons-score/`), run
  means of label and out-of-fold prediction (5 folds grouped by seed), paired by seed: the model must
  keep the policy orderings the labels hold (reference > idle, > all-max, > random on the engineer
  score; idle > all-shutdown where outcomes separate them; reference > idle on T and V; reference > wrong-ammo on V; torpedo > reference on T when the gun
  is outranged).
- Leakage check: time-in-run added as a feature must not cut the CV loss.
- Export: coefficients + scaler or tree nodes, calibration map, metrics, and 40 test rows with
  predictions as the TS parity fixture; the numpy evaluator equals sklearn before export.

## Heatmaps

Radar isochrone heatmaps (`src/heatmap/`, docs: `docs/integration/ai-crew.md#radar-heatmaps`). Same venv.

```bash
npm --prefix modules/ai run heatmap:dataset          # -> training-archive/datasets/heatmap-<days>-{threat,cells,iso}.csv + .manifest.json
cd modules/ai/ml/heatmap
../.venv/Scripts/python train_heatmap.py --base ../../../../../training-archive/datasets/heatmap-2026-10-02 --version v1
npx jest --selectProjects=ai --testPathPatterns heatmap                  # from the repo root: parity + grid specs
npm --prefix modules/ai run heatmap -- --recording <x.sgr> --t 30
```

Protocol (`heatmap/train_heatmap.py`), on top of the scorer's split rules (test = top 20% of seeds per
scenario, 5-fold `GroupKFold` by run, unseen map = `training_t1`):

- Isochrone validation: predicted time-to-reach of the point the GVTS really occupied `dt` s later
  against `dt` (the prediction is a lower bound, so it must not exceed `dt`).
- `threat5`/`threat10`: categorical over the 32 cells. Baselines: marginal cell frequency; frequency
  given the opponent's current cell × closing-speed tercile × aspect third. Models: per-cell logistic
  (one-vs-rest, normalised; cells with < 30 train positives keep their frequency); an HGB over
  (frame, cell) pairs. Metrics: log loss, top-1/top-3, Brier, ECE over all cell probabilities.
- `fire`/`danger`/`value`: rows are (frame, cell the GVTS first entered within 60 s); labels at entry.
  Baselines: per-cell frequency; per cell × closing × aspect. Models: per-cell logistic/ridge; HGB over
  the grid. Log loss, Brier, AUC, ECE (MSE, R² for `value`).
- The across-grid HGB ships only when its CV loss is >= 2% below the best simpler model. Export:
  per-cell linear models, the grid tree model, or the binned table; `train_heatmap.py` asserts its
  numpy mirror of the TS evaluator on a fixture that `heatmap.spec.ts` replays.
