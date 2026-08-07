# Workflow Runs

Complete command reference for GitHub Actions workflow operations.

**Note:** All commands assume `$GH` alias is set. Use system gh if available, otherwise /tmp installation.

## List Workflow Runs

```bash
# Recent runs
$GH run list --repo OWNER/REPO --limit 20

# Filter by workflow file
$GH run list --repo OWNER/REPO --workflow ci-cd.yml
$GH run list --repo OWNER/REPO --workflow "CI/CD"

# Filter by status
$GH run list --repo OWNER/REPO --status completed
$GH run list --repo OWNER/REPO --status success
$GH run list --repo OWNER/REPO --status failure
$GH run list --repo OWNER/REPO --status cancelled

# Filter by branch
$GH run list --repo OWNER/REPO --branch main
$GH run list --repo OWNER/REPO --branch develop

# Filter by event
$GH run list --repo OWNER/REPO --event push
$GH run list --repo OWNER/REPO --event pull_request
$GH run list --repo OWNER/REPO --event workflow_dispatch

# JSON output
$GH run list --repo OWNER/REPO --json databaseId,status,conclusion,headBranch,event,createdAt
```

## View Workflow Run

```bash
# View run details
$GH run view <RUN_ID> --repo OWNER/REPO

# JSON output
$GH run view <RUN_ID> --repo OWNER/REPO --json number,status,conclusion,url

# View run logs
$GH run view <RUN_ID> --repo OWNER/REPO --log

# View specific job logs
$GH run view <RUN_ID> --repo OWNER/REPO --log --job <JOB_ID>
```

## Get Run Jobs

```bash
# List all jobs
$GH api repos/OWNER/REPO/actions/runs/<RUN_ID>/jobs

# Get job names and conclusions
$GH api repos/OWNER/REPO/actions/runs/<RUN_ID>/jobs \
  --jq '.jobs[] | {name: .name, conclusion: .conclusion, started_at: .started_at}'

# Get failed jobs only
$GH api repos/OWNER/REPO/actions/runs/<RUN_ID>/jobs \
  --jq '.jobs[] | select(.conclusion=="failure") | {name, conclusion}'

# Get failed jobs with failed steps
$GH api repos/OWNER/REPO/actions/runs/<RUN_ID>/jobs \
  --jq '.jobs[] | select(.conclusion=="failure") | {
    name: .name,
    failed_steps: [.steps[] | select(.conclusion=="failure") | .name]
  }'

# Get specific step details
$GH api repos/OWNER/REPO/actions/runs/<RUN_ID>/jobs \
  --jq '.jobs[].steps[] | select(.name=="Run tests") | {name, conclusion, number}'
```

## Download Logs and Artifacts

```bash
# Download all logs as zip
$GH api repos/OWNER/REPO/actions/runs/<RUN_ID>/logs --paginate > /tmp/run-logs.zip

# Extract logs
cd /tmp && unzip -o -q run-logs.zip

# Log files are typically named: 0_JobName.txt, 1_JobName.txt, etc.
ls -la /tmp/*.txt

# List artifacts
$GH api repos/OWNER/REPO/actions/runs/<RUN_ID>/artifacts

# Get artifact download URLs
$GH api repos/OWNER/REPO/actions/runs/<RUN_ID>/artifacts \
  --jq '.artifacts[] | {name, id, size_in_bytes, expired}'

# Download specific artifact
$GH api repos/OWNER/REPO/actions/artifacts/<ARTIFACT_ID>/zip > /tmp/artifact.zip
```

## List Workflows

```bash
# List all workflows
$GH api repos/OWNER/REPO/actions/workflows

# Get workflow names and IDs
$GH api repos/OWNER/REPO/actions/workflows \
  --jq '.workflows[] | {id, name, path, state}'

# Get specific workflow
$GH api repos/OWNER/REPO/actions/workflows/<WORKFLOW_ID>
```
