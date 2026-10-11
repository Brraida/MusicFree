import { describe, expect, it } from "@jest/globals";
import { normalizePlayerMetadata } from "../playerMetadata";

describe("native player artwork metadata", () => {
    const fallback = 42;

    it.each(["", " \t\n", null, undefined, {}, { uri: "" }, { uri: "  " }, 0, -1, NaN])(
        "uses the bundled cover for invalid artwork %p",
        artwork => {
            const metadata = { artwork, title: "track", duration: 30 };
            expect(normalizePlayerMetadata(metadata, fallback)).toEqual({
                ...metadata, artwork: fallback,
            });
            expect(metadata.artwork).toBe(artwork);
        },
    );

    it.each(["https://example.test/cover.jpg", "file:///sdcard/cover.jpg", "content://media/cover/1"])(
        "preserves a valid cover URI %s",
        artwork => expect(normalizePlayerMetadata({ artwork }, fallback).artwork).toBe(artwork),
    );

    it("preserves bundled assets and trims URI objects without dropping headers", () => {
        expect(normalizePlayerMetadata({ artwork: 17 }, fallback).artwork).toBe(17);
        expect(normalizePlayerMetadata({ artwork: { uri: " https://example.test/cover.jpg ", headers: { token: "test" } } }, fallback).artwork)
            .toEqual({ uri: "https://example.test/cover.jpg", headers: { token: "test" } });
    });

    it("repairs a plugin supplemental-info merge that overwrites a valid cover with an empty string", () => {
        const track = { artwork: "https://example.test/original.jpg", title: "track", url: "file:///test.wav" };
        const supplementalInfo = { artwork: "", album: "album" };
        const merged = { ...track, ...supplementalInfo };
        expect(normalizePlayerMetadata(merged, fallback)).toEqual({
            ...merged, artwork: fallback,
        });
        expect(track.artwork).toBe("https://example.test/original.jpg");
    });
});
