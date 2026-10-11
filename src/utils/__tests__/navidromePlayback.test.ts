import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { URL } from "node:url";

function loadPlugin(response: unknown, variables: Record<string, string> = {
    serverUrl: "https://music.example.test", username: "test", password: "test-only",
}) {
    const get = jest.fn<() => Promise<unknown>>().mockResolvedValue(response);
    const context = {
        module: { exports: {} as any },
        require: (name: string) => name === "axios" ? { get } : require("crypto-js"),
        env: { getUserVariables: () => variables }, URL, console: { warn: jest.fn() },
    };
    const file = path.resolve(__dirname, "../../../plugins/private-navidrome.js");
    vm.runInNewContext(fs.readFileSync(file, "utf8"), context);
    return { plugin: context.module.exports, get };
}

describe("Navidrome validates responses before passing a stream to the player", () => {
    it("reports a missing configuration without a network request", async () => {
        const { plugin, get } = loadPlugin({}, {});
        await expect(plugin.getMediaSource({ id: "song" }, "standard"))
            .rejects.toMatchObject({ code: "MF_PLUGIN_CONFIG_REQUIRED" });
        expect(get).not.toHaveBeenCalled();
    });

    it("reports wrong credentials from an HTTP 200 Subsonic error body", async () => {
        const { plugin, get } = loadPlugin({ data: { "subsonic-response": {
            status: "failed", error: { code: 40, message: "Wrong username or password" },
        } } });
        await expect(plugin.getMediaSource({ id: "song" }, "standard"))
            .rejects.toMatchObject({ code: "MF_PLUGIN_AUTH_FAILED" });
        expect(get).toHaveBeenCalledTimes(1);
    });

    it("reports a deleted song before requesting audio", async () => {
        const { plugin } = loadPlugin({ data: { "subsonic-response": {
            status: "failed", error: { code: 70, message: "Not found" },
        } } });
        await expect(plugin.getMediaSource({ id: "missing" }, "standard"))
            .rejects.toMatchObject({ code: "MF_PLUGIN_MEDIA_NOT_FOUND" });
    });

    it("reports an HTML page or unexpected server response", async () => {
        const { plugin } = loadPlugin({ data: "<html>login</html>" });
        await expect(plugin.getMediaSource({ id: "song" }, "standard"))
            .rejects.toMatchObject({ code: "MF_PLUGIN_SERVER_ERROR" });
    });

    it("reports network failures with a safe structured code", async () => {
        const { plugin, get } = loadPlugin({});
        get.mockRejectedValue(Object.assign(new Error("network details"), { code: "ECONNABORTED" }));
        await expect(plugin.getMediaSource({ id: "song" }, "standard"))
            .rejects.toMatchObject({ code: "MF_PLUGIN_NETWORK_ERROR" });
    });

    it("keeps lossless-to-MP3 playback options after validation succeeds", async () => {
        const { plugin, get } = loadPlugin({ data: { "subsonic-response": {
            status: "ok", song: { id: "song" },
        } } });
        const source = await plugin.getMediaSource({ id: "song", suffix: "flac" }, "standard");
        const url = new URL(source.url);
        expect(url.pathname).toBe("/rest/stream.view");
        expect(url.searchParams.get("format")).toBe("mp3");
        expect(url.searchParams.get("maxBitRate")).toBe("192");
        expect(url.searchParams.get("estimateContentLength")).toBe("true");
        expect(get).toHaveBeenCalledTimes(1);
    });
});


describe("Navidrome draft configuration checks", () => {
    const draft = { serverUrl: "https://draft.example.test/", username: "draft-user", password: "draft-test-only" };
    it("uses the entered draft for a lightweight ping without reading stored credentials", async () => {
        const { plugin, get } = loadPlugin({ data: { "subsonic-response": { status: "ok" } } });
        await expect(plugin.validateUserVariables(draft)).resolves.toBeUndefined();
        expect(get).toHaveBeenCalledTimes(1);
        expect(get).toHaveBeenCalledWith("https://draft.example.test/rest/ping.view", expect.objectContaining({
            timeout: 10000, params: expect.objectContaining({ u: "draft-user", f: "json" }),
        }));
        const options = (get.mock.calls[0] as any)[1];
        const crypto = require("crypto-js");
        expect(options.params.t).toBe(crypto.MD5(draft.password + options.params.s).toString(crypto.enc.Hex));
        expect(draft.serverUrl).toBe("https://draft.example.test/");
    });
    it("does not silently use stored credentials when the entered draft is incomplete", async () => {
        const { plugin, get } = loadPlugin({});
        await expect(plugin.validateUserVariables({})).rejects.toMatchObject({ code: "MF_PLUGIN_CONFIG_REQUIRED" });
        expect(get).not.toHaveBeenCalled();
    });
    it("rejects a wrong password even if HTTP status is 200", async () => {
        const { plugin } = loadPlugin({ data: { "subsonic-response": { status: "failed", error: { code: 40 } } } });
        await expect(plugin.validateUserVariables(draft)).rejects.toMatchObject({ code: "MF_PLUGIN_AUTH_FAILED" });
    });
    it("rejects malformed success responses", async () => {
        const { plugin } = loadPlugin({ data: { "subsonic-response": {} } });
        await expect(plugin.validateUserVariables(draft)).rejects.toMatchObject({ code: "MF_PLUGIN_SERVER_ERROR" });
    });
    it("distinguishes HTTP authentication errors from network errors", async () => {
        const { plugin, get } = loadPlugin({});
        get.mockRejectedValueOnce(Object.assign(new Error("HTTP error"), { response: { status: 401 } }));
        await expect(plugin.validateUserVariables(draft)).rejects.toMatchObject({ code: "MF_PLUGIN_AUTH_FAILED" });
        get.mockRejectedValueOnce(new Error("timeout"));
        await expect(plugin.validateUserVariables(draft)).rejects.toMatchObject({ code: "MF_PLUGIN_NETWORK_ERROR" });
    });
});
