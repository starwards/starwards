import { Room, Client } from 'colyseus';
import { SpaceState } from '@starwards/model';
import { map } from './map';

export class SpaceRoom extends Room<SpaceState> {
    public onInit() {
        this.setState(new SpaceState(map));
        // this.setSimulationInterval(_ => this.update(this.clock.deltaTime));
    }

    public onMessage(_client: Client, _data: any): void {
        throw new Error('Method not implemented.');
    }

    // private update(deltaTime: number) {
    //     // TODO loop over objects and apply speed, collision etc.
    // }

}
