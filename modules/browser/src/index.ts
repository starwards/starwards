import GoldenLayout from 'golden-layout';
import { component as radar } from './radar/component';
import { Client } from 'colyseus.js';

const ENDPOINT = 'ws://localhost:8080'; // todo: use window.location
const client = new Client(ENDPOINT);

const config = {
  content: [{
    type: 'row',
    content: [
      {
        type: 'component',
        componentName: 'radar',
        componentState: { client }
      },
      {
        type: 'component',
        componentName: 'radar',
        componentState: { client }
      }
    ]
  }]
};

const myLayout = new GoldenLayout( config );

myLayout.registerComponent( 'radar', radar);

myLayout.init();
