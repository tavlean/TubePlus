const test = require("node:test");
const assert = require("node:assert/strict");

const { buildDynamicRules } = require("../src/common/rules");

function regexes(rules) {
    return rules.map((r) => `${r.action.type}:${r.condition.regexFilter}`);
}

test("no rules when disabled or nothing selected", () => {
    assert.deepEqual(buildDynamicRules({ enabled: false, cleanMixes: true, cleanPlaylists: true }), []);
    assert.deepEqual(buildDynamicRules({ enabled: true, cleanMixes: false, cleanPlaylists: false }), []);
});

test("cleaning both uses a single redirect on any list", () => {
    const rules = buildDynamicRules({ enabled: true, cleanMixes: true, cleanPlaylists: true });
    assert.equal(rules.length, 1);
    assert.equal(rules[0].action.type, "redirect");
    assert.deepEqual(rules[0].action.redirect.transform.queryTransform.removeParams, [
        "list",
        "index",
        "pp",
        "start_radio"
    ]);
});

test("mixes-only redirects only RD/UL lists", () => {
    const rules = buildDynamicRules({ enabled: true, cleanMixes: true, cleanPlaylists: false });
    assert.equal(rules[0].action.type, "redirect");
});

test("playlists-only allows mixes (higher priority) and redirects the rest", () => {
    const rules = buildDynamicRules({ enabled: true, cleanMixes: false, cleanPlaylists: true });
    assert.equal(rules.length, 2);

    const allow = rules.find((r) => r.action.type === "allow");
    const redirect = rules.find((r) => r.action.type === "redirect");

    assert.ok(new RegExp(allow.condition.regexFilter, "i").test("/watch?v=a&list=RDa"));
    assert.ok(new RegExp(redirect.condition.regexFilter, "i").test("/watch?v=a&list=PL1"));
    assert.ok(allow.priority > redirect.priority, "allow must outrank redirect");
});

test("every rule excludes YouTube Music", () => {
    // requestDomains matches subdomains, so without this DNR would redirect
    // music.youtube.com album and station loads too.
    const settingsSets = [
        { enabled: true, cleanMixes: true, cleanPlaylists: true },
        { enabled: true, cleanMixes: true, cleanPlaylists: false },
        { enabled: true, cleanMixes: false, cleanPlaylists: true }
    ];

    for (const settings of settingsSets) {
        const rules = buildDynamicRules(settings);
        assert.ok(rules.length > 0);

        for (const rule of rules) {
            assert.deepEqual(rule.condition.excludedRequestDomains, ["music.youtube.com"]);
        }
    }
});

// The DNR regex and the content script must agree on every URL shape, or Chrome and
// Firefox behave differently on the same link. The case that bit us: `watch?list=PL…`
// with no video id - DNR used to strip it and leave a dead `/watch` page, while the
// content script correctly left it alone.
test("DNR rules match exactly the URLs the content script would clean", () => {
    const { cleanYouTubeWatchURL } = require("../src/common/url-cleaner");
    const settings = { enabled: true, cleanMixes: true, cleanPlaylists: true };
    const redirect = buildDynamicRules(settings)[0];
    const pattern = new RegExp(redirect.condition.regexFilter, "i");

    const paths = [
        "/watch?v=abc&list=RDabc",
        "/watch?v=abc&list=PL001",
        "/watch?list=RDabc&v=abc",
        "/watch?list=PL001&v=abc",
        "/watch?t=10&v=abc&list=RDabc",
        "/watch?v=abc&t=10&list=PL001",
        "/watch?v=abc&list=ULxyz&index=2",
        "/watch?list=PL001",
        "/watch?list=RDabc",
        "/watch?list=PL001&index=1",
        "/watch?v=abc",
        "/watch?v=abc&t=10",
        "/watch?v=abc&mylist=x",
        "/watch?v=&list=PL001"
    ];

    for (const path of paths) {
        const cleaned = cleanYouTubeWatchURL(`https://www.youtube.com${path}`, settings).changed;
        assert.equal(pattern.test(path), cleaned, `${path}: DNR and content script disagree`);
    }
});

test("mixes-only regex spares ordinary playlists and needs a video id", () => {
    const rules = buildDynamicRules({ enabled: true, cleanMixes: true, cleanPlaylists: false });
    const pattern = new RegExp(rules[0].condition.regexFilter, "i");

    assert.equal(pattern.test("/watch?v=a&list=RDabc"), true);
    assert.equal(pattern.test("/watch?v=a&list=ULabc"), true);
    assert.equal(pattern.test("/watch?v=a&list=PL001"), false);
    assert.equal(pattern.test("/watch?list=RDabc"), false, "no video id, must not fire");
});
