import { Driver } from '../driver';
import { Lobby } from '../widgets/lobby';
import React from 'react';
import { createRoot } from 'react-dom/client';

const driver = new Driver();
const container = document.getElementById('wrapper');
if (!container) {
    throw new Error('cant find root wrapper for react');
}
createRoot(container).render(<Lobby driver={driver} />);
