// Deletes the GHCR image versions built for closed PRs, in the main package and
// every preview-<service> package. Every PR build carries a pr-<N>-<sha> tag
// (pr-<N> moves to the latest build), so a version belongs to PR N when all of
// its tags are pr-<N>, pr-<N>-<sha> or a bare commit sha. A version that also
// carries any other tag (master, another PR) is shared and kept.
// Called from actions/github-script in deploy.yml (teardown and sweep).
const SHA = /^[0-9a-f]{12,40}$/;

module.exports = async ({ github, context, core }, prNumbers) => {
    const org = context.repo.owner;
    const repoPackage = context.repo.repo;
    const packages = await github.paginate(github.rest.packages.listPackagesForOrganization, {
        org,
        package_type: 'container',
        per_page: 100,
    });
    const names = packages
        .map((p) => p.name)
        .filter((n) => n === repoPackage || n.startsWith(`${repoPackage}/preview-`));
    let failures = 0;
    for (const package_name of names) {
        const versions = await github.paginate(github.rest.packages.getAllPackageVersionsForPackageOwnedByOrg, {
            org,
            package_type: 'container',
            package_name,
            per_page: 100,
        });
        for (const v of versions) {
            const tags = v.metadata.container.tags;
            const pr = prNumbers.find((n) => tags.includes(`pr-${n}`) || tags.some((t) => t.startsWith(`pr-${n}-`)));
            if (pr === undefined) continue;
            const own = (t) => t === `pr-${pr}` || t.startsWith(`pr-${pr}-`) || SHA.test(t);
            if (!tags.every(own)) continue;
            try {
                await github.rest.packages.deletePackageVersionForOrg({
                    org,
                    package_type: 'container',
                    package_name,
                    package_version_id: v.id,
                });
                core.info(`Deleted ${package_name}:${tags.join(',')}`);
            } catch (e) {
                failures++;
                core.warning(`Could not delete ${package_name}:${tags.join(',')}: ${e.message}`);
            }
        }
    }
    if (failures) core.setFailed(`${failures} image version(s) could not be deleted`);
};
