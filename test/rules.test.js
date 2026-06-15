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
    assert.deepEqual(regexes(rules), ["redirect:/watch\\?(.*&)?list="]);
    assert.deepEqual(rules[0].action.redirect.transform.queryTransform.removeParams, [
        "list",
        "index",
        "pp",
        "start_radio"
    ]);
});

test("mixes-only redirects only RD/UL lists", () => {
    const rules = buildDynamicRules({ enabled: true, cleanMixes: true, cleanPlaylists: false });
    assert.deepEqual(regexes(rules), ["redirect:/watch\\?(.*&)?list=(RD|UL)"]);
});

test("playlists-only allows mixes (higher priority) and redirects the rest", () => {
    const rules = buildDynamicRules({ enabled: true, cleanMixes: false, cleanPlaylists: true });
    assert.equal(rules.length, 2);

    const allow = rules.find((r) => r.action.type === "allow");
    const redirect = rules.find((r) => r.action.type === "redirect");

    assert.equal(allow.condition.regexFilter, "/watch\\?(.*&)?list=(RD|UL)");
    assert.equal(redirect.condition.regexFilter, "/watch\\?(.*&)?list=");
    assert.ok(allow.priority > redirect.priority, "allow must outrank redirect");
});
