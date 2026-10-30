// Removes the GitHub deployment environments of closed PRs:
// pr-<N> (game server) plus per-service environments pr-<N>-<service>.
// Called from actions/github-script in deploy.yml (teardown and sweep).
module.exports = async ({ github, context, core }, prNumbers) => {
    const { data } = await github.rest.repos.getAllEnvironments({
        ...context.repo,
        per_page: 100,
    });
    for (const pr of prNumbers) {
        const prefix = `pr-${pr}`;
        const names = data.environments.map((e) => e.name).filter((n) => n === prefix || n.startsWith(`${prefix}-`));
        for (const environment of names) {
            const { data: deployments } = await github.rest.repos.listDeployments({
                ...context.repo,
                environment,
                per_page: 100,
            });
            for (const d of deployments) {
                await github.rest.repos.createDeploymentStatus({
                    ...context.repo,
                    deployment_id: d.id,
                    state: 'inactive',
                });
                await github.rest.repos.deleteDeployment({
                    ...context.repo,
                    deployment_id: d.id,
                });
            }
            // Deleting the environment shell needs admin rights, which
            // GITHUB_TOKEN may not have — best-effort only.
            try {
                await github.rest.repos.deleteAnEnvironment({
                    ...context.repo,
                    environment_name: environment,
                });
            } catch (e) {
                core.warning(`Could not delete environment ${environment}: ${e.message}`);
            }
        }
    }
};
