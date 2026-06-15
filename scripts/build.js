const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const targets = {
    chrome: {
        manifest: path.join(root, "src", "chrome", "manifest.json")
    },
    firefox: {
        manifest: path.join(root, "src", "firefox", "manifest.json")
    }
};

function copyDirectory(source, destination) {
    fs.mkdirSync(destination, { recursive: true });
    fs.cpSync(source, destination, { recursive: true });
}

function prepareTarget(browser, mode) {
    const target = targets[browser];

    if (!target) {
        throw new Error(`Unknown browser target: ${browser}`);
    }

    const outputDir = path.join(dist, `${browser}-${mode}`);
    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.mkdirSync(outputDir, { recursive: true });

    copyDirectory(path.join(root, "shared-assets"), path.join(outputDir, "assets"));
    copyDirectory(path.join(root, "src", "common"), outputDir);
    fs.copyFileSync(target.manifest, path.join(outputDir, "manifest.json"));

    return outputDir;
}

function packageTarget(browser) {
    const outputDir = prepareTarget(browser, "build");
    const zipPath = path.join(dist, `tubeplus-${browser}.zip`);

    fs.rmSync(zipPath, { force: true });
    execFileSync("zip", ["-r", zipPath, "."], {
        cwd: outputDir,
        stdio: "inherit"
    });
}

function run() {
    const [, , command, requestedBrowser] = process.argv;
    const browsers = requestedBrowser ? [requestedBrowser] : Object.keys(targets);

    if (command !== "dev" && command !== "build") {
        throw new Error("Usage: node scripts/build.js <dev|build> [chrome|firefox]");
    }

    for (const browser of browsers) {
        if (command === "dev") {
            prepareTarget(browser, "dev");
        } else {
            packageTarget(browser);
        }
    }
}

run();
