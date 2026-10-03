/**
 * Evaluates the exported scorer models (`models/<version>.json`, written by `modules/ai/ml/train.py`)
 * without Python. Mirrors `eval_export` in train.py exactly; `score.spec.ts` checks parity.
 */

interface LinearModel {
    kind: 'linear' | 'logistic';
    mean: number[];
    scale: number[];
    coef: number[];
    intercept: number;
}

interface Tree {
    feature: number[];
    threshold: number[];
    missingLeft: number[];
    left: number[];
    right: number[];
    leaf: number[];
    value: number[];
}

interface TreeModel {
    kind: 'hgb' | 'hgb-logistic';
    baseline: number;
    trees: Tree[];
}

export type ExportedModel = (LinearModel | TreeModel) & {
    task: 'binary' | 'regression';
    station: string;
    /** Isotonic calibration as a piecewise-linear map (np.interp semantics). */
    calibration?: { x: number[]; y: number[] };
    metrics: Record<string, Record<string, number | null>>;
};

export interface ScorerArtefact {
    version: string;
    created: string;
    features: string[];
    featureHash: string;
    dataset: { file: string; sha256: string; runs: number; rows: number };
    models: Record<string, ExportedModel>;
    fixture: { features: number[][]; predictions: Record<string, number[]> };
}

const clip01 = (v: number) => Math.min(1, Math.max(0, v));

function interp(v: number, xs: number[], ys: number[]) {
    if (v <= xs[0]) return ys[0];
    const last = xs.length - 1;
    if (v >= xs[last]) return ys[last];
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (xs[mid] <= v) lo = mid;
        else hi = mid;
    }
    return ys[lo] + ((v - xs[lo]) * (ys[hi] - ys[lo])) / (xs[hi] - xs[lo]);
}

function raw(model: LinearModel | TreeModel, x: readonly number[]) {
    if (!('trees' in model)) {
        let z = model.intercept;
        for (let i = 0; i < x.length; i++) z += ((x[i] - model.mean[i]) / model.scale[i]) * model.coef[i];
        return z;
    }
    let z = model.baseline;
    for (const t of model.trees) {
        let i = 0;
        while (!t.leaf[i]) {
            const v = x[t.feature[i]];
            const left = Number.isNaN(v) ? t.missingLeft[i] === 1 : v <= t.threshold[i];
            i = left ? t.left[i] : t.right[i];
        }
        z += t.value[i];
    }
    return z;
}

/**
 * Maps a feature vector in `names` order (`FEATURE_NAMES`) to the artefact's own feature order; throws
 * when the artefact needs a feature `names` lacks. An artefact trained on fewer features (an earlier
 * version) keeps scoring after features are added.
 */
export function featureSelector(artefact: ScorerArtefact, names: readonly string[]) {
    const index = artefact.features.map((f) => {
        const i = names.indexOf(f);
        if (i < 0) throw new Error(`scorer ${artefact.version} needs feature ${f}, which features.ts does not compute`);
        return i;
    });
    return (x: readonly number[]) => index.map((i) => x[i]);
}

/** The model's prediction in [0, 1]: a probability for binary targets, the label's unit otherwise. */
export function evaluate(model: ExportedModel, x: readonly number[]) {
    const z = raw(model, x);
    const p = clip01(model.kind === 'logistic' || model.kind === 'hgb-logistic' ? 1 / (1 + Math.exp(-z)) : z);
    return model.calibration ? interp(p, model.calibration.x, model.calibration.y) : p;
}
