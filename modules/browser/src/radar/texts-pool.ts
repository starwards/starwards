import { Container, Text, TextStyle } from 'pixi.js';

export class TextsPool {
    private instances: Text[] = [];
    constructor(private parent: Container) {}
    public [Symbol.iterator] = () => new TextsPoolIterator(this.parent, this.instances);
}

// eslint-disable-next-line:max-classes-per-file
class TextsPoolIterator {
    private nextElement = 0;

    constructor(
        private parent: Container,
        private instances: Text[],
    ) {}

    public next() {
        if (this.nextElement < this.instances.length) {
            return { value: this.instances[this.nextElement++] };
        } else {
            // ctx.font = "24px bebas_neue_regularregular, Impact, Arial, sans-serif";
            const value = new Text(
                '',
                new TextStyle({
                    fontFamily: 'Bebas',
                    fontSize: 18,
                    align: 'center',
                }),
            );
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
            child.destroy({
                children: true,
            });
        }
    }
}
