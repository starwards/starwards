import { server } from './server';
import * as path from 'path';

// this path has to match the setup in scripts/pkg.js
server(80, path.join(__dirname, '..', 'static'));
