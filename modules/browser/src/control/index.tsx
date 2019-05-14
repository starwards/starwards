import { DashboardWidget } from '../dashboard';
import { ReactProps } from 'golden-layout';
import React from 'react';
import Button from '@material-ui/core/Button';

class App extends React.Component<Mappings & ReactProps> {
  public render() {
    return (
      <Button variant="contained" color="primary">
        Hello World
      </Button>
    );
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
