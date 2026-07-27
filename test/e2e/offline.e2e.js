// The pre-release gate: exercises the real built extension, in a real browser, on the
// real youtube.com origin, without touching the internet. The browser resolves
// youtube.com to a local stand-in (see fake-youtube.js), so declarativeNetRequest and
// content-script matching behave exactly as in production.
//
// It covers both ways a user reaches a Mix:
//   - opening a link in a new tab (a real navigation, cleaned by DNR on Chrome)
//   - clicking inside the app (an SPA navigation, cleaned by the content script)
// and it runs the whole thing twice: once against the Chrome build (DNR + content
// script) and once against the Firefox build, which has no background page at all and
// therefore exercises the content-script-only path Firefox actually uses.
//
// Run: npm run test:offline

const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { chromium, devices } = require("playwright");
const { startFakeYouTube } = require("./fake-youtube");
const { hasPlaylistContext, pollUntil, createReport } = require("./helpers");

const root = path.resolve(__dirname, "..", "..");
const DEFAULTS = { enabled: true, cleanMixes: true, cleanPlaylists: true };

// Chromium derives an unpacked extension's id from the absolute path: sha256 of the
// path, first 16 bytes, each nibble mapped onto a-p. Lets us address a build that has
// no service worker to ask.
function unpackedExtensionId(absolutePath) {
    const hash = crypto.createHash("sha256").update(absolutePath).digest();
    let id = "";
    for (let i = 0; i < 16; i += 1) {
        id += String.fromCharCode(97 + (hash[i] >> 4));
        id += String.fromCharCode(97 + (hash[i] & 0x0f));
    }
    return id;
}

async function launch({ extensionDir, port, mobile }) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "tubeplus-offline-"));
    const options = {
        headless: !process.env.E2E_HEADED,
        // Only the new headless shell loads extensions and starts their worker.
        channel: "chromium",
        ignoreHTTPSErrors: true,
        args: [
            `--disable-extensions-except=${extensionDir}`,
            `--load-extension=${extensionDir}`,
            `--host-resolver-rules=MAP *.youtube.com 127.0.0.1:${port},MAP youtube.com 127.0.0.1:${port}`,
            "--ignore-certificate-errors"
        ]
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
    const page = context.pages()[0] || (await context.newPage());
    await page.waitForTimeout(2500);
    return { context, page };
}

async function setSettings(context, extensionId, settings) {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.evaluate(
        (value) => new Promise((resolve) => chrome.storage.local.set(value, resolve)),
        settings
    );
    // Let the service worker (Chrome build) rebuild its DNR rules.
    await page.waitForTimeout(1200);
    await page.close();
}

// Navigates and waits for the URL to settle, so a DNR redirect or a location.replace
// has landed before we look.
async function settledURL(page, url) {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(1200);
    return page.url();
}

async function clickAndSettle(page, linkId, expectChange = true) {
    const before = page.url();
    await page.click(`#${linkId}`);
    if (!expectChange) {
        await page.waitForTimeout(1200);
        return page.url();
    }
    const settled = await pollUntil(() => {
        const url = page.url();
        return url !== before && !hasPlaylistContext(url) ? url : null;
    }, 8000);
    return settled || page.url();
}

