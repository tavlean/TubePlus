// Offline smoke test of the built extension in real Chromium. Unlike chromium.e2e.js
// this never touches youtube.com, so it runs anywhere and is fast enough to be the
// gate before every upload.
//
// It exists because of the 1.5.1 incident: the popup's "can't see YouTube pages" card
// carried a `hidden` attribute that `.card { display: grid }` silently overrode, so
// every user saw it. The old assertion checked the `hidden` PROPERTY and passed.
// Assert computed visibility, never the attribute.
//
// Needs Chromium with extension support: `npx playwright install chromium`.

const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { createReport } = require("./helpers");

const root = path.resolve(__dirname, "..", "..");
const extensionDir = path.join(root, "dist", "chrome-dev");

async function main() {
    execFileSync("node", [path.join(root, "scripts", "build.js"), "dev", "chrome"], { stdio: "ignore" });

    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "tubeplus-smoke-"));
    const context = await chromium.launchPersistentContext(profile, {
        headless: !process.env.E2E_HEADED,
        // The new headless shell is the one that loads extensions and starts their
        // service worker; the bundled default headless never registers one.
        channel: "chromium",
        args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`]
    });

    const report = createReport("chrome offline smoke");

    try {
        const page = context.pages()[0] || (await context.newPage());
        await page.waitForTimeout(3000);

        let worker = context.serviceWorkers()[0];
        for (let attempt = 0; !worker && attempt < 20; attempt += 1) {
            await page.waitForTimeout(1000);
            worker = context.serviceWorkers()[0];
        }

        if (!worker) {
            throw new Error("extension service worker never appeared");
        }

        const extensionId = new URL(worker.url()).host;
        await page.waitForTimeout(1500);

        // Re-applying the registered rules surfaces any schema rejection as a throw.
        // A rejected rule set means Chrome cleans nothing at all, silently.
        const dnr = await worker.evaluate(async () => {
            const existing = await chrome.declarativeNetRequest.getDynamicRules();
            let error = null;

            try {
                await chrome.declarativeNetRequest.updateDynamicRules({
                    removeRuleIds: existing.map((rule) => rule.id),
                    addRules: existing
                });
            } catch (thrown) {
                error = String(thrown);
            }

            return { rules: await chrome.declarativeNetRequest.getDynamicRules(), error };
        });

        report.check("DNR registered rules", dnr.rules.length > 0, `${dnr.rules.length} rule(s)`);
        report.check("DNR accepted the rule set", dnr.error === null, dnr.error || "no error");
        report.check(
            "every rule excludes music.youtube.com",
            dnr.rules.length > 0 &&
                dnr.rules.every((rule) =>
                    (rule.condition.excludedRequestDomains || []).includes("music.youtube.com")
                ),
            JSON.stringify(dnr.rules.map((rule) => rule.condition.excludedRequestDomains))
        );

        const popupPage = await context.newPage();
        await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
        await popupPage.waitForTimeout(800);

        const popup = await popupPage.evaluate(() => {
            // Computed style, not the attribute: this is the 1.5.1 trap.
            const probe = document.createElement("div");
            probe.className = "card";
            probe.hidden = true;
            document.querySelector("main.popup").appendChild(probe);
            const probeDisplay = getComputedStyle(probe).display;
            probe.remove();

            return {
                text: document.body.innerText,
                probeDisplay,
                status: document.getElementById("statusText").textContent
            };
        });

        report.check("popup shows no missing-access warning", !/can't see YouTube/i.test(popup.text));
        report.check("hidden elements inside a card are hidden", popup.probeDisplay === "none", popup.probeDisplay);
        report.check(
            "popup reports the default working status",
            popup.status === "Cleaning mixes & playlists",
            popup.status
        );
    } finally {
        report.finish();
        await context.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
