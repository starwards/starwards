import '@maulingmonkey/gamepad';
import { capToRange, ManeuveringCommand, matchLocalSpeed, SpaceObject, XY } from '@starwards/model';
import EventEmitter from 'eventemitter3';
import { NamedGameRoom } from '../../client';
import { GamepadAxis, Panel } from '../../property-panel';
import { StatesToggle } from '../../states-toggle';

export class ManeuveringComponent {
    private state = new StatesToggle('SPEED', 'TARGET', 'ENGINE');
    private targetVelocity: XY.Mutable = XY.clone(XY.zero);
    private targetOffset: XY.Mutable = XY.clone(XY.zero);
    constructor(private shipRoom: NamedGameRoom<'ship'>, private viewModelChanges: EventEmitter) {}

    private setStrafeSpeed = (value: number) => {
        if (this.state.isState('SPEED')) {
            this.targetVelocity.y = value;
            this.viewModelChanges.emit('targetStrafeSpeed');
        }
    };
    private setStrafeEngine = (value: number) => {
        if (this.state.isState('ENGINE')) {
            this.shipRoom.send('setStrafe', { value: value });
        }
    };
    private setStrafeTarget = (value: number) => {
        if (this.state.isState('TARGET')) {
            this.targetOffset.y = value;
            this.viewModelChanges.emit('targetStrafeOffset');
        }
    };
    private setBoostSpeed = (value: number) => {
        if (this.state.isState('SPEED')) {
            this.targetVelocity.x = value;
            this.viewModelChanges.emit('targetBoostSpeed');
        }
    };
    private setBoostEngine = (value: number) => {
        if (this.state.isState('ENGINE')) {
            this.shipRoom.send('setBoost', { value: value });
        }
    };
    private setBoostTarget = (value: number) => {
        if (this.state.isState('TARGET')) {
            this.targetOffset.x = value;
            this.viewModelChanges.emit('targetBoostOffset');
        }
    };

    addToPanel(panel: Panel) {
        const strafeAxis: GamepadAxis = {
            gamepadIndex: 0,
            axisIndex: 2,
            deadzone: [-0.01, 0.01],
        };
        const boostAxis: GamepadAxis = {
            gamepadIndex: 0,
            axisIndex: 3,
            deadzone: [-0.01, 0.01],
            inverted: true,
        };
        panel.addText('matchSpeed', () => this.state.toString());
        panel.addProperty(
            'targetStrafeSpeed',
            () => this.targetVelocity.y,
            [-1000, 1000],
            this.setStrafeSpeed,
            strafeAxis
        );
        panel.addProperty('strafe', () => this.shipRoom.state.strafe, [-1, 1], this.setStrafeEngine, strafeAxis);
        panel.addProperty(
            'targetStrafeOffset',
            () => this.targetOffset.y,
            [-1000, 1000],
            this.setStrafeTarget,
            strafeAxis
        );
        panel.addProperty(
            'targetBoostSpeed',
            () => this.targetVelocity.x,
            [-1000, 1000],
            this.setBoostSpeed,
            boostAxis
        );
        panel.addProperty('boost', () => this.shipRoom.state.boost, [-1, 1], this.setBoostEngine, boostAxis);
        panel.addProperty(
            'targetBoostOffset',
            () => this.targetOffset.x,
            [-1000, 1000],
            this.setBoostTarget,
            boostAxis
        );
    }

    toggleState() {
        this.state.toggleState();
        this.targetVelocity = XY.clone(XY.zero);
        this.viewModelChanges.emit('matchSpeed');
        this.viewModelChanges.emit('targetStrafeSpeed');
        this.viewModelChanges.emit('targetBoostSpeed');
        this.viewModelChanges.emit('targetStrafeOffset');
        this.viewModelChanges.emit('targetBoostOffset');
        this.shipRoom.send('setStrafe', { value: 0 });
        this.shipRoom.send('setBoost', { value: 0 });
    }

    update(deltaSeconds: number, target: SpaceObject | null) {
        this.state.setLegalState('TARGET', !!target);
        let maneuveringCommand: ManeuveringCommand = {
            strafe: this.shipRoom.state.strafe,
            boost: this.shipRoom.state.boost,
        };
        if (this.state.isState('TARGET')) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const targetVelocity = XY.add(this.targetOffset, this.shipRoom.state.globalToLocal(target!.velocity));
            maneuveringCommand = matchLocalSpeed(deltaSeconds, this.shipRoom.state, targetVelocity);
        } else if (this.state.isState('SPEED')) {
            maneuveringCommand = matchLocalSpeed(deltaSeconds, this.shipRoom.state, this.targetVelocity);
        }
        if (this.shipRoom.state.strafe !== maneuveringCommand.strafe) {
            this.shipRoom.send('setStrafe', { value: capToRange(-1, 1, maneuveringCommand.strafe) });
        }
        if (this.shipRoom.state.boost !== maneuveringCommand.boost) {
            this.shipRoom.send('setBoost', { value: capToRange(-1, 1, maneuveringCommand.boost) });
        }
    }
}
