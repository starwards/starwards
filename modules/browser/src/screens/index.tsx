import { Driver } from '@starwards/core';
import { Lobby } from '../components/lobby';
import React from 'react';
import { createRoot } from 'react-dom/client';

const driver = new Driver(window.location).connect();
const root = createRoot(document.querySelector('#wrapper')!);
root.render(<Lobby driver={driver} />);
