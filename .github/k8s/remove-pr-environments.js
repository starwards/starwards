// Removes the GitHub deployment environments of PRs that are not open:
// pr-<N> (game server) plus per-service environments pr-<N>-<service>.
// Called from actions/github-script in deploy.yml (cleanup job).
module.exports = async ({ github, context, core }, openPrs) => {
    const open = new Set(openPrs.map(Number));
    let canDeleteEnvironments = true;
    const environments = await github.paginate(github.rest.repos.getAllEnvironments, {
        ...context.repo,
        per_page: 100,
    });
    for (const { name: environment } of environments) {
        const match = /^pr-(\d+)(-|$)/.exec(environment);
        if (!match || open.has(Number(match[1]))) continue;
        core.info(`removing ${environment}`);
        const deployments = await github.paginate(github.rest.repos.listDeployments, {
            ...context.repo,
            environment,
            per_page: 100,
        });
        for (const d of deployments) {
            try {
                await github.rest.repos.createDeploymentStatus({
                    ...context.repo,
                    deployment_id: d.id,
                    state: 'inactive',
                });
                await github.rest.repos.deleteDeployment({ ...context.repo, deployment_id: d.id });
            } catch (e) {
                // already removed by another run
                if (e.status !== 404) throw e;
            }
        }
        // Deleting the environment itself needs repo Administration: write,
        // which GITHUB_TOKEN never has; see ENVIRONMENTS_ADMIN_TOKEN in deploy.yml.
        if (!canDeleteEnvironments) continue;
        try {
            await github.rest.repos.deleteAnEnvironment({ ...context.repo, environment_name: environment });
        } catch (e) {
            if (e.status !== 403) throw e;
            canDeleteEnvironments = false;
            core.warning(
                `Cannot delete environments (${e.message}); set secret ENVIRONMENTS_ADMIN_TOKEN. Deployments are still deactivated.`,
            );
        }
    }
};
