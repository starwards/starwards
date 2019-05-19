import { DashboardWidget } from '../dashboard';
import { ReactProps } from 'golden-layout';
import React from 'react';
import { Keyboard } from './keyboard';

class KeyboardCommands extends React.Component<Mappings & ReactProps> {
  public render() {
    return <Keyboard
        buttons={[37, 38, 39, 40]}
        keyHandler={code => console.log(code)}
    />;
  }
}

type Mappings = object;
const defaultMappings: Mappings = {};

export const keyboardWidget: DashboardWidget<Mappings> = {
  name: 'keyboard commands',
  type: 'react-component',
  component: KeyboardCommands,
  initialState: defaultMappings
};

// TODO https://www.npmjs.com/package/contro
