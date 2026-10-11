const playbackErrorKinds = {
    MF_PLUGIN_CONFIG_REQUIRED: "configuration",
    MF_PLUGIN_AUTH_FAILED: "authentication",
    MF_PLUGIN_NETWORK_ERROR: "network",
    MF_PLUGIN_SERVER_ERROR: "server",
    MF_PLUGIN_MEDIA_NOT_FOUND: "media",
} as const;

export type PluginPlaybackErrorKind = typeof playbackErrorKinds[keyof typeof playbackErrorKinds];

/** Only explicit plugin playback errors are eligible for user-facing guidance. */
export function getPluginPlaybackErrorKind(error: unknown): PluginPlaybackErrorKind | null {
    if (!error || typeof error !== "object" || !("code" in error)) {
        return null;
    }
    const code = error.code;
    return typeof code === "string" && Object.prototype.hasOwnProperty.call(playbackErrorKinds, code)
        ? playbackErrorKinds[code as keyof typeof playbackErrorKinds]
        : null;
}
