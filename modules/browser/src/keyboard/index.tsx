import { DashboardWidget } from '../dashboard';
import { ReactProps } from 'golden-layout';
import React from 'react';
import { Keyboard } from './keyboard';
import { ButtonKey } from './keyboard-display';
import { Loop } from '../loop';
import { getRoom } from '../client';
import { shipId } from '@starwards/server/src/space/map';
import { Vec2 } from '@starwards/model';
class KeyboardCommands extends React.Component<Mappings & ReactProps> {
  private pressedTime = new Map<ButtonKey, number>();
  private loop = new Loop(this.whilePressed.bind(this), 1000 / 10);
  private room = getRoom('space');

  public render() {
    return (
      <Keyboard
        buttons={[32, 37, 38, 40, 39]}
        keyHandler={this.onPressedChange}
      />
    );
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
                value: ship.turnSpeed / 2
              });
              // stop moving
              this.room.send({
                id: shipId,
                type: 'SetVelocity',
                value: Vec2.scale(ship.velocity, 0.5)
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

  private onPressedChange = (pressed: ButtonKey[]) => {
    for (const oldPressedKey of this.pressedTime.keys()) {
      if (pressed.indexOf(oldPressedKey) === -1) {
        this.pressedTime.delete(oldPressedKey);
      }
    }
    if (pressed.length) {
      for (const newPressedKey of pressed) {
        if (!this.pressedTime.has(newPressedKey)) {
          this.pressedTime.set(newPressedKey, 0);
        }
      }
      this.loop.start();
    } else {
      this.loop.stop();
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