async function runSuite(report, label, extensionDir, fake) {
    const port = fake.port;
    const extensionId = unpackedExtensionId(extensionDir);
    const { context, page } = await launch({ extensionDir, port });

    try {
        // Sanity: the id we computed must be the one the browser used, or every
        // settings change below would silently go nowhere.
        const worker = context.serviceWorkers()[0];
        if (worker) {
            const actual = new URL(worker.url()).host;
            report.check(`${label}: extension id resolved`, actual === extensionId, `${actual}`);
        }

        await setSettings(context, extensionId, DEFAULTS);

        // --- New tab / direct navigation (the DNR path on Chrome) ---
        const mix = await settledURL(page, "https://www.youtube.com/watch?v=VIDMIX&list=RDVIDMIX&start_radio=1");
        report.check(`${label}: direct load strips mix context`, mix === "https://www.youtube.com/watch?v=VIDMIX", mix);

        const plain = await settledURL(page, "https://www.youtube.com/watch?v=VIDPLAIN");
        report.check(
            `${label}: direct load leaves a plain video alone`,
            plain === "https://www.youtube.com/watch?v=VIDPLAIN",
            plain
        );

        const timestamped = await settledURL(page, "https://www.youtube.com/watch?v=VIDTS&list=RDVIDTS&t=42");
        report.check(
            `${label}: direct load keeps the t= timestamp`,
            timestamped === "https://www.youtube.com/watch?v=VIDTS&t=42",
            timestamped
        );

        const playlist = await settledURL(page, "https://www.youtube.com/watch?v=VIDPL&list=PL0001&index=2");
        report.check(
            `${label}: direct load strips playlist context`,
            playlist === "https://www.youtube.com/watch?v=VIDPL",
            playlist
        );

        // --- In-app SPA navigation (the content-script path, both browsers) ---
        await settledURL(page, "https://www.youtube.com/watch?v=VIDPLAIN");
        const spaMix = await clickAndSettle(page, "mix");
        report.check(`${label}: SPA click strips mix context`, spaMix === "https://www.youtube.com/watch?v=VIDMIX", spaMix);

        await settledURL(page, "https://www.youtube.com/watch?v=VIDPLAIN");
        const spaPlaylist = await clickAndSettle(page, "playlist");
        report.check(
            `${label}: SPA click strips playlist context`,
            spaPlaylist === "https://www.youtube.com/watch?v=VIDPL",
            spaPlaylist
        );

        await settledURL(page, "https://www.youtube.com/watch?v=VIDMIX");
        const spaPlain = await clickAndSettle(page, "plain", false);
        report.check(
            `${label}: SPA click on a plain video is left alone`,
            spaPlain === "https://www.youtube.com/watch?v=VIDPLAIN",
            spaPlain
        );

        // --- YouTube Music must be untouched ---
        const musicDirect = await settledURL(page, "https://music.youtube.com/watch?v=VIDMIX&list=RDVIDMIX");
        report.check(
            `${label}: YouTube Music keeps its queue on direct load`,
            musicDirect === "https://music.youtube.com/watch?v=VIDMIX&list=RDVIDMIX",
            musicDirect
        );

        const musicSpa = await clickAndSettle(page, "mix", false);
        report.check(
            `${label}: YouTube Music keeps its queue on SPA click`,
            hasPlaylistContext(musicSpa),
            musicSpa
        );

        // --- Settings matrix ---
        await setSettings(context, extensionId, { enabled: true, cleanMixes: true, cleanPlaylists: false });
        const mixesOnlyMix = await settledURL(page, "https://www.youtube.com/watch?v=VIDMIX&list=RDVIDMIX");
        report.check(
            `${label}: mixes-only still strips a mix`,
            mixesOnlyMix === "https://www.youtube.com/watch?v=VIDMIX",
            mixesOnlyMix
        );
        const mixesOnlyPl = await settledURL(page, "https://www.youtube.com/watch?v=VIDPL&list=PL0001");
        report.check(
            `${label}: mixes-only spares a playlist`,
            mixesOnlyPl === "https://www.youtube.com/watch?v=VIDPL&list=PL0001",
            mixesOnlyPl
        );

        await setSettings(context, extensionId, { enabled: true, cleanMixes: false, cleanPlaylists: true });
        const plOnlyMix = await settledURL(page, "https://www.youtube.com/watch?v=VIDMIX&list=RDVIDMIX");
        report.check(
            `${label}: playlists-only spares a mix`,
            plOnlyMix === "https://www.youtube.com/watch?v=VIDMIX&list=RDVIDMIX",
            plOnlyMix
        );
        const plOnlyPl = await settledURL(page, "https://www.youtube.com/watch?v=VIDPL&list=PL0001");
        report.check(
            `${label}: playlists-only strips a playlist`,
            plOnlyPl === "https://www.youtube.com/watch?v=VIDPL",
            plOnlyPl
        );

        await setSettings(context, extensionId, { enabled: false, cleanMixes: true, cleanPlaylists: true });
        const off = await settledURL(page, "https://www.youtube.com/watch?v=VIDMIX&list=RDVIDMIX");
        report.check(
            `${label}: disabled cleans nothing`,
            off === "https://www.youtube.com/watch?v=VIDMIX&list=RDVIDMIX",
            off
        );

        await setSettings(context, extensionId, DEFAULTS);

        // --- A playlist link with no video id must be left intact ---
        // Stripping its list leaves a bare /watch, which YouTube serves as a dead page.
        const bareList = await settledURL(page, "https://www.youtube.com/watch?list=PL001");
        report.check(
            `${label}: a list-only link is not broken`,
            bareList === "https://www.youtube.com/watch?list=PL001",
            bareList
        );

        // --- Cleaning the same video repeatedly must keep working ---
        // The loop guard counts attempts per tab; if one navigation burned several
        // slots, a legitimate repeat visit would silently stop being cleaned.
        let repeatsClean = true;
        let lastRepeat = "";
        for (let attempt = 0; attempt < 3; attempt += 1) {
            lastRepeat = await settledURL(page, "https://www.youtube.com/watch?v=VIDMIX&list=RDVIDMIX");
            if (lastRepeat !== "https://www.youtube.com/watch?v=VIDMIX") {
                repeatsClean = false;
            }
        }
        report.check(
            `${label}: the same mix is still cleaned on a rapid third visit`,
            repeatsClean,
            lastRepeat
        );

        // --- A navigation YouTube does not announce must still be cleaned ---
        // The 1.5.0 disaster was trusting a desktop-only event. #silent fires none.
        await settledURL(page, "https://www.youtube.com/watch?v=VIDPLAIN");
        const silent = await clickAndSettle(page, "silent");
        report.check(
            `${label}: unannounced SPA navigation is still cleaned`,
            silent === "https://www.youtube.com/watch?v=VIDSILENT",
            silent
        );

        // --- Downloads must not be forced through a reload ---
        // Control first: the very same URL reached normally MUST be cleaned, otherwise
        // the check below would pass even if cleaning were broken outright.
        const downloadControl = await settledURL(page, "https://www.youtube.com/watch?v=VIDDL&list=RDVIDDL");
        report.check(
            `${label}: control - the Downloads URL is cleaned when reached normally`,
            downloadControl === "https://www.youtube.com/watch?v=VIDDL",
            downloadControl
        );

        await settledURL(page, "https://www.youtube.com/feed/downloads");
        await page.click("#downloaded");
        await page.waitForTimeout(2000);
        const downloaded = page.url();
        report.check(
            `${label}: the same video opened from Downloads is left alone`,
            downloaded === "https://www.youtube.com/watch?v=VIDDL&list=RDVIDDL",
            downloaded
        );

        // --- Loop guard: a page that re-adds mix context must not reload forever ---
        // Counted at the server, because each reload is a fresh document and nothing
        // in the page survives to count itself.
        const before = fake.requests.filter((url) => url.includes("v=LOOPV")).length;
        await settledURL(page, "https://www.youtube.com/watch?v=LOOPV");
        await page.waitForTimeout(6000);
        const loads = fake.requests.filter((url) => url.includes("v=LOOPV")).length - before;
        report.check(
            `${label}: a page that re-adds mix context stops reloading`,
            loads > 0 && loads <= 4,
            `${loads} document load(s)`
        );
    } finally {
        await context.close();
    }
}

