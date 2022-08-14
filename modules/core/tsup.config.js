import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    outDir: 'cjs',
    format: 'cjs',
    minify: true,
    keepNames: true,
    legacyOutput: true,
    splitting: false,
    sourcemap: true,
    dts: true,
    clean: true,
    tsconfig: './tsconfig.runtime.json',
});
