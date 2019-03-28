workflow "Build, Lint and Test" {
  on = "push"
  resolves = ["Check_all"]
}

action "Install" {
  uses = "amir-arad/actions-yarn@master"
  args = "install"
}

action "Lint" {
  needs = "Install"
  uses = "amir-arad/actions-yarn@master"
  args = "lint"
}

action "Test" {
  needs = "Install"
  uses = "amir-arad/actions-yarn@master"
  args = "test"
}

action "Check_all" {
  needs = ["Test", "Lint"]
  uses = "actions/action-builder/shell@master"
  runs = "echo"
  args = "Done!"
}

action "Publish" {
  needs = "Test"
  uses = "amir-arad/actions-yarn@master"
  args = "publish --access public"
  secrets = ["NPM_AUTH_TOKEN"]
}