async function runMobile(report, label, extensionDir, port) {
    const extensionId = unpackedExtensionId(extensionDir);
    const { context, page } = await launch({ extensionDir, port, mobile: true });

    try {
        await setSettings(context, extensionId, DEFAULTS);

        const direct = await settledURL(page, "https://m.youtube.com/watch?v=VIDMIX&list=RDVIDMIX&start_radio=1");
        report.check(`${label}: mobile direct load strips mix context`, direct === "https://m.youtube.com/watch?v=VIDMIX", direct);

        await settledURL(page, "https://m.youtube.com/watch?v=VIDPLAIN");
        const spa = await clickAndSettle(page, "mix");
        report.check(
            `${label}: mobile SPA tap strips mix context`,
            spa === "https://m.youtube.com/watch?v=VIDMIX",
            spa
        );
    } finally {
        await context.close();
    }
}

async function main() {
    execFileSync("node", [path.join(root, "scripts", "build.js"), "dev"], { stdio: "ignore" });

    const fake = await startFakeYouTube();
    const report = createReport("offline e2e");

    try {
        // Chrome build: DNR strips before the request, content script covers SPA.
        await runSuite(report, "chrome", path.join(root, "dist", "chrome-dev"), fake);
        await runMobile(report, "chrome mobile", path.join(root, "dist", "chrome-dev"), fake.port);

        // Firefox build: no background page at all, so this is the content-script-only
        // path Firefox actually runs. Loading it in Chromium cannot prove Firefox's
        // sandbox behaviour, but it does prove the logic works without DNR.
        await runSuite(report, "firefox-build (no DNR)", path.join(root, "dist", "firefox-dev"), fake);
        await runMobile(report, "firefox-build mobile", path.join(root, "dist", "firefox-dev"), fake.port);
    } finally {
        report.finish();
        await fake.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
