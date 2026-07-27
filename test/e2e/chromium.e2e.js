// Live end-to-end test on Chromium (the engine behind Chrome, Edge, Kiwi and
// friends): builds the Chrome dev folder, loads it unpacked, and verifies
// cleaning against real YouTube - desktop, emulated Android mobile (which gets
// the different m.youtube.com app), and the popup. Headless by default; set
// E2E_HEADED=1 to watch.

const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { chromium, devices } = require("playwright");
const { MIX_URL, CLEAN_URL, hasPlaylistContext, pollUntil, clickMixLink, createReport } = require("./helpers");

const root = path.resolve(__dirname, "..", "..");
const extensionDir = path.join(root, "dist", "chrome-dev");

async function launch(mobile) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "tubeplus-e2e-"));
    const options = {
        headless: !process.env.E2E_HEADED,
        args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`]
    };

    if (mobile) {
        const device = devices["Pixel 7"];
        Object.assign(options, {
            userAgent: device.userAgent,
            viewport: device.viewport,
            deviceScaleFactor: device.deviceScaleFactor,
            isMobile: true,
            hasTouch: true
        });
    }

    const context = await chromium.launchPersistentContext(profile, options);
    // Give the service worker a moment to install the DNR rules.
    await context.pages()[0].waitForTimeout(2500);
    return context;
}

async function pageUrlCleaned(page, previousUrl) {
    return pollUntil(() => {
        const url = page.url();
        return url !== previousUrl && !hasPlaylistContext(url) ? url : null;
    }, 12000);
}

async function testSurface(report, label, mobile) {
    const context = await launch(mobile);
    const page = context.pages()[0];

    // Direct load: the DNR redirect must clean before the page loads.
    await page.goto(MIX_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
    const directUrl = await pageUrlCleaned(page, MIX_URL);
    report.check(`${label}: direct load cleans Mix URL`, Boolean(directUrl), directUrl || page.url());

    // In-app SPA click: must be caught by the content script.
    await page.goto(CLEAN_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(5000);
    const startUrl = page.url();
    const clickedHref = await page.evaluate(clickMixLink);
    if (!clickedHref) {
        report.skip(`${label}: SPA click cleans Mix URL`, "no Mix link found on the watch page");
    } else {
        const spaUrl = await pageUrlCleaned(page, startUrl);
        report.check(`${label}: SPA click cleans Mix URL`, Boolean(spaUrl), spaUrl || page.url());
    }

    // Popup sanity (desktop only): loads without errors, access card hidden
    // because Chromium grants host permissions at install.
    if (!mobile) {
        const worker = context.serviceWorkers()[0];
        if (worker) {
            const extensionId = new URL(worker.url()).host;
            const popup = await context.newPage();
            const errors = [];
            popup.on("pageerror", (error) => errors.push(String(error)));
            await popup.goto(`chrome-extension://${extensionId}/popup.html`);
            await popup.waitForTimeout(500);
            const state = await popup.evaluate(() => ({
                accessCardHidden: document.getElementById("accessCard").hidden,
                statusText: document.getElementById("statusText").textContent
            }));
            report.check(`${label}: popup loads with access card hidden`,
                errors.length === 0 && state.accessCardHidden,
                errors[0] || state.statusText);
        } else {
            report.skip(`${label}: popup loads with access card hidden`, "no service worker found");
        }
    }

    await context.close();
}

async function main() {
    execFileSync("node", [path.join(root, "scripts", "build.js"), "dev", "chrome"], { stdio: "ignore" });

    const report = createReport("chromium e2e");
    await testSurface(report, "desktop", false);
    await testSurface(report, "mobile (m.youtube.com)", true);
    report.finish();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
