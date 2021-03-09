import * as path from 'path';

import { server } from './server';

void server(Number(process.env.PORT || 8080), path.resolve(__dirname, '..', '..', '..', 'static'));
