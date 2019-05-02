import * as PIXI from 'pixi.js';

export class TextsPool {
  private instances: PIXI.Text[] = [];
  constructor(private parent: PIXI.Container) {}
  public [Symbol.iterator] = () => new TextsPoolIterator(this.parent, this.instances);

}

// tslint:disable-next-line:max-classes-per-file
class TextsPoolIterator {
  private nextElement = 0;

  constructor(private parent: PIXI.Container, private instances: PIXI.Text[]) {}

  public next() {
    if (this.nextElement < this.instances.length) {
      return { value: this.instances[this.nextElement++] };
    } else {
      // ctx.font = "24px bebas_neue_regularregular, Impact, Arial, sans-serif";
      const value = new PIXI.Text('', new PIXI.TextStyle({
        fontFamily: 'Bebas',
        fontSize: 18,
        align: 'center'
      }));
      this.instances.push(value);
      this.parent.addChild(value);
      this.nextElement++;
      return { value };
    }
  }
  /**
   * gives an iterator the opportunity to clean up if an iteration ends prematurely.
   */
  public return() {
      const toRemove = this.instances.splice(this.nextElement);
      for (const child of toRemove) {
        child.parent.removeChild(child);
        child.destroy();
      }
  }
}
