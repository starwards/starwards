export type LineData = {
    name: string;
    y: number[];
    x: number[];
};
export type GraphPointInput = {
    annotate: (t: string) => unknown;
    addtoLine: (n: string, v: number) => unknown;
};
export class PlotlyGraphBuilder {
    public readonly lines: Record<string, LineData | undefined> = {};
    public readonly annotations = Array.of<[string, number]>();
    private lastAnnotation = '';
    private lastPoint = 0;
    constructor(private metrics: Record<string, () => number>) {}

    private getLine(name: string) {
        return this.lines[name] || (this.lines[name] = { name, y: Array.of<number>(), x: Array.of<number>() });
    }

    public build() {
        return {
            kind: { plotly: true },
            data: Object.values(this.lines),
            layout: {
                showlegend: true,
                legend: { orientation: 'h' },
                annotations: this.annotations.map(([text, x], i) => {
                    const y = (i % 2) * 2 - 1;
                    return { x, y, xref: 'x', yref: 'y', text };
                }),
            },
        };
    }
    newPoint(delta: number): GraphPointInput {
        const x = this.lastPoint + delta;
        this.lastPoint = x;
        const addtoLine = (name: string, value: number) => {
            const lineData = this.getLine(name);
            lineData.y.push(value);
            lineData.x.push(x);
        };
        const annotate = (text: string) => {
            if (this.lastAnnotation !== text) {
                this.lastAnnotation = text;
                this.annotations.push([text, x]);
            }
        };
        for (const [name, getVal] of Object.entries(this.metrics)) {
            addtoLine(name, getVal());
        }
        return {
            annotate,
            addtoLine,
        };
    }
}
