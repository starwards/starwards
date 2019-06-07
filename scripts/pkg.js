const path = require("path");
const fs = require("fs");
const util = require("util");
const ncp = util.promisify(require("ncp").ncp);
const rimraf = util.promisify(require("rimraf"));
const { exec } = require("pkg");
const mkdir = util.promisify(fs.mkdir);

const rootPath = path.resolve(__dirname, "..");
const distPath = path.join(rootPath, "dist");
const staticDistPath = path.join(distPath, "static");
const codeDistPath = path.join(distPath, "code");

(async () => {
  try {
    await rimraf(distPath);
    await mkdir(distPath);
    await mkdir(staticDistPath);
    await mkdir(codeDistPath);
    await ncp(path.join(rootPath, "static"), staticDistPath);
    await ncp(
      path.join(rootPath, "modules", "browser", "dist"),
      staticDistPath
    );
    await ncp(path.join(rootPath, "modules", "server", "cjs"), codeDistPath);
    await util.promisify(fs.writeFile)(
      path.join(distPath, "package.json"),
      JSON.stringify(
        {
          name: "starwards",
          bin: "code/prod.js",
          pkg: {
            assets: "static/**/*",
            targets: ["node10-win-x64", "node10-linux-x64", "node10-osx-x64"]
          }
        },
        null,
        2
      )
    );
    await exec([distPath, "--out-path", distPath]);
    console.log("done!");
  } catch (e) {
    console.error(e);
  }
})();
