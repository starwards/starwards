/*
MIT License

Copyright (c) 2018 Jordan Kanchelov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import { Container, Text, TextStyle, Ticker } from 'pixi.js';

export class PixiFps extends Container {
    private static readonly DEFAULT_FONT_SIZE: number = 30;
    private static readonly DEFAULT_FONT_COLOR: number = 0xff0000;

    private _fpsTextField: Text;
    private _fpsTicker: Ticker;

    private _timeValues: number[];
    private _lastTime: number;

    constructor(style?: TextStyle) {
        super();

        const defaultStyle = new TextStyle({
            fontSize: PixiFps.DEFAULT_FONT_SIZE,
            fill: PixiFps.DEFAULT_FONT_COLOR,
        });

        this._timeValues = [];
        this._lastTime = new Date().getTime();
        this._fpsTextField = new Text('', { ...defaultStyle, ...style } as TextStyle);

        this._fpsTicker = new Ticker();
        this._fpsTicker.add(() => {
            this.measureFPS();
        });
        this._fpsTicker.start();

        this.addChild(this._fpsTextField);
    }

    set style(style: TextStyle) {
        this._fpsTextField.style = style;
    }

    private measureFPS(): void {
        const currentTime = new Date().getTime();
        this._timeValues.push(1000 / (currentTime - this._lastTime));

        if (this._timeValues.length === 30) {
            let total = 0;
            for (let i = 0; i < 30; i++) {
                total += this._timeValues[i];
            }

            this._fpsTextField.text = (total / 30).toFixed(2);

            this._timeValues.length = 0;
        }

        this._lastTime = currentTime;
    }
}
