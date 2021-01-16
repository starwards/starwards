import * as path from 'path';

import { server } from './server';

const port = Number(process.env.PORT || 80);
// this path has to match the setup in scripts/pkg.js
void server(port, path.join(__dirname, '..', 'static'));

// for local debugging run server(80, path.join(__dirname, '..', '..', 'browser', 'dist'));
