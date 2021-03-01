import { SelectionContainer } from '../../radar/selection-container';
import { getGmRadarComponent } from './radar';
import { getSpaceDriver } from '../../client';

export class GmWidgets {
    public selectionContainer = new SelectionContainer();
    public radar = getGmRadarComponent(this.selectionContainer);
    constructor() {
        // todo make lazy
        void getSpaceDriver().then((spaceDriver) => this.selectionContainer.init(spaceDriver.state));
    }
}
