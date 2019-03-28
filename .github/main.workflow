workflow "Build, Test, and Publish" {
  on = "push"
  resolves = ["Test"]
}

action "Build" {
  uses = "amir-arad/actions-yarn@master"
  args = "install"
}

action "Test" {
  needs = "Build"
  uses = "amir-arad/actions-yarn@master"
  args = "test"
}

action "Publish" {
  needs = "Test"
  uses = "amir-arad/actions-yarn@master"
  args = "publish --access public"
  secrets = ["NPM_AUTH_TOKEN"]
}
