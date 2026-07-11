// Render preview-environment k8s manifests from `docker compose config --format json`.
//
// Every service in docker/docker-compose.yml becomes a Deployment + Service in a
// per-release namespace (starwards-<release>), plus the game server itself
// (which is NOT in the compose file — node-red reaches it via the
// `starwards-server` extra_host in compose, and via a same-named Service here).
//
// Compose bind mounts are NOT mounted: CI bakes them into per-release wrapper
// images (see build-preview-images.sh), so `type: bind` volumes are skipped and
// `type: volume`/`type: tmpfs` become emptyDirs. Published host ports are
// ignored — everything is ClusterIP, which is what keeps fixed compose host
// ports from colliding across simultaneous previews. Published TCP ports get an
// IngressRoute at <release>-<service>.<baseDomain>; UDP stays cluster-internal.
//
// CLI: compose config JSON on stdin; env RELEASE, SERVER_IMAGE, IMAGES
// (JSON map compose-service → image ref), BASE_DOMAIN (optional).
// Output: YAML stream (JSON docs separated by `---`) on stdout.

'use strict';

const SERVER_NAME = 'starwards-server';
const TLS_SECRET = 'wildcard-starwards-tls';
const REDIRECT_MIDDLEWARE = 'redirect-https';

const DEFAULT_RESOURCES = {
    requests: { cpu: '50m', memory: '128Mi' },
    limits: { cpu: '500m', memory: '512Mi' },
};

function sanitizeName(name) {
    const out = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(out)) {
        throw new Error(`cannot derive a valid k8s name from compose service "${name}"`);
    }
    return out;
}

function labels(release, serviceName) {
    const out = { app: 'starwards', release };
    if (serviceName) {
        out.service = serviceName;
    }
    return out;
}

// compose `deploy.resources` → k8s resources; falls back to small preview defaults.
function resourcesFor(svc) {
    const spec = svc.deploy && svc.deploy.resources;
    if (!spec || (!spec.limits && !spec.reservations)) {
        return DEFAULT_RESOURCES;
    }
    const convert = (r) => {
        const out = {};
        if (r.cpus) {
            out.cpu = `${Math.round(parseFloat(r.cpus) * 1000)}m`;
        }
        if (r.memory) {
            out.memory = String(r.memory);
        }
        return out;
    };
    return {
        requests: spec.reservations ? convert(spec.reservations) : DEFAULT_RESOURCES.requests,
        limits: spec.limits ? convert(spec.limits) : DEFAULT_RESOURCES.limits,
    };
}

// Unique container-side ports: [{ containerPort, protocol, published }]
function containerPorts(svc) {
    const seen = new Map();
    for (const p of svc.ports || []) {
        const protocol = (p.protocol || 'tcp').toUpperCase();
        const key = `${p.target}/${protocol}`;
        if (!seen.has(key)) {
            seen.set(key, { containerPort: p.target, protocol, published: Boolean(p.published) });
        }
    }
    return [...seen.values()];
}

function deployment({ namespace, release, name, image, ports, env, volumes, resources, probe }) {
    const container = {
        name,
        image,
        ports: ports.map(({ containerPort, protocol }) => ({ containerPort, protocol })),
        resources,
    };
    if (env && env.length) {
        container.env = env;
    }
    if (probe) {
        container.readinessProbe = probe;
    }
    if (volumes && volumes.length) {
        container.volumeMounts = volumes.map((v) => ({ name: v.name, mountPath: v.mountPath }));
    }
    const podSpec = { containers: [container] };
    if (volumes && volumes.length) {
        podSpec.volumes = volumes.map((v) => ({ name: v.name, emptyDir: v.emptyDir }));
    }
    return {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name, namespace, labels: labels(release, name) },
        spec: {
            replicas: 1,
            selector: { matchLabels: labels(release, name) },
            template: { metadata: { labels: labels(release, name) }, spec: podSpec },
        },
    };
}

function service({ namespace, release, name, ports }) {
    return {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name, namespace, labels: labels(release, name) },
        spec: {
            selector: labels(release, name),
            ports: ports.map(({ containerPort, protocol }) => ({
                name: `p${containerPort}-${protocol.toLowerCase()}`,
                port: containerPort,
                targetPort: containerPort,
                protocol,
            })),
        },
    };
}

