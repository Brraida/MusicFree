/** Normalize artwork before any queue or metadata update crosses the native bridge. */
export function normalizePlayerMetadata<T extends { artwork?: unknown }>(
    metadata: T,
    fallbackArtwork: string | number,
): T {
    const artwork = metadata.artwork;
    let normalizedArtwork: unknown = fallbackArtwork;
    if (typeof artwork === "string" && artwork.trim()) {
        normalizedArtwork = artwork.trim();
    } else if (typeof artwork === "number" && Number.isInteger(artwork) && artwork > 0) {
        normalizedArtwork = artwork;
    } else if (artwork && typeof artwork === "object" && "uri" in artwork &&
        typeof artwork.uri === "string" && artwork.uri.trim()) {
        normalizedArtwork = { ...artwork, uri: artwork.uri.trim() };
    }
    return { ...metadata, artwork: normalizedArtwork } as T;
}
