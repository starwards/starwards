import { DashboardWidget } from '../dashboard';
import { ReactProps } from 'golden-layout';
import React from 'react';
import { Keyboard } from './keyboard';
import { ButtonKey } from './keyboard-display';
import { Loop } from '../../loop';
import { getRoom, NamedGameRoom } from '../../client';
import { Vec2, SpaceObject, shipId } from '@starwards/model';

const buttons = new Set<ButtonKey>([32, 37, 38, 40, 39, 16]);
class KeyboardCommands extends React.Component<Mappings & ReactProps, { pressed: Set<ButtonKey> }> {
    private pressedTime = new Map<ButtonKey, number>();
    private loop = new Loop(this.whilePressed.bind(this), 1000 / 10);
    private room: NamedGameRoom<'space'> | null = null;

    constructor(p: Mappings & ReactProps) {
        super(p);
        this.state = {
            pressed: new Set<ButtonKey>(),
        };
        getRoom('space').then((room) => (this.room = room));
    }
    public render() {
        return (
            <Keyboard
                buttons={buttons}
                pressed={this.state.pressed}
                onPressed={this.onPressed}
                onUnPressed={this.onUnPressed}
            />
        );
    }

    private onUnPressed = (keyCode: ButtonKey) => {
        this.setState((state) => {
            if (state.pressed.has(keyCode)) {
                this.pressedTime.delete(keyCode);
                state.pressed.delete(keyCode);
                if (state.pressed.size === 0) {
                    this.loop.stop();
                }
                return { pressed: state.pressed };
            } else {
                return null;
            }
        });
    };

    private onPressed = (keyCode: ButtonKey) => {
        this.setState((state) => {
            if (state.pressed.has(keyCode)) {
                return null;
            } else {
                this.pressedTime.set(keyCode, 0);
                state.pressed.add(keyCode);
                this.loop.start();
                return { pressed: state.pressed };
            }
        });
    };
    private handlePressed(subject: SpaceObject, key: ButtonKey, presedTime: number) {
        if (this.room) {
            const boost = this.pressedTime.has(16) ? 3 : 1;
            switch (key) {
                case 32:
                    // stop turning
                    this.room.send({
                        id: shipId,
                        type: 'SetTurnSpeed',
                        value: subject.turnSpeed * 0.8,
                    });
                    // stop moving
                    this.room.send({
                        id: shipId,
                        type: 'SetVelocity',
                        value: Vec2.scale(subject.velocity, 0.8),
                    });
                    break;
                case 37:
                    // turn left
                    this.room.send({
                        id: shipId,
                        type: 'ChangeTurnSpeed',
                        delta: -presedTime * boost,
                    });
                    break;
                case 39:
                    // turn right
                    this.room.send({
                        id: shipId,
                        type: 'ChangeTurnSpeed',
                        delta: presedTime * boost,
                    });
                    break;
                case 38:
                    // accelerate forward
                    this.room.send({
                        id: shipId,
                        type: 'ChangeVelocity',
                        delta: Vec2.Rotate({ x: presedTime * boost, y: 0 }, subject.angle),
                    });
                    break;
                case 40:
                    // accelerate forward
                    this.room.send({
                        id: shipId,
                        type: 'ChangeVelocity',
                        delta: Vec2.Rotate({ x: -presedTime * boost, y: 0 }, subject.angle),
                    });
                    break;
            }
        }
    }

    private whilePressed(deltaMs: number) {
        if (this.room) {
            const deltaSeconds = deltaMs / 1000;
            const ship = this.room.state.get(shipId);
            for (const pressed of this.pressedTime) {
                this.pressedTime.set(pressed[0], (pressed[1] += deltaSeconds));
                if (ship) {
                    this.handlePressed(ship, pressed[0], pressed[1]);
                }
            }
        }
    }
}

type Mappings = object;
const defaultMappings: Mappings = {};

export const keyboardWidget: DashboardWidget<Mappings> = {
    name: 'keyboard commands',
    type: 'react-component',
    component: KeyboardCommands,
    initialState: defaultMappings,
};

// TODO https://www.npmjs.com/package/contro
