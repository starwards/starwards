import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts', 'src/index.internal.ts', 'src/index.public.ts'],
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
