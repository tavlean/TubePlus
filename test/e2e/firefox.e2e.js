// Live end-to-end test on real Firefox: builds the Firefox package, installs it
// as a temporary add-on via Selenium/geckodriver, and verifies cleaning against
// real YouTube. Headless by default; set E2E_HEADED=1 to watch, E2E_HOLD_MS to
// keep the browser open after the checks (useful for eyeballing the result).

const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { Builder } = require("selenium-webdriver");
const firefox = require("selenium-webdriver/firefox");
const { MIX_URL, CLEAN_URL, hasPlaylistContext, pollUntil, clickMixLink, createReport } = require("./helpers");

const root = path.resolve(__dirname, "..", "..");

async function main() {
    execFileSync("node", [path.join(root, "scripts", "build.js"), "build", "firefox"], { stdio: "ignore" });

    // geckodriver comes from devDependencies; Selenium finds it on PATH.
    process.env.PATH = `${path.join(root, "node_modules", ".bin")}${path.delimiter}${process.env.PATH}`;

    const options = new firefox.Options();
    // Temporary MV3 add-ons are still subject to Firefox's opt-in host
    // permissions; grant them up front so the suite tests TubePlus, not the
    // permission prompt (that flow is covered manually via the popup card).
    options.setPreference("extensions.originControls.grantByDefault", true);
    if (!process.env.E2E_HEADED) {
        options.addArguments("-headless");
    }

    const driver = await new Builder().forBrowser("firefox").setFirefoxOptions(options).build();
    const report = createReport("firefox e2e");

    try {
        await driver.installAddon(path.join(root, "dist", "tubeplus-firefox.zip"), true);

        // Direct load of a Mix URL: the content script must clean it.
        await driver.get(MIX_URL);
        const directUrl = await pollUntil(async () => {
            const url = await driver.getCurrentUrl();
            return hasPlaylistContext(url) ? null : url;
        }, 12000);
        report.check("direct load cleans Mix URL", directUrl === CLEAN_URL, directUrl || (await driver.getCurrentUrl()));

        // In-app SPA click: navigate a clean watch page, click a Mix link.
        await driver.get(CLEAN_URL);
        await driver.sleep(5000);
        const clickedHref = await driver.executeScript(clickMixLink);
        if (!clickedHref) {
            report.skip("SPA click cleans Mix URL", "no Mix link found on the watch page");
        } else {
            const spaUrl = await pollUntil(async () => {
                const url = await driver.getCurrentUrl();
                return url !== CLEAN_URL && !hasPlaylistContext(url) ? url : null;
            }, 12000);
            report.check("SPA click cleans Mix URL", Boolean(spaUrl), spaUrl || (await driver.getCurrentUrl()));
        }

        if (process.env.E2E_HOLD_MS) {
            await driver.sleep(Number(process.env.E2E_HOLD_MS));
        }
    } finally {
        report.finish();
        await driver.quit();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
