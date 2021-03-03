import { Driver } from '../../driver';
import { SelectionContainer } from '../../radar/selection-container';
import { getGmRadarComponent } from './radar';

export class GmWidgets {
    public selectionContainer = new SelectionContainer();
    public radar: ReturnType<typeof getGmRadarComponent>;
    constructor(driver: Driver) {
        // todo make lazy
        this.radar = getGmRadarComponent(this.selectionContainer, driver);
        void driver.getSpaceDriver().then((spaceDriver) => this.selectionContainer.init(spaceDriver.state));
    }
}
