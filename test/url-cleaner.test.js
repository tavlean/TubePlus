const test = require("node:test");
const assert = require("node:assert/strict");

const { cleanYouTubeWatchURL, isYouTubeWatchURL } = require("../src/common/url-cleaner");

test("detects YouTube watch URLs", () => {
    assert.equal(isYouTubeWatchURL(new URL("https://www.youtube.com/watch?v=abc123")), true);
    assert.equal(isYouTubeWatchURL(new URL("https://m.youtube.com/watch?v=abc123")), true);
    assert.equal(isYouTubeWatchURL(new URL("https://www.youtube.com/shorts/abc123")), false);
    assert.equal(isYouTubeWatchURL(new URL("https://example.com/watch?v=abc123")), false);
});

test("removes playlist context while preserving useful watch params", () => {
    const result = cleanYouTubeWatchURL(
        "https://www.youtube.com/watch?v=abc123&list=RDabc123&index=4&t=83s&feature=share"
    );

    assert.equal(result.changed, true);
    assert.equal(result.url, "https://www.youtube.com/watch?v=abc123&t=83s&feature=share");
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
