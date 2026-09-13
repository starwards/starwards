import { Driver } from '@starwards/core';
import { Lobby } from '../components/lobby';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { shouldRedirectToStation } from '../entry-routing';

const driver = new Driver(window.location).connect();
const hasLobbyParam = new URLSearchParams(window.location.search).has('lobby');

void driver.getAdminDriver().then((adminDriver) => {
    if (shouldRedirectToStation(adminDriver.state.gameStatus, hasLobbyParam)) {
        window.location.replace('station.html');
        return;
    }
    const root = createRoot(document.querySelector('#wrapper')!);
    root.render(<Lobby driver={driver} />);
});
