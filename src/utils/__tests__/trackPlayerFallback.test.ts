import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@/utils/delay", () => ({ __esModule: true, default: async () => {} }));
jest.mock("@/utils/trackUtils", () => ({ musicIsPaused: () => false }));
jest.mock("@/constants/commonConst", () => ({ internalFakeSoundKey: "fake", sortIndexSymbol: Symbol("index"), timeStampSymbol: Symbol("time") }));
jest.mock("react-native-track-player", () => ({
    __esModule: true,
    default: { setQueue: jest.fn(async () => {}), play: jest.fn(async () => {}),
        reset: jest.fn(async () => {}), getTrack: jest.fn(async () => null) },
    State: {}, Event: {},
}));
jest.mock("@/components/dialogs/useDialog", () => ({ showDialog: jest.fn(), getCurrentDialog: () => null }));
jest.mock("@/components/panels/usePanel", () => ({ showPanel: jest.fn() }));
jest.mock("@/core/i18n", () => ({ __esModule: true, default: { t: (key: string) => key } }));
jest.mock("@/utils/toast", () => ({ __esModule: true, default: { success: jest.fn() } }));
jest.mock("@/utils/persistStatus", () => ({ __esModule: true, default: { set: jest.fn(), get: jest.fn() } }));
jest.mock("@/utils/network", () => ({ __esModule: true, default: { isCellular: false } }));
jest.mock("@/utils/log", () => ({ trace: jest.fn(), errorLog: jest.fn() }));
jest.mock("@/utils/mediaUtils", () => ({ getLocalPath: () => null,
    isSameMediaItem: (a: any, b: any) => !!a && !!b && a.id === b.id && a.platform === b.platform }));
jest.mock("@/utils/qualities", () => ({ getQualityOrder: () => ["standard"] }));
jest.mock("@/utils/fileUtils", () => ({ resolveImportedAssetOrPath: () => "file:///default.png" }));
jest.mock("@/constants/assetsConst", () => ({ ImgAsset: { albumDefault: 1 } }));
jest.mock("@/core/localMusicSheet", () => ({ __esModule: true, default: { isLocalMusic: () => false } }));

import player from "@/core/trackPlayer";
import native from "react-native-track-player";
import { showDialog } from "@/components/dialogs/useDialog";
import { showPanel } from "@/components/panels/usePanel";
const song = { id: "primary", platform: "Primary", title: "Target", artist: "Artist", artwork: "", album: "Test", duration: 20 };
const alternative = { id: "secondary", platform: "Secondary", title: "Target", artist: "Artist" };
const source = { url: "https://audio.example.test/song.mp3" };
let primary: any;
let secondary: any;
let config: Record<string, any>;
let manager: any;
beforeEach(() => {
    jest.clearAllMocks();
    (player as any).setPlayList([]);
    (player as any).setCurrentMusic(null);
    config = { "basic.autoStopWhenError": true };
    primary = { name: "Primary", instance: { userVariables: [{ key: "username" }] },
        methods: { getMediaSource: jest.fn(async () => null) } };
    secondary = { name: "Secondary", methods: { search: jest.fn(async () => ({ data: [alternative] })),
        getMediaSource: jest.fn(async () => source) } };
    manager = { getByName: () => primary, getByMedia: (item: any) => item.platform === "Secondary" ? secondary : primary,
        getSearchablePlugins: () => [primary, secondary], getUserVariables: () => ({}), setUserVariables: jest.fn() };
    player.injectDependencies({ getConfig: (key: string) => config[key] } as any, { addMusic: jest.fn() } as any, manager);
});

describe("actual player source fallback and actionable failures", () => {
    it("uses another searchable plugin when enabled and primary returns no source", async () => {
        config["basic.tryChangeSourceWhenPlayFail"] = true;
        await player.play({ ...song });
        expect(secondary.methods.search).toHaveBeenCalledWith("Target", 1, "music");
        expect(native.setQueue).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ id: song.id, platform: song.platform, url: source.url })]));
        expect(native.play).toHaveBeenCalled();
    });
    it("does not search other plugins while fallback is disabled", async () => {
        await player.play({ ...song });
        expect(secondary.methods.search).not.toHaveBeenCalled();
        expect(native.play).not.toHaveBeenCalled();
    });
    it("tries fallback before showing an authentication error", async () => {
        config["basic.tryChangeSourceWhenPlayFail"] = true;
        primary.methods.getMediaSource.mockRejectedValue(Object.assign(new Error("safe"), { code: "MF_PLUGIN_AUTH_FAILED" }));
        await player.play({ ...song });
        expect(native.play).toHaveBeenCalled();
        expect(showDialog).not.toHaveBeenCalled();
    });
    it("shows an actionable authentication error if no alternate source is available", async () => {
        config["basic.tryChangeSourceWhenPlayFail"] = true;
        primary.methods.getMediaSource.mockRejectedValue(Object.assign(new Error("safe"), { code: "MF_PLUGIN_AUTH_FAILED" }));
        secondary.methods.getMediaSource.mockResolvedValue(null);
        await player.play({ ...song });
        expect(native.reset).toHaveBeenCalledTimes(1);
        expect(native.play).not.toHaveBeenCalled();
        expect(showDialog).toHaveBeenCalledWith("SimpleDialog", expect.objectContaining({ content: "playbackError.authentication", okText: "playbackError.configure" }));
        const payload = (showDialog as any).mock.calls[0][1];
        payload.onOk();
        expect(showPanel).toHaveBeenCalledWith("SetUserVariables", expect.objectContaining({ variables: primary.instance.userVariables }));
    });
    it("does not reuse a stale URL after an explicit authentication failure", async () => {
        primary.methods.getMediaSource.mockRejectedValue(Object.assign(new Error("safe"), { code: "MF_PLUGIN_AUTH_FAILED" }));
        await player.play({ ...song, url: "https://audio.example.test/stale", source: { standard: source } } as any);
        expect(native.play).not.toHaveBeenCalled();
        expect(showDialog).toHaveBeenCalledWith("SimpleDialog", expect.objectContaining({ content: "playbackError.authentication" }));
    });
    it("retains a cached quality source rather than overwriting it with an undefined item URL", async () => {
        await player.play({ ...song, source: { standard: source } } as any);
        expect(native.setQueue).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ url: source.url })]));
        expect(native.play).toHaveBeenCalled();
    });
    it("scores candidate titles as well as artists when selecting a fallback", async () => {
        secondary.methods.search.mockResolvedValue({ data: [
            { ...alternative, title: "Completely unrelated", artist: "Artis" },
            { ...alternative, id: "closer", title: "Targe", artist: "Artis" },
        ] });
        const result = await (player as any).getSimilarMusic(song);
        expect(result.id).toBe("closer");
    });
});
