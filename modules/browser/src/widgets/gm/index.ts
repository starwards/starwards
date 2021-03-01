import { SelectionContainer } from '../../radar/selection-container';
import { getGlobalRoom } from '../../client';
import { getGmRadarComponent } from './radar';

export class GmWidgets {
    public selectionContainer = new SelectionContainer();
    public radar = getGmRadarComponent(this.selectionContainer);
    constructor() {
        // todo make lazy
        void getGlobalRoom('space').then((spaceRoom) => this.selectionContainer.init(spaceRoom.state));
    }
}
