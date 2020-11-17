import '@maulingmonkey/gamepad';
import { rotateToTarget, rotationFromTargetTurnSpeed, SpaceObject } from '@starwards/model';
import EventEmitter from 'eventemitter3';
import { NamedGameRoom } from '../../client';
import { GamepadAxis, Panel } from '../../property-panel';
import { StatesToggle } from '../../states-toggle';

export class RotationComponent {
    private state = new StatesToggle('SPEED', 'TARGET', 'ENGINE');
    private targetTurnSpeed = 0;
    private targetAimOffset = 0;
    constructor(private shipRoom: NamedGameRoom<'ship'>, private viewModelChanges: EventEmitter) {}
    private setValueSpeed = (value: number) => {
        if (this.state.isState('SPEED')) {
            this.targetTurnSpeed = value;
            this.viewModelChanges.emit('targetTurnSpeed');
        }
    };
    private setValueTarget = (value: number) => {
        if (this.state.isState('TARGET')) {
            this.targetAimOffset = value;
            this.viewModelChanges.emit('targetOffset');
        }
    };
    private setValueEngine = (value: number) => {
        if (this.state.isState('ENGINE')) {
            this.shipRoom.send('setRotation', { value: value });
        }
    };

    addToPanel(panel: Panel) {
        const axisInfo: GamepadAxis = {
            gamepadIndex: 0,
            axisIndex: 0,
            deadzone: [-0.01, 0.01],
        };
        panel.addText('matchHeading', () => this.state.toString());
        panel.addProperty('targetTurnSpeed', () => this.targetTurnSpeed, [-90, 90], this.setValueSpeed, axisInfo);
        panel.addProperty('targetOffset', () => this.targetAimOffset, [-30, 30], this.setValueTarget, axisInfo);
        panel.addProperty('rotation', () => this.shipRoom.state.rotation, [-1, 1], this.setValueEngine, axisInfo);
    }

    toggleState() {
        this.state.toggleState();
        this.targetTurnSpeed = 0;
        this.targetAimOffset = 0;
        this.viewModelChanges.emit('targetTurnSpeed');
        this.viewModelChanges.emit('targetOffset');
        this.viewModelChanges.emit('matchHeading');
        this.shipRoom.send('setRotation', { value: 0 });
    }

    update(deltaSeconds: number, target: SpaceObject | null) {
        this.state.setLegalState('TARGET', !!target);
        let rotationCommand = this.shipRoom.state.rotation;
        if (this.state.isState('TARGET')) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            rotationCommand = rotateToTarget(deltaSeconds, this.shipRoom.state, target!.position, this.targetAimOffset);
        } else if (this.state.isState('SPEED')) {
            rotationCommand = rotationFromTargetTurnSpeed(deltaSeconds, this.shipRoom.state, this.targetTurnSpeed);
        }
        if (this.shipRoom.state.rotation !== rotationCommand) {
            this.shipRoom.send('setRotation', { value: rotationCommand });
        }
    }
}
