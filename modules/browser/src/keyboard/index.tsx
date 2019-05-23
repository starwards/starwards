import { DashboardWidget } from '../dashboard';
import { ReactProps } from 'golden-layout';
import React from 'react';
import { Keyboard } from './keyboard';
import { ButtonKey } from './keyboard-display';
import { Loop } from '../loop';
import { getRoom } from '../client';
import { shipId } from '@starwards/server/src/space/map';
import { Vec2 } from '@starwards/model';

const buttons = new Set<ButtonKey>([32, 37, 38, 40, 39]);
class KeyboardCommands extends React.Component<
  Mappings & ReactProps,
  { pressed: Set<ButtonKey> }
> {
  private pressedTime = new Map<ButtonKey, number>();
  private loop = new Loop(this.whilePressed.bind(this), 1000 / 10);
  private room = getRoom('space');

  constructor(p: Mappings & ReactProps) {
    super(p);
    this.state = {
      pressed: new Set<ButtonKey>()
    };
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
    this.setState(state => {
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
  }

  private onPressed = (keyCode: ButtonKey) => {
    this.setState(state => {
      if (state.pressed.has(keyCode)) {
        return null;
      } else {
        this.pressedTime.set(keyCode, 0);
        state.pressed.add(keyCode);
        this.loop.start();
        return { pressed: state.pressed };
      }
    });
  }

  private whilePressed(delta: number) {
    for (const pressed of this.pressedTime) {
      pressed[1] += delta;
      this.pressedTime.set(pressed[0], pressed[1]);
      const ship = this.room.state.get(shipId);
      switch (pressed[0]) {
        case 32:
          if (ship) {
            // stop turning
            this.room.send({
              id: shipId,
              type: 'SetTurnSpeed',
              value: ship.turnSpeed * 0.8
            });
            // stop moving
            this.room.send({
              id: shipId,
              type: 'SetVelocity',
              value: Vec2.scale(ship.velocity, 0.8)
            });
          }
          break;
        case 37:
          // turn left
          this.room.send({
            id: shipId,
            type: 'ChangeTurnSpeed',
            delta: -pressed[1] / 1000
          });
          break;
        case 39:
          // turn right
          this.room.send({
            id: shipId,
            type: 'ChangeTurnSpeed',
            delta: pressed[1] / 1000
          });
          break;
        case 38:
          // accelerate forward
          if (ship) {
            this.room.send({
              id: shipId,
              type: 'ChangeVelocity',
              delta: Vec2.Rotate({ x: pressed[1] / 1000, y: 0 }, ship.angle)
            });
          }
          break;
        case 40:
          // accelerate forward
          if (ship) {
            this.room.send({
              id: shipId,
              type: 'ChangeVelocity',
              delta: Vec2.Rotate({ x: -pressed[1] / 1000, y: 0 }, ship.angle)
            });
          }
          break;
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
  initialState: defaultMappings
};

// TODO https://www.npmjs.com/package/contro
