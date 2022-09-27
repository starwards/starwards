import { Driver } from '@starwards/core';
import { Lobby } from '../components/lobby';
import React from 'react';
import ReactDOM from 'react-dom';

const driver = new Driver(window.location).connect();
ReactDOM.render(<Lobby driver={driver} />, document.querySelector('#wrapper'));
