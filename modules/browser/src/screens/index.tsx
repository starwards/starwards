import { Lobby } from '../widgets/lobby';
import React from 'react';
import ReactDOM from 'react-dom';
import { getAdminDriver } from '../driver';

void getAdminDriver().then((adminDriver) => {
    ReactDOM.render(<Lobby adminDriver={adminDriver} />, document.querySelector('#wrapper'));
});
