// Tests for the compose→k8s preview renderer. The fixture mirrors the shape of
// `docker compose config --format json` for docker/docker-compose.yml.

interface Container {
    name: string;
    image: string;
    ports: { containerPort: number; protocol: string }[];
    env?: { name: string; value: string }[];
    volumeMounts?: { name: string; mountPath: string }[];
}

interface Doc {
    apiVersion: string;
    kind: string;
    metadata: { name: string; namespace?: string; labels?: Record<string, string> };
    spec?: {
        template?: { spec: { containers: Container[]; volumes?: unknown[] } };
        routes?: { match: string; services: { name: string; port: number }[] }[];
        ports?: { port: number; targetPort: number; protocol: string }[];
        tls?: { secretName: string };
    };
}

interface RenderOpts {
    release: string;
    baseDomain: string;
    serverImage: string;
    images: Record<string, string>;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { render, hosts } = require('./render-preview') as {
    render: (config: unknown, opts: RenderOpts) => Doc[];
    hosts: (docs: Doc[]) => string[];
};

const composeConfig = {
    name: 'docker',
    services: {
        mqtt: {
            image: 'eclipse-mosquitto:1.6.10',
            restart: 'always',
            ports: [{ mode: 'ingress', target: 1883, published: '1883', protocol: 'tcp' }],
            volumes: [
                { type: 'bind', source: '/repo/docker/mqtt/config', target: '/mosquitto/config' },
                { type: 'bind', source: '/repo/docker/mqtt/data', target: '/mosquitto/data' },
                { type: 'bind', source: '/repo/docker/mqtt/log', target: '/mosquitto/log' },
            ],
        },
        'node-red': {
            image: 'nodered/node-red:3.0.2',
            restart: 'always',
            environment: { TZ: 'Asia/Jerusalem' },
            extra_hosts: { 'starwards-server': 'host-gateway' },
            ports: [
                { mode: 'ingress', target: 1880, published: '1880', protocol: 'tcp' },
                { mode: 'ingress', target: 57120, published: '57123', protocol: 'udp' },
                { mode: 'ingress', target: 57121, published: '57121', protocol: 'udp' },
            ],
            volumes: [{ type: 'bind', source: '/repo/docker/node-red/data', target: '/data' }],
        },
        'open-stage-control': {
            build: { context: '/repo/docker/osc', dockerfile: 'Dockerfile' },
            restart: 'always',
            ports: [
                { mode: 'ingress', target: 8080, published: '8090', protocol: 'tcp' },
                { mode: 'ingress', target: 57120, published: '57120', protocol: 'udp' },
            ],
            volumes: [
                { type: 'bind', source: '/repo/docker/osc/sessions', target: '/sessions', read_only: true },
                { type: 'bind', source: '/repo/docker/osc/modules', target: '/modules', read_only: true },
            ],
        },
    },
};

const opts: RenderOpts = {
    release: 'pr-7',
    baseDomain: 'dev.starwards.space',
    serverImage: 'ghcr.io/starwards/starwards:abc123',
    images: {
        mqtt: 'ghcr.io/starwards/starwards/preview-mqtt:abc123',
        'node-red': 'ghcr.io/starwards/starwards/preview-node-red:abc123',
        'open-stage-control': 'ghcr.io/starwards/starwards/preview-open-stage-control:abc123',
    },
};

describe('render-preview', () => {
    const docs = render(composeConfig, opts);
    const byKind = (kind: string) => docs.filter((d) => d.kind === kind);
    const deployment = (name: string) => byKind('Deployment').find((d) => d.metadata.name === name);
    const container = (name: string) => deployment(name)?.spec?.template?.spec.containers[0];

    it('renders the namespace, the game server, and every compose service', () => {
        expect(byKind('Namespace').map((d) => d.metadata.name)).toEqual(['starwards-pr-7']);
        expect(
            byKind('Deployment')
                .map((d) => d.metadata.name)
                .sort(),
        ).toEqual(['mqtt', 'node-red', 'open-stage-control', 'starwards-server']);
        expect(byKind('Service')).toHaveLength(4);
        expect(byKind('Middleware')).toHaveLength(1);
        for (const doc of docs) {
            expect(doc.metadata.labels).toMatchObject({ app: 'starwards', release: 'pr-7' });
            if (doc.kind !== 'Namespace') {
                expect(doc.metadata.namespace).toBe('starwards-pr-7');
            }
        }
    });

    it('routes the release host to the game server with the wildcard cert', () => {
        const route = byKind('IngressRoute').find((d) => d.metadata.name === 'starwards-server');
        expect(route?.spec?.routes?.[0].match).toBe('Host(`pr-7.dev.starwards.space`)');
        expect(route?.spec?.routes?.[0].services).toEqual([{ name: 'starwards-server', port: 80 }]);
        expect(route?.spec?.tls?.secretName).toBe('wildcard-starwards-tls');
    });

    it('creates an ingress pair per published TCP port only', () => {
        const routeHosts = byKind('IngressRoute')
            .map((d) => /Host\(`([^`]*)`\)/.exec(d.spec?.routes?.[0].match ?? '')?.[1])
            .sort();
        // server + mqtt + node-red + open-stage-control, each with https + redirect
        expect(routeHosts).toEqual(
            [
                'pr-7.dev.starwards.space',
                'pr-7-mqtt.dev.starwards.space',
                'pr-7-node-red.dev.starwards.space',
                'pr-7-open-stage-control.dev.starwards.space',
            ]
                .flatMap((h) => [h, h])
                .sort(),
        );
    });

    it('keeps UDP ports cluster-internal but present — 57120/udp in two separate pods', () => {
        for (const name of ['node-red', 'open-stage-control']) {
            expect(container(name)?.ports).toContainEqual({ containerPort: 57120, protocol: 'UDP' });
        }
        const svc = byKind('Service').find((d) => d.metadata.name === 'node-red');
        expect(svc?.spec?.ports).toContainEqual({
            name: 'p57120-udp',
            port: 57120,
            targetPort: 57120,
            protocol: 'UDP',
        });
    });

    it('uses the provided per-release images and maps environment to env vars', () => {
        expect(container('open-stage-control')?.image).toBe(opts.images['open-stage-control']);
        expect(container('node-red')?.env).toContainEqual({ name: 'TZ', value: 'Asia/Jerusalem' });
    });

    it('does not mount bind volumes — they are baked into the wrapper images', () => {
        for (const name of ['mqtt', 'node-red', 'open-stage-control']) {
            expect(container(name)?.volumeMounts).toBeUndefined();
            expect(deployment(name)?.spec?.template?.spec.volumes).toBeUndefined();
        }
    });

    it('aliases the dev-server port 8080 to the game server', () => {
        const svc = byKind('Service').find((d) => d.metadata.name === 'starwards-server');
        expect(svc?.spec?.ports).toContainEqual({ name: 'p8080-tcp', port: 8080, targetPort: 80, protocol: 'TCP' });
        expect(svc?.spec?.ports).toContainEqual({ name: 'p80-tcp', port: 80, targetPort: 80, protocol: 'TCP' });
    });

    it('lists every exposed host once, game server first', () => {
        expect(hosts(docs)).toEqual([
            'pr-7.dev.starwards.space',
            'pr-7-mqtt.dev.starwards.space',
            'pr-7-node-red.dev.starwards.space',
            'pr-7-open-stage-control.dev.starwards.space',
        ]);
    });

    it('rejects a compose service with no image mapping', () => {
        expect(() => render(composeConfig, { ...opts, images: {} })).toThrow(/no image provided/);
    });

    it('rejects a compose service that collides with the game server name', () => {
        const clashing = { services: { 'starwards-server': { image: 'x' } } };
        expect(() => render(clashing, opts)).toThrow(/collides/);
    });
});
