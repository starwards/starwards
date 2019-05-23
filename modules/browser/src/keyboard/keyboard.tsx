import React from 'react';
import KeyboardDisplay, { ButtonKey, isButtonKey } from './keyboard-display';
import hotkeys from 'hotkeys-js';
import _ from 'lodash';

export interface Props {
  buttons: Set<ButtonKey>;
  pressed: Set<ButtonKey>;
  onPressed: (keyCode: ButtonKey) => void;
  onUnPressed: (keyCode: ButtonKey) => void;
}
export class Keyboard extends React.Component<Props> {
  private buttonPressed = new  Set<ButtonKey>();
  private keyPressed = new  Set<ButtonKey>();
  constructor(p: Props) {
    super(p);
    this.state = {
      pressed: new Set<ButtonKey>()
    };
    this.onKeyUpEvent = this.onKeyUpEvent.bind(this);
    this.onKeyDownEvent = this.onKeyDownEvent.bind(this);
  }
  public render() {
    return (
      <KeyboardDisplay
        buttons={this.props.buttons}
        pressed={this.props.pressed}
        onButtonDown={key => {
          this.buttonPressed.add(key);
          this.updatePressed();
        }}
        onButtonUp={key => {
          this.buttonPressed.delete(key);
          this.updatePressed();
        }}
      />
    );
  }
  public componentDidMount() {
    document.addEventListener('keyup', this.onKeyUpEvent);
    document.addEventListener('keydown', this.onKeyDownEvent);
    // hotkeys('*', this.onHotKeys);
    return false;
  }

  public componentWillUnmount() {
    document.removeEventListener('keyup', this.onKeyUpEvent);
    document.removeEventListener('keydown', this.onKeyDownEvent);
    // hotkeys.unbind('*', this.onHotKeys);
  }

  private onKeyDownEvent(evn: KeyboardEvent) {
    evn.preventDefault();
    if (hotkeys.shift && this.props.buttons.has(16)) {
      this.keyPressed.add(16);
    }
    if (hotkeys.ctrl && this.props.buttons.has(17)) {
      this.keyPressed.add(17);
    }
    if (hotkeys.alt && this.props.buttons.has(18)) {
      this.keyPressed.add(18);
    }
    if (hotkeys.control && this.props.buttons.has(17)) {
      this.keyPressed.add(17);
    }
    if (hotkeys.command && this.props.buttons.has(91)) {
      this.keyPressed.add(91);
    }
    if (isButtonKey(evn.keyCode) && this.props.buttons.has(evn.keyCode)) {
      this.keyPressed.add(evn.keyCode);
    }
    this.updatePressed();
  }

  private onKeyUpEvent(evn: KeyboardEvent) {
    if (isButtonKey(evn.keyCode)) {
      this.keyPressed.delete(evn.keyCode);
      this.updatePressed();
    }
  }

  private updatePressed() {
    for (const key of this.props.pressed) {
      if (!this.keyPressed.has(key) && !this.buttonPressed.has(key)) {
        this.props.onUnPressed(key);
      }
    }
    for (const key of this.keyPressed) {
      if (!this.props.pressed.has(key)) {
        this.props.onPressed(key);
      }
    }
    for (const key of this.buttonPressed) {
      if (!this.props.pressed.has(key) && !this.keyPressed.has(key)) {
        this.props.onPressed(key);
      }
    }
  }
}
