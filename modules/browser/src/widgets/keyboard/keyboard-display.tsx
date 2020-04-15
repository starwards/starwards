/*
MIT License

Copyright (c) 2015-present, Kenny Wong.

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
// based on https://github.com/jaywcjlove/hotkeys/blob/master/website/components/KeyBoard.js

import React from 'react';

export const keys = {
  8: { keycode: 8, name: ['delete'] },
  9: { keycode: 9, name: ['tab'] },
  13: { keycode: 13, name: ['enter', 'return'] },
  16: { keycode: 16, name: ['⇧'] },
  17: { keycode: 17, name: ['control'] },
  18: { keycode: 18, name: ['alt', 'option'] },
  20: { keycode: 20, name: ['', 'CapsLock'] },
  27: { keycode: 27, name: ['esc'] },
  32: { keycode: 32, name: [''] },
  37: { keycode: 37, name: ['◀'] },
  38: { keycode: 38, name: ['▲'] },
  39: { keycode: 39, name: ['▶'] },
  40: { keycode: 40, name: ['▼'] },
  48: { keycode: 48, name: [')', '0'] },
  49: { keycode: 49, name: ['!', '1'] },
  50: { keycode: 50, name: ['@', '2'] },
  51: { keycode: 51, name: ['#', '3'] },
  52: { keycode: 52, name: ['$', '4'] },
  53: { keycode: 53, name: ['%', '5'] },
  54: { keycode: 54, name: ['^', '6'] },
  55: { keycode: 55, name: ['&', '7'] },
  56: { keycode: 56, name: ['*', '8'] },
  57: { keycode: 57, name: ['(', '9'] },
  65: { keycode: 65, name: ['A'] },
  66: { keycode: 66, name: ['B'] },
  67: { keycode: 67, name: ['C'] },
  68: { keycode: 68, name: ['D'] },
  69: { keycode: 69, name: ['E'] },
  70: { keycode: 70, name: ['F'] },
  71: { keycode: 71, name: ['G'] },
  72: { keycode: 72, name: ['H'] },
  73: { keycode: 73, name: ['I'] },
  74: { keycode: 74, name: ['J'] },
  75: { keycode: 75, name: ['K'] },
  76: { keycode: 76, name: ['L'] },
  77: { keycode: 77, name: ['M'] },
  78: { keycode: 78, name: ['N'] },
  79: { keycode: 79, name: ['O'] },
  80: { keycode: 80, name: ['P'] },
  81: { keycode: 81, name: ['Q'] },
  82: { keycode: 82, name: ['R'] },
  83: { keycode: 83, name: ['S'] },
  84: { keycode: 84, name: ['T'] },
  85: { keycode: 85, name: ['U'] },
  86: { keycode: 86, name: ['V'] },
  87: { keycode: 87, name: ['W'] },
  88: { keycode: 88, name: ['X'] },
  89: { keycode: 89, name: ['Y'] },
  90: { keycode: 90, name: ['Z'] },
  91: { keycode: 91, name: ['command'] },
  93: { keycode: 93, name: ['command'] },
  112: { keycode: 112, name: ['F1'] },
  113: { keycode: 113, name: ['F2'] },
  114: { keycode: 114, name: ['F3'] },
  115: { keycode: 115, name: ['F4'] },
  116: { keycode: 116, name: ['F5'] },
  117: { keycode: 117, name: ['F6'] },
  118: { keycode: 118, name: ['F7'] },
  119: { keycode: 119, name: ['F8'] },
  120: { keycode: 120, name: ['F9'] },
  121: { keycode: 121, name: ['F10'] },
  122: { keycode: 122, name: ['F11'] },
  123: { keycode: 123, name: ['F12'] },
  186: { keycode: 186, name: [':', ';'] },
  187: { keycode: 187, name: ['＋', ': '] },
  188: { keycode: 188, name: ['<', ','] },
  189: { keycode: 189, name: ['＿', '-'] },
  190: { keycode: 190, name: ['>', '.'] },
  191: { keycode: 191, name: ['?', '/'] },
  192: { keycode: 192, name: ['~', '`'] },
  219: { keycode: 219, name: ['{', '['] },
  220: { keycode: 220, name: ['|', '\\'] },
  221: { keycode: 221, name: ['}', ']'] },
  222: { keycode: 222, name: ['"', '\''] },
  〇: { keycode: -1, name: ['〇'] },
  fn: { keycode: -1, name: ['fn'] }
};

export type ButtonKey = keyof typeof keys;
export function isButtonKey(keyCode: number | string): keyCode is ButtonKey {
  return (keys as any)[keyCode] !== undefined;
}
export interface Props {
  buttons: Iterable<ButtonKey>;
  pressed: Set<ButtonKey>;
  onButtonDown: (keyCode: ButtonKey) => void;
  onButtonUp: (keyCode: ButtonKey) => void;
}
export default function KeyboardDisplay({
  buttons,
  pressed,
  onButtonDown,
  onButtonUp
}: Props) {
  return (
    <div className="keyboard">
      <style>{`
.keyboard {
    height: 100%;
    border-radius: 10px;
    border: 1px solid #C9C9C9;
    background: #F2F2F2;
    user-select: none;
    margin: 0 auto;
}
.keyboard ul {
    width: 992px;
    margin-top: 9px;
    padding-left: 11px;
    position: relative;
    float: left;
}
.keyboard li {
    width: 62px;
    height: 48px;
    float: left;
    padding: 7px 0;
    margin-right: 5px;
    margin-bottom: 5px;
    background: #151515;
    color: rgb(200,200,200);
    text-align: center;
    font-size: 12px;
    border-radius: 8px;
    border: 1px solid #3A3A3A;
    box-shadow: 1px 0px 0px rgb(0,0,0),0px 1px 0px rgb(0,0,0),-1px 0px 0px rgb(0,0,0),0px -1px 0px rgb(0,0,0);
    transition: all .2s;
    user-select: none;
    cursor: pointer;
    position: relative;
}
.keyboard li:active foo, .keyboard li.pressed {
    color:#52F800;
    background-color: #100068;
    border:1px solid #332376;
}
.keyboard li span {
    width: 100%;
    float: left;
    font-size:14px;
}
.keyboard li span.lines1{
    line-height: 48px;
    height: 48px;
}
.keyboard li span.lines2{
    line-height: 23px;
    height: 23px;
}
`}</style>
      <ul>
        {Array.from(buttons, buttonKey => {
          const item = keys[buttonKey];
          const name = item.name.map((iName, i) => (
            <span key={`${i}`} className={'lines' + item.name.length}>{iName}</span>
          ));
          return (
            <li
              key={buttonKey}
              className={isButtonKey(item.keycode) && pressed.has(item.keycode) ? 'pressed' : ''}
              data-key={item.keycode}
              onMouseDown={onButtonDown.bind(null, buttonKey)}
              onMouseUp={onButtonUp.bind(null, buttonKey)}
            >
              {name}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
