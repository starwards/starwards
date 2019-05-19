import React from 'react';
import KeyboardDisplay, {ButtonKey, isButtonKey} from './keyboard-display';
import hotkeys from 'hotkeys-js';
import _ from 'lodash';

export interface Props {
  buttons: ButtonKey[];
  keyHandler: (pressed: ButtonKey[]) => void;
}
export class Keyboard extends React.Component<Props, { pressed: ButtonKey[] }> {
  constructor(p: Props) {
    super(p);
    this.state = {
      pressed: []
    };
    this.onKeyUpEvent = this.onKeyUpEvent.bind(this);
    this.onHotKeys = this.onHotKeys.bind(this);
  }
  public render() {
    return (
      <KeyboardDisplay
        buttons={this.props.buttons}
        pressed={this.state.pressed}
        onButtonDown={keyCode => this.updatePressed(this.pkeys(this.state.pressed.slice(0), keyCode))}
        onButtonUp={this.onKeyUpEvent}
      />
    );
  }
  public componentDidMount() {
    document.addEventListener('keyup', this.onKeyUpEvent);
    hotkeys('*', this.onHotKeys);
    return false;
  }

  public componentWillUnmount() {
    document.removeEventListener('keyup', this.onKeyUpEvent);
    hotkeys.unbind('*', this.onHotKeys);
  }

  private onHotKeys(evn: KeyboardEvent) {
    evn.preventDefault();
    const keys: ButtonKey[] = [];
    if (hotkeys.shift) {
      this.pkeys(keys, 16);
    }
    if (hotkeys.ctrl) {
      this.pkeys(keys, 17);
    }
    if (hotkeys.alt) {
      this.pkeys(keys, 18);
    }
    if (hotkeys.control) {
      this.pkeys(keys, 17);
    }
    if (hotkeys.command) {
      this.pkeys(keys, 91);
    }
    if (isButtonKey(evn.keyCode) && keys.indexOf(evn.keyCode) === -1) {
      keys.push(evn.keyCode);
    }
    this.updatePressed(keys);
  }

  private updatePressed(pressed: ButtonKey[]) {
    pressed.sort();
    if (! _.isEqual(pressed, this.state.pressed)) {
      this.setState({ pressed });
      this.props.keyHandler(this.state.pressed);
    }
  }
  private pkeys(keys: ButtonKey[], key: ButtonKey) {
    if (keys.indexOf(key) === -1) {
      keys.push(key);
    }
    return keys;
  }
  private onKeyUpEvent() {
    // TODO some buttons may still be pressed
    this.setState({ pressed: [] });
    this.props.keyHandler(this.state.pressed);
  }
}
