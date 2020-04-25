import { SpaceObject, Vec2 } from '@starwards/model';
import { ReactProps } from 'golden-layout';
import React from 'react';
import { getGlobalRoom, NamedGameRoom, getRoomById } from '../../client';
import { Loop } from '../../loop';
import { DashboardWidget } from '../dashboard';
import { Keyboard } from './keyboard';
import { ButtonKey } from './keyboard-display';

const buttons = new Set<ButtonKey>([32, 37, 38, 40, 39, 16]);
class KeyboardCommands extends React.Component<Props & ReactProps, { pressed: Set<ButtonKey> }> {
    private pressedTime = new Map<ButtonKey, number>();
    private loop = new Loop(this.whilePressed.bind(this), 1000 / 10);
    private shipRoom: NamedGameRoom<'ship'> | null = null;
    private spaceRoom: NamedGameRoom<'space'> | null = null;

    constructor(p: Props & ReactProps) {
        super(p);
        this.state = {
            pressed: new Set<ButtonKey>(),
        };
        getRoomById('ship', p.shipId).then((room) => (this.shipRoom = room));
        getGlobalRoom('space').then((room) => (this.spaceRoom = room));
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
        if (this.shipRoom) {
            const boost = this.pressedTime.has(16) ? 3 : 1;
            switch (key) {
                case 32:
                    // stop turning
                    this.shipRoom.send('SetTurnSpeed', {
                        value: subject.turnSpeed * 0.8,
                    });
                    // stop moving
                    this.shipRoom.send('SetVelocity', {
                        value: Vec2.scale(subject.velocity, 0.8),
                    });
                    break;
                case 37:
                    // turn left
                    this.shipRoom.send('ChangeTurnSpeed', {
                        delta: -presedTime * boost,
                    });
                    break;
                case 39:
                    // turn right
                    this.shipRoom.send('ChangeTurnSpeed', {
                        delta: presedTime * boost,
                    });
                    break;
                case 38:
                    // accelerate forward
                    this.shipRoom.send('ChangeVelocity', {
                        delta: Vec2.Rotate({ x: presedTime * boost, y: 0 }, subject.angle),
                    });
                    break;
                case 40:
                    // accelerate backwards
                    this.shipRoom.send('ChangeVelocity', {
                        delta: Vec2.Rotate({ x: -presedTime * boost, y: 0 }, subject.angle),
                    });
                    break;
            }
        }
    }

    private whilePressed(deltaMs: number) {
        if (this.spaceRoom) {
            const deltaSeconds = deltaMs / 1000;
            const ship = this.spaceRoom.state.get(this.props.shipId);
            for (const pressed of this.pressedTime) {
                this.pressedTime.set(pressed[0], (pressed[1] += deltaSeconds));
                if (ship) {
                    this.handlePressed(ship, pressed[0], pressed[1]);
                }
            }
        }
    }
}

type Props = { shipId: string };

export const keyboardWidget: DashboardWidget<Props> = {
    name: 'keyboard commands',
    type: 'react-component',
    component: KeyboardCommands,
    defaultProps: {},
};

// TODO https://www.npmjs.com/package/contro
