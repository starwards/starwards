import { Container, DisplayObject, Text, TextStyle, UPDATE_PRIORITY } from 'pixi.js';

import { CameraView } from '../radar/camera-view';

export class FpsCounter {
    private static readonly DEFAULT_FONT_SIZE: number = 30;
    private static readonly DEFAULT_FONT_COLOR: number = 0xff0000;

    private stage = new Container();
    private _fpsTextField: Text;

    constructor(private parent: CameraView, style?: TextStyle) {
        const defaultStyle = new TextStyle({
            fontSize: FpsCounter.DEFAULT_FONT_SIZE,
            fill: FpsCounter.DEFAULT_FONT_COLOR,
        });

        parent.ticker.add(this.onRender, null, UPDATE_PRIORITY.LOW);

        this._fpsTextField = new Text('', { ...defaultStyle, ...style } as TextStyle);

        this.stage.addChild(this._fpsTextField);
    }

    set style(style: TextStyle) {
        this._fpsTextField.style = style;
    }

    get renderRoot(): DisplayObject {
        return this.stage;
    }

    private onRender = () => {
        this._fpsTextField.text = `FPS: ${Math.round(this.parent.ticker.FPS)}`;
    };
}
