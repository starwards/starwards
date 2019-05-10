import GoldenLayout from 'golden-layout';
import { radarComponent as radar } from './radar/radar-component';


const config = {
  content: [{
    type: 'row',
    content: [
      {
        type: 'component',
        componentName: 'radar',
        componentState: { }
      }
    ]
  }]
};

const myLayout = new GoldenLayout( config );

myLayout.registerComponent( 'radar', radar);

myLayout.init();
