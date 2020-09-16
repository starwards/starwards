import { AdminState } from '@starwards/model';
import * as PIXI from 'pixi.js';

export class FragCounter extends PIXI.Container {
    private static readonly DEFAULT_FONT_SIZE: number = 30;
    private static readonly DEFAULT_FONT_COLOR: number = 0xff0000;

    private _fpsTextField: PIXI.Text;
    private _fpsTicker: PIXI.Ticker;

    constructor(state: AdminState, style?: PIXI.TextStyle) {
        super();

        const defaultStyle = new PIXI.TextStyle({
            fontSize: FragCounter.DEFAULT_FONT_SIZE,
            fill: FragCounter.DEFAULT_FONT_COLOR,
        });

        this._fpsTextField = new PIXI.Text('', { ...defaultStyle, ...style } as PIXI.TextStyle);

        this._fpsTicker = new PIXI.Ticker();
        this._fpsTicker.add(() => {
            if (state.points) {
                this._fpsTextField.text =
                    'Deaths:\n' +
                    Object.keys(state.points)
                        .map((id) => `${id} : ${state.points[id]}`)
                        .join('\n');
            } else {
                this._fpsTextField.text = '';
            }
        });
        this._fpsTicker.start();

        this.addChild(this._fpsTextField);
    }

    set style(style: PIXI.TextStyle) {
        this._fpsTextField.style = style;
    }
}
