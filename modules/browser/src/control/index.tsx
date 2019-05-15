import { DashboardWidget } from '../dashboard';
import { ReactProps } from 'golden-layout';
import React from 'react';
import Button from '@material-ui/core/Button';
import { Keyboard, Gamepad, or} from 'contro';
import { Control } from 'contro/dist/core/control';
import {mapValues, Dictionary} from 'lodash';

const gamepad = new Gamepad();
const keyboard = new Keyboard();

class App extends React.Component<Mappings & ReactProps, {triggers: Dictionary<boolean>}> {
  private looping = false;
  private triggers: {[i: string]: Control<any>} = {
    a: or(gamepad.button('A'), keyboard.key('a')),
  };
  public componentWillMount() {
    this.setState({triggers : mapValues(this.triggers, (trigger: Control<any>) => trigger.query())});
    this.looping = true;
    this.loop();
  }
  public componentWillUnmount() {
    this.looping = false;
  }
  public render() {
    return <>{Object.keys(this.triggers).map(letter => {
      const control = this.triggers[letter];
      return <Button
          variant="contained"
          color="primary"
          classes={{ root: this.state.triggers[letter] ? 'gameAction_active' : 'gameAction'}}
        >
          {control.label}
        </Button>;
      })}
      <style>{
`
.gameAction {
}
.gameAction:active{
  border-color: #005cbf;
  background-color: #0062cc;
}
.gameAction_active{
  border-color: #005cbf;
  background-color: #0062cc;
}

.ripple {
  opacity: 0.3;
  transform: scale(1);
  animation: mui-ripple-enter 550ms cubic-bezier(0.4, 0, 0.2, 1);
  animation-name: j1tfb5h4;
}
`
      }</style></>;
  }
  private loop = () => {
    if (this.looping) {
      if (this.state) {
        for (const trigger of Object.keys(this.triggers)) {
          const currValue = this.triggers[trigger].query();
          if (this.state.triggers[trigger] !== currValue) {
              this.setState({ triggers: {[trigger] : currValue} });
          }
        }
      }
      requestAnimationFrame(this.loop);
    }
  }
}

interface Mappings {}
const defaultMappings: Mappings = {};

export const controlWidget: DashboardWidget<Mappings> = {
  name: 'control',
  type: 'react-component',
  component: App,
  initialState: defaultMappings
};

// TODO https://www.npmjs.com/package/contro
