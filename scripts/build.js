const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const targets = {
    chrome: {
        manifest: path.join(root, "src", "chrome", "manifest.json"),
        exclude: []
    },
    firefox: {
        // Firefox has no declarativeNetRequest path and its manifest declares no
        // background page, so these two are dead weight in the package. Shipping them
        // also makes web-ext lint report a DNR API the build cannot use, which is a
        // question an AMO reviewer does not need to ask.
        manifest: path.join(root, "src", "firefox", "manifest.json"),
        exclude: ["background.js", "rules.js"]
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

    for (const file of target.exclude) {
        fs.rmSync(path.join(outputDir, file), { force: true });
    }

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