// HTTPS IngressRoute + HTTP→HTTPS redirect for one host → service:port.
function ingressRoutes({ namespace, release, name, host, serviceName, port }) {
    const meta = (suffix) => ({
        name: `${name}${suffix}`,
        namespace,
        labels: labels(release, serviceName),
    });
    return [
        {
            apiVersion: 'traefik.io/v1alpha1',
            kind: 'IngressRoute',
            metadata: meta(''),
            spec: {
                entryPoints: ['websecure'],
                routes: [{ match: `Host(\`${host}\`)`, kind: 'Rule', services: [{ name: serviceName, port }] }],
                tls: { secretName: TLS_SECRET },
            },
        },
        {
            apiVersion: 'traefik.io/v1alpha1',
            kind: 'IngressRoute',
            metadata: meta('-redirect'),
            spec: {
                entryPoints: ['web'],
                routes: [
                    {
                        match: `Host(\`${host}\`)`,
                        kind: 'Rule',
                        middlewares: [{ name: REDIRECT_MIDDLEWARE }],
                        services: [{ name: serviceName, port }],
                    },
                ],
            },
        },
    ];
}

function render(composeConfig, { release, baseDomain, serverImage, images }) {
    if (!release || !serverImage) {
        throw new Error('release and serverImage are required');
    }
    const namespace = `starwards-${release}`;
    const docs = [
        {
            apiVersion: 'v1',
            kind: 'Namespace',
            metadata: { name: namespace, labels: labels(release) },
        },
        {
            apiVersion: 'traefik.io/v1alpha1',
            kind: 'Middleware',
            metadata: { name: REDIRECT_MIDDLEWARE, namespace, labels: labels(release) },
            spec: { redirectScheme: { scheme: 'https', permanent: true } },
        },
    ];

    // The game server (built from the root Dockerfile, not part of compose).
    // Its Service name matches compose's `starwards-server` extra_host, so
    // compose services that dial it resolve naturally through namespace DNS.
    const serverPorts = [{ containerPort: 80, protocol: 'TCP', published: true }];
    docs.push(
        deployment({
            namespace,
            release,
            name: SERVER_NAME,
            image: serverImage,
            ports: serverPorts,
            env: [{ name: 'PORT', value: '80' }],
            resources: {
                requests: { cpu: '100m', memory: '256Mi' },
                limits: { cpu: '500m', memory: '512Mi' },
            },
            probe: { httpGet: { path: '/health', port: 80 }, initialDelaySeconds: 5, periodSeconds: 10 },
        }),
        service({ namespace, release, name: SERVER_NAME, ports: serverPorts }),
        ...ingressRoutes({
            namespace,
            release,
            name: SERVER_NAME,
            host: `${release}.${baseDomain}`,
            serviceName: SERVER_NAME,
            port: 80,
        }),
    );

    for (const [composeName, svc] of Object.entries(composeConfig.services || {})) {
        const name = sanitizeName(composeName);
        if (name === SERVER_NAME) {
            throw new Error(`compose service name "${composeName}" collides with the game server`);
        }
        const image = images[composeName];
        if (!image) {
            throw new Error(`no image provided for compose service "${composeName}"`);
        }
        const ports = containerPorts(svc);
        const env = Object.entries(svc.environment || {}).map(([k, v]) => ({ name: k, value: String(v) }));
        // bind mounts are baked into the wrapper image; only runtime volumes remain
        const volumes = (svc.volumes || [])
            .filter((v) => v.type === 'volume' || v.type === 'tmpfs')
            .map((v, i) => ({
                name: `vol-${i}`,
                mountPath: v.target,
                emptyDir: v.type === 'tmpfs' ? { medium: 'Memory' } : {},
            }));

        docs.push(
            deployment({ namespace, release, name, image, ports, env, volumes, resources: resourcesFor(svc) }),
            service({ namespace, release, name, ports }),
        );

        const publishedTcp = ports.filter((p) => p.published && p.protocol === 'TCP');
        for (const p of publishedTcp) {
            const suffix = publishedTcp.length > 1 ? `-${p.containerPort}` : '';
            docs.push(
                ...ingressRoutes({
                    namespace,
                    release,
                    name: `${name}${suffix}`,
                    host: `${release}-${name}${suffix}.${baseDomain}`,
                    serviceName: name,
                    port: p.containerPort,
                }),
            );
        }
    }
    return docs;
}

function main() {
    const input = require('fs').readFileSync(0, 'utf8');
    const docs = render(JSON.parse(input), {
        release: process.env.RELEASE,
        baseDomain: process.env.BASE_DOMAIN || 'dev.starwards.space',
        serverImage: process.env.SERVER_IMAGE,
        images: JSON.parse(process.env.IMAGES || '{}'),
    });
    // JSON is valid YAML, so a `---`-separated JSON stream is a valid multi-doc YAML stream.
    process.stdout.write(docs.map((d) => `---\n${JSON.stringify(d, null, 2)}\n`).join(''));
}

if (require.main === module) {
    main();
}

module.exports = { render };
