// A local stand-in for YouTube, served over HTTPS so a browser started with
// --host-resolver-rules can genuinely resolve www/m/music.youtube.com to it. That
// matters: the requests are real network requests on the youtube.com origin, so
// declarativeNetRequest rules and content-script matches behave exactly as they do
// in production. Nothing here talks to the internet.
//
// It is deliberately dumb. It serves a page that reports its own URL and does SPA
// navigation the way YouTube does: history.pushState, some DOM churn, then the
// navigation event for that surface (yt-navigate-finish on desktop,
// state-navigateend on the mobile app).

const https = require("node:https");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

// Links the fake app offers. Ids are shaped like the real thing: RD… is a mix/radio,
// PL… is an ordinary playlist, OLAK5uy_… is a YouTube Music album.
const LINKS = [
    { id: "mix", href: "/watch?v=VIDMIX&list=RDVIDMIX&start_radio=1" },
    { id: "playlist", href: "/watch?v=VIDPL&list=PL0001&index=2" },
    { id: "plain", href: "/watch?v=VIDPLAIN" },
    { id: "timestamped", href: "/watch?v=VIDTS&list=RDVIDTS&t=42" }
];

function appPage(host) {
    // The mobile web app fires state-navigateend on window; desktop fires
    // yt-navigate-finish on document. Neither fires the other.
    const dispatch =
        host === "m.youtube.com"
            ? "window.dispatchEvent(new CustomEvent('state-navigateend'));"
            : "document.dispatchEvent(new CustomEvent('yt-navigate-finish'));";

    const anchors = LINKS.map((l) => `<a id="${l.id}" href="${l.href}">${l.id}</a>`).join("\n");

    return `<!doctype html>
<html><head><meta charset="utf-8"><title>fake youtube</title></head>
<body>
<div id="here"></div>
${anchors}
<a id="downloads" href="/feed/downloads">downloads</a>
<a id="silent" href="/watch?v=VIDSILENT&list=RDVIDSILENT">silent</a>
<script>
function render() { document.getElementById('here').textContent = location.href; }
function spaGo(href, announce) {
    history.pushState({}, '', href);
    // YouTube rebuilds the page on every navigation; the URL watcher keys off this.
    var churn = document.createElement('div');
    churn.textContent = 'churn ' + Date.now();
    document.body.appendChild(churn);
    render();
    if (announce) { ${dispatch} }
}
Array.prototype.forEach.call(document.querySelectorAll('a'), function (a) {
    a.addEventListener('click', function (e) {
        e.preventDefault();
        // #silent fires no YouTube event at all. 1.5.0 broke because it trusted a
        // desktop-only event; nothing should depend on YouTube announcing itself.
        spaGo(a.getAttribute('href'), a.id !== 'silent');
    });
});
render();
</script>
</body></html>`;
}

// A watch page that re-adds mix context right after load, i.e. the worst case the
// loop guard exists for. Without the guard this reloads forever.
function reAddingPage() {
    return `<!doctype html>
<html><head><meta charset="utf-8"><title>fake youtube re-add</title></head>
<body>
<div id="here"></div>
<script>
function render() { document.getElementById('here').textContent = location.href; }
render();
setTimeout(function () {
    if (location.search.indexOf('list=') === -1) {
        history.pushState({}, '', location.pathname + location.search + '&list=RDLOOPV');
        var churn = document.createElement('div');
        churn.textContent = 'churn';
        document.body.appendChild(churn);
        render();
        document.dispatchEvent(new CustomEvent('yt-navigate-finish'));
    }
}, 150);
</script>
</body></html>`;
}

// The Downloads feed. Its entry carries mix context so that, if the cleaner did not
// treat Downloads specially, it would fire and force a reload.
function downloadsPage() {
    return `<!doctype html>
<html><head><meta charset="utf-8"><title>fake youtube downloads</title></head>
<body>
<div id="here"></div>
<a id="downloaded" href="/watch?v=VIDDL&list=RDVIDDL">downloaded video</a>
<script>
function render() { document.getElementById('here').textContent = location.href; }
document.getElementById('downloaded').addEventListener('click', function (e) {
    e.preventDefault();
    history.pushState({}, '', this.getAttribute('href'));
    var churn = document.createElement('div');
    churn.textContent = 'churn';
    document.body.appendChild(churn);
    render();
    document.dispatchEvent(new CustomEvent('yt-navigate-finish'));
});
render();
</script>
</body></html>`;
}

function makeCert() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tubeplus-cert-"));
    const key = path.join(dir, "key.pem");
    const cert = path.join(dir, "cert.pem");

    execFileSync(
        "openssl",
        [
            "req", "-x509", "-newkey", "rsa:2048", "-nodes",
            "-keyout", key, "-out", cert, "-days", "2",
            "-subj", "/CN=youtube.com",
            "-addext",
            "subjectAltName=DNS:youtube.com,DNS:www.youtube.com,DNS:m.youtube.com,DNS:music.youtube.com"
        ],
        { stdio: "ignore" }
    );

    return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

// Starts the stand-in and resolves with { port, requests, close }. `requests` records
// every main-document URL the browser actually asked for, which is how the tests tell
// a real reload from an in-page navigation.
function startFakeYouTube() {
    const { key, cert } = makeCert();
    const requests = [];

    const server = https.createServer({ key, cert }, (req, res) => {
        const host = (req.headers.host || "").split(":")[0];
        const url = new URL(req.url, `https://${host}`);
        requests.push(`https://${host}${req.url}`);

        let body;
        if (url.pathname === "/feed/downloads") {
            body = downloadsPage();
        } else if (url.searchParams.get("v") === "LOOPV") {
            body = reAddingPage();
        } else {
            body = appPage(host);
        }

        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(body);
    });

    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            resolve({
                port: server.address().port,
                requests,
                close: () => new Promise((done) => server.close(done))
            });
        });
    });
}

module.exports = { startFakeYouTube, LINKS };
