import fs from 'fs';
import glob from 'glob';
import packageJson from './package.json';
import path from 'path';
import process from 'process';
import sucrase from '@rollup/plugin-sucrase';

const allNodeTypes = Object.keys(packageJson['node-red'].nodes);
const basePath = path
    .relative(process.cwd(), __dirname)
    .split(path.sep)
    .filter((e) => !!e)
    .map((e) => e + '/')
    .join('');

const makeConfigItem = (nodeType) => ({
    input: `${basePath}src/${nodeType}/${nodeType}.html/index.ts`,
    output: {
        file: `${basePath}dist/${nodeType}/${nodeType}.html`,
        format: 'iife',
    },
    plugins: [
        {
            name: 'htmlWatch',
            load(id) {
                const editorDir = path.dirname(id);
                const htmlFiles = glob.sync(path.join(editorDir, '*.html'));
                htmlFiles.map((file) => this.addWatchFile(file));
            },
        },
        sucrase({
            exclude: ['node_modules/**'],
            transforms: ['typescript', 'imports'],
        }),
        {
            name: 'htmlBundle',
            renderChunk(code, chunk) {
                const editorDir = path.dirname(chunk.facadeModuleId);
                const htmlFiles = glob.sync(path.join(editorDir, '*.html').replace(/\\/g, '/'));
                const htmlContents = htmlFiles.map((fPath) => fs.readFileSync(fPath));

                code = '<script type="text/javascript">\n' + code + '\n' + '</script>\n' + htmlContents.join('\n');

                return {
                    code,
                    map: { mappings: '' },
                };
            },
        },
    ],
    watch: {
        clearScreen: false,
    },
});

export default allNodeTypes.map((nodeType) => makeConfigItem(nodeType));
