import { expect } from 'chai';
import { transformSync } from 'esbuild';
import tsconfigRaw from '../tsconfig.json';

describe('esbuild browser bundle: class field semantics', () => {
    it('transforms class fields as plain assignments, not Object.defineProperty', () => {
        const source = `
            class Base {
                get x() { return 'accessor'; }
                set x(_v: string) { /* tracked write */ }
            }
            class Widget extends Base {
                x = 'plain value';
            }
        `;
        const { code } = transformSync(source, {
            loader: 'ts',
            target: 'es2023',
            tsconfigRaw: tsconfigRaw as never,
        });

        expect(code).to.include('this.x = ');
        expect(code).not.to.include('__defProp');
    });
});
