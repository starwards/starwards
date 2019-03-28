
    workflow "Build, Lint and Test" {
        on = "push"
        resolves = ["Lint_server", "Test_server","Lint_test-kit", "Test_test-kit","Lint_tsm", "Test_tsm"]
    }

    action "Install" {
        uses = "amir-arad/actions-yarn@master"
        args = "install"
    }
    
    action "Lint_server" {
        needs = "Install"
        uses = "amir-arad/actions-yarn@master"
        args = "workspace @starwards/server lint"
    }

    action "Test_server" {
        needs = "Install"
        uses = "amir-arad/actions-yarn@master"
        args = "workspace @starwards/server test"
    }
    
    action "Lint_test-kit" {
        needs = "Install"
        uses = "amir-arad/actions-yarn@master"
        args = "workspace @starwards/test-kit lint"
    }

    action "Test_test-kit" {
        needs = "Install"
        uses = "amir-arad/actions-yarn@master"
        args = "workspace @starwards/test-kit test"
    }
    
    action "Lint_tsm" {
        needs = "Install"
        uses = "amir-arad/actions-yarn@master"
        args = "workspace @starwards/tsm lint"
    }

    action "Test_tsm" {
        needs = "Install"
        uses = "amir-arad/actions-yarn@master"
        args = "workspace @starwards/tsm test"
    }
    
    