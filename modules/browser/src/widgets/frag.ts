import { Container, Text, TextStyle, Ticker } from 'pixi.js';

import { AdminState } from '@starwards/model';

export class FragCounter extends Container {
    private static readonly DEFAULT_FONT_SIZE: number = 30;
    private static readonly DEFAULT_FONT_COLOR: number = 0xff0000;

    private _fpsTextField: Text;
    private _fpsTicker: Ticker;

    constructor(state: AdminState, style?: TextStyle) {
        super();

        const defaultStyle = new TextStyle({
            fontSize: FragCounter.DEFAULT_FONT_SIZE,
            fill: FragCounter.DEFAULT_FONT_COLOR,
        });

        this._fpsTextField = new Text('', { ...defaultStyle, ...style } as TextStyle);

        this._fpsTicker = new Ticker();
        this._fpsTicker.add(() => {
            if (state.points) {
                this._fpsTextField.text =
                    'Deaths:\n' + [...state.points.entries()].map(([id, score]) => `${id} : ${score}`).join('\n');
            } else {
                this._fpsTextField.text = '';
            }
        });
        this._fpsTicker.start();

        this.addChild(this._fpsTextField);
    }

    set style(style: TextStyle) {
        this._fpsTextField.style = style;
    }
}
