import * as path from 'path';

import { server } from './server';

// this path has to match the setup in scripts/pkg.js
void server(80, path.join(__dirname, '..', 'static'));

// for local debugging run server(80, path.join(__dirname, '..', '..', 'browser', 'dist'));
