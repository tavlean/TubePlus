const test = require("node:test");
const assert = require("node:assert/strict");

const {
    cleanYouTubeWatchURL,
    isYouTubeWatchURL,
    isMixOrRadioList,
    normalizeSettings
} = require("../src/common/url-cleaner");

test("detects YouTube watch URLs", () => {
    assert.equal(isYouTubeWatchURL(new URL("https://www.youtube.com/watch?v=abc123")), true);
    assert.equal(isYouTubeWatchURL(new URL("https://m.youtube.com/watch?v=abc123")), true);
    assert.equal(isYouTubeWatchURL(new URL("https://www.youtube.com/shorts/abc123")), false);
    assert.equal(isYouTubeWatchURL(new URL("https://example.com/watch?v=abc123")), false);
});

test("identifies mix/radio list ids", () => {
    assert.equal(isMixOrRadioList("RDabc123"), true);
    assert.equal(isMixOrRadioList("ULxyz"), true);
    assert.equal(isMixOrRadioList("PLabc123"), false);
});

test("removes playlist context while preserving useful watch params", () => {
    const result = cleanYouTubeWatchURL(
        "https://www.youtube.com/watch?v=abc123&list=RDabc123&index=4&t=83s&feature=share"
    );

    assert.equal(result.changed, true);
    assert.equal(result.url, "https://www.youtube.com/watch?v=abc123&t=83s&feature=share");
});

test("cleanMixes / cleanPlaylists control which lists are stripped", () => {
    const mixesOnly = { cleanMixes: true, cleanPlaylists: false };
    const playlistsOnly = { cleanMixes: false, cleanPlaylists: true };

    const mix = "https://www.youtube.com/watch?v=abc123&list=RDabc123";
    const playlist = "https://www.youtube.com/watch?v=abc123&list=PL123";

    assert.equal(cleanYouTubeWatchURL(mix, mixesOnly).changed, true);
    assert.equal(cleanYouTubeWatchURL(playlist, mixesOnly).changed, false);

    assert.equal(cleanYouTubeWatchURL(mix, playlistsOnly).changed, false);
    assert.equal(cleanYouTubeWatchURL(playlist, playlistsOnly).changed, true);
});

test("does nothing when disabled or when both options are off", () => {
    const url = "https://www.youtube.com/watch?v=abc123&list=RDabc123";

    assert.equal(cleanYouTubeWatchURL(url, { enabled: false }).changed, false);
    assert.equal(cleanYouTubeWatchURL(url, { cleanMixes: false, cleanPlaylists: false }).changed, false);
});

test("removes radio and share noise params", () => {
    const result = cleanYouTubeWatchURL(
        "https://www.youtube.com/watch?v=abc123&start_radio=1&pp=ygUEMWFiYw%3D%3D"
    );

    assert.equal(result.changed, true);
    assert.equal(result.url, "https://www.youtube.com/watch?v=abc123");
});

test("leaves direct watch URLs unchanged", () => {
    const result = cleanYouTubeWatchURL("https://www.youtube.com/watch?v=abc123&t=83s");

    assert.equal(result.changed, false);
    assert.equal(result.url, "https://www.youtube.com/watch?v=abc123&t=83s");
});

test("ignores watch URLs without a video id", () => {
    const result = cleanYouTubeWatchURL("https://www.youtube.com/watch?list=RDabc123");

    assert.equal(result.changed, false);
    assert.equal(result.url, "https://www.youtube.com/watch?list=RDabc123");
});

test("normalizeSettings migrates the legacy mode field", () => {
    assert.deepEqual(normalizeSettings({ mode: "mixes" }), {
        enabled: true,
        cleanMixes: true,
        cleanPlaylists: false
    });
    assert.deepEqual(normalizeSettings({ mode: "all" }), {
        enabled: true,
        cleanMixes: true,
        cleanPlaylists: true
    });
    assert.deepEqual(normalizeSettings(undefined), {
        enabled: true,
        cleanMixes: true,
        cleanPlaylists: true
    });
});
