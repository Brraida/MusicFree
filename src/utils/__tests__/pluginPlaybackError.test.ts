import { describe, expect, it } from "@jest/globals";
import { getPluginPlaybackErrorKind } from "../pluginPlaybackError";

describe("plugin playback error guidance", () => {
    it.each([
        ["MF_PLUGIN_CONFIG_REQUIRED", "configuration"],
        ["MF_PLUGIN_AUTH_FAILED", "authentication"],
        ["MF_PLUGIN_NETWORK_ERROR", "network"],
        ["MF_PLUGIN_SERVER_ERROR", "server"],
        ["MF_PLUGIN_MEDIA_NOT_FOUND", "media"],
    ])("classifies the explicit %s error", (code, kind) => {
        const error = Object.assign(new Error("private backend message"), { code });
        expect(getPluginPlaybackErrorKind(error)).toBe(kind);
    });

    it.each([null, undefined, "Wrong username or password", new Error("Source error"), { code: 401 }, { code: "ECONNABORTED" }, { code: "toString" }])(
        "leaves unrelated failures unchanged: %p",
        error => expect(getPluginPlaybackErrorKind(error)).toBeNull(),
    );
});
