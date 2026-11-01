// Removes the GitHub deployment environments of PRs that are not open:
// pr-<N> (game server) plus per-service environments pr-<N>-<service>.
// Called from actions/github-script in deploy.yml (cleanup job).
module.exports = async ({ github, context, core }, openPrs) => {
    const open = new Set(openPrs.map(Number));
    const environments = await github.paginate(
        github.rest.repos.getAllEnvironments,
        { ...context.repo, per_page: 100 },
        (res) => res.data.environments,
    );
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
            await github.rest.repos.createDeploymentStatus({ ...context.repo, deployment_id: d.id, state: 'inactive' });
            await github.rest.repos.deleteDeployment({ ...context.repo, deployment_id: d.id });
        }
        // Deleting the environment shell needs admin rights, which
        // GITHUB_TOKEN may not have — best-effort only.
        try {
            await github.rest.repos.deleteAnEnvironment({ ...context.repo, environment_name: environment });
        } catch (e) {
            core.warning(`Could not delete environment ${environment}: ${e.message}`);
        }
    }
};
