import { Driver } from '../driver';
import { Lobby } from '../components/lobby';
import React from 'react';
import ReactDOM from 'react-dom';

const driver = new Driver();
ReactDOM.render(<Lobby driver={driver} />, document.querySelector('#wrapper'));
