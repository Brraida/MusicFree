/*
 * MusicFree adapter for a private Navidrome server.
 *
 * Deliberately written without async/await so it can run in both
 * MusicFreeDesktop and the Android Hermes plugin runtime.
 */
"use strict";

var axios = require("axios");
var CryptoJS = require("crypto-js");

var PLATFORM = "私人 Navidrome";
var API_VERSION = "1.16.1";
var PAGE_SIZE = 30;

function emptyResult() {
    return {isEnd: true, data: []};
}

function asArray(value) {
    if (!value) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}

function playbackError(code, message) {
    var error = new Error(message);
    error.code = code;
    return error;
}

function getConfig(draftValues) {
    var values = draftValues;
    if (values === undefined) {
        values = typeof env !== "undefined" && env && typeof env.getUserVariables === "function"
            ? env.getUserVariables() || {} : {};
    }
    values = values || {};

    var serverUrl = String(values.serverUrl || "").trim().replace(/\/+$/, "");
    var username = String(values.username || "").trim();
    var password = String(values.password || "");

    if (!serverUrl || !username || !password) {
        throw playbackError("MF_PLUGIN_CONFIG_REQUIRED", "请先配置 Navidrome 服务器地址、用户名和密码");
    }
    if (!/^https?:\/\//i.test(serverUrl)) {
        serverUrl = "http://" + serverUrl;
    }

    return {
        serverUrl: serverUrl,
        username: username,
        password: password
    };
}

function authParams(config) {
    var salt = Math.random().toString(16).slice(2) + Date.now().toString(16);
    return {
        u: config.username,
        s: salt,
        t: CryptoJS.MD5(config.password + salt).toString(CryptoJS.enc.Hex),
        c: "MusicFree",
        v: API_VERSION,
        f: "json"
    };
}

function mergeParams(left, right) {
    var result = {};
    var key;
    for (key in left) {
        if (Object.prototype.hasOwnProperty.call(left, key)) {
            result[key] = left[key];
        }
    }
    for (key in (right || {})) {
        if (Object.prototype.hasOwnProperty.call(right, key)) {
            result[key] = right[key];
        }
    }
    return result;
}

function extractResponse(response) {
    var body = response && response.data && response.data["subsonic-response"];
    if (!body) {
        throw playbackError("MF_PLUGIN_SERVER_ERROR", "Navidrome 返回了无法识别的数据");
    }
    if (body.status !== "ok" && body.status !== "failed") {
        throw playbackError("MF_PLUGIN_SERVER_ERROR", "Navidrome 返回了无法识别的状态");
    }
    if (body.status === "failed") {
        var code = body.error && body.error.code;
        var playbackCode = code === 40 ? "MF_PLUGIN_AUTH_FAILED" : code === 70 ? "MF_PLUGIN_MEDIA_NOT_FOUND" : "MF_PLUGIN_SERVER_ERROR";
        throw playbackError(playbackCode, (body.error && body.error.message) || "Navidrome 请求失败");
    }
    return body;
}

function normalizePlaybackError(error) {
    if (error && /^MF_PLUGIN_/.test(String(error.code || ""))) {
        throw error;
    }
    var status = error && error.response && error.response.status;
    if (status === 401 || status === 403) {
        throw playbackError("MF_PLUGIN_AUTH_FAILED", "Navidrome 认证失败");
    }
    var hasResponse = !!(error && error.response);
    throw playbackError(hasResponse ? "MF_PLUGIN_SERVER_ERROR" : "MF_PLUGIN_NETWORK_ERROR",
        hasResponse ? "Navidrome 服务响应异常" : "无法连接 Navidrome 服务器");
}

function apiGet(path, params, draftValues) {
    var config = getConfig(draftValues);
    return axios.get(config.serverUrl + "/rest/" + path + ".view", {
        params: mergeParams(authParams(config), params),
        timeout: 10000
    }).then(extractResponse);
}

function authenticatedUrl(path, params) {
    var config = getConfig();
    var url = new URL(config.serverUrl + "/rest/" + path + ".view");
    var allParams = mergeParams(authParams(config), params);
    var key;
    for (key in allParams) {
        if (Object.prototype.hasOwnProperty.call(allParams, key) && allParams[key] !== undefined) {
            url.searchParams.append(key, String(allParams[key]));
        }
    }
    return url.toString();
}

function coverUrl(coverArtId) {
    if (!coverArtId) {
        return "";
    }
    return authenticatedUrl("getCoverArt", {id: coverArtId, size: 600});
}

function formatSong(item) {
    item = item || {};
    return {
        id: String(item.id || ""),
        title: item.title || item.name || "未知曲目",
        artist: item.artist || "未知歌手",
        album: item.album || "未知专辑",
        duration: Number(item.duration || 0),
        artwork: coverUrl(item.coverArt),
        albumId: item.albumId,
        artistId: item.artistId,
        track: item.track,
        discNumber: item.discNumber,
        year: item.year,
        genre: item.genre,
        bitRate: item.bitRate,
        bitDepth: item.bitDepth,
        samplingRate: item.samplingRate,
        size: item.size,
        suffix: item.suffix,
        contentType: item.contentType
    };
}

function formatAlbum(item) {
    item = item || {};
    return {
        id: String(item.id || ""),
        title: item.name || item.title || "未知专辑",
        artist: item.artist || "未知歌手",
        artwork: coverUrl(item.coverArt),
        description: item.genre || "",
        worksNum: Number(item.songCount || 0),
        artistId: item.artistId,
        year: item.year,
        duration: item.duration
    };
}

function formatArtist(item) {
    item = item || {};
    var avatar = item.artistImageUrl || "";
    if (!avatar && item.coverArt) {
        avatar = coverUrl(item.coverArt);
    }
    return {
        id: String(item.id || ""),
        name: item.name || "未知歌手",
        avatar: avatar,
        worksNum: Number(item.albumCount || 0),
        description: ""
    };
}

function search(query, page, type) {
    var requestedPage = Math.max(1, Number(page || 1));
    var offset = (requestedPage - 1) * PAGE_SIZE;
    var params = {
        query: query || "",
        artistCount: type === "artist" ? PAGE_SIZE : 0,
        artistOffset: type === "artist" ? offset : 0,
        albumCount: type === "album" ? PAGE_SIZE : 0,
        albumOffset: type === "album" ? offset : 0,
        songCount: type === "music" || type === "lyric" ? PAGE_SIZE : 0,
        songOffset: type === "music" || type === "lyric" ? offset : 0
    };

    return apiGet("search3", params).then(function (body) {
        var result = body.searchResult3 || {};
        var list;
        var formatter;

        if (type === "music" || type === "lyric") {
            list = asArray(result.song);
            formatter = formatSong;
        } else if (type === "album") {
            list = asArray(result.album);
            formatter = formatAlbum;
        } else if (type === "artist") {
            list = asArray(result.artist);
            formatter = formatArtist;
        } else {
            return emptyResult();
        }

        return {
            isEnd: list.length < PAGE_SIZE,
            data: list.map(formatter)
        };
    }).catch(function (error) {
        console.warn("Navidrome 搜索失败:", error && error.message ? error.message : "未知错误");
        return emptyResult();
    });
}

function getAlbumInfo(albumItem) {
    return apiGet("getAlbum", {id: albumItem.id}).then(function (body) {
        var album = body.album || {};
        return {
            isEnd: true,
            albumItem: formatAlbum(album),
            musicList: asArray(album.song).map(formatSong)
        };
    }).catch(function (error) {
        console.warn("Navidrome 专辑读取失败:", error && error.message ? error.message : "未知错误");
        return null;
    });
}

function getArtistWorks(artistItem, page, type) {
    return apiGet("getArtist", {id: artistItem.id}).then(function (body) {
        var albums = asArray(body.artist && body.artist.album);
        if (type === "album") {
            return {isEnd: true, data: albums.map(formatAlbum)};
        }
        if (type !== "music") {
            return emptyResult();
        }
        return Promise.all(albums.map(function (album) {
            return apiGet("getAlbum", {id: album.id}).then(function (albumBody) {
                return asArray(albumBody.album && albumBody.album.song).map(formatSong);
            });
        })).then(function (groups) {
            var songs = [];
            groups.forEach(function (group) {
                songs = songs.concat(group);
            });
            return {isEnd: true, data: songs};
        });
    }).catch(function (error) {
        console.warn("Navidrome 歌手作品读取失败:", error && error.message ? error.message : "未知错误");
        return emptyResult();
    });
}

function legacyLyric(musicItem) {
    return apiGet("getLyrics", {
        artist: musicItem.artist || "",
        title: musicItem.title || ""
    }).then(function (body) {
        var lyrics = body.lyrics;
        var value = lyrics && (lyrics.value || lyrics);
        if (!value || typeof value !== "string") {
            return null;
        }
        return {rawLrc: value};
    });
}

function lrcTimestamp(milliseconds) {
    var value = Math.max(0, Number(milliseconds || 0));
    var minutes = Math.floor(value / 60000);
    var seconds = Math.floor((value % 60000) / 1000);
    var centiseconds = Math.floor((value % 1000) / 10);
    return "[" + String(minutes).padStart(2, "0") + ":" +
        String(seconds).padStart(2, "0") + "." + String(centiseconds).padStart(2, "0") + "]";
}

function structuredLyricToLrc(lyricsList) {
    var entries = asArray(lyricsList && lyricsList.structuredLyrics);
    if (!entries.length) {
        return "";
    }
    var selected = entries.filter(function (item) {
        return item && item.synced && asArray(item.line).length;
    })[0] || entries[0];
    var lines = asArray(selected && selected.line);
    if (!lines.length) {
        return "";
    }
    return lines.map(function (line) {
        var value = String(line && line.value || "");
        if (line && line.start !== undefined && line.start !== null) {
            return lrcTimestamp(line.start) + value;
        }
        return value;
    }).join("\n");
}

function getLyric(musicItem) {
    return apiGet("getLyricsBySongId", {id: musicItem.id}).then(function (body) {
        var value = structuredLyricToLrc(body.lyricsList);
        if (value) {
            return {rawLrc: value};
        }
        return legacyLyric(musicItem);
    }).catch(function () {
        return legacyLyric(musicItem);
    }).catch(function (error) {
        console.warn("Navidrome 歌词读取失败:", error && error.message ? error.message : "未知错误");
        return null;
    });
}

function getMusicInfo(musicItem) {
    return apiGet("getSong", {id: musicItem.id}).then(function (body) {
        return formatSong(body.song || musicItem);
    }).catch(function (error) {
        console.warn("Navidrome 歌曲详情读取失败:", error && error.message ? error.message : "未知错误");
        return null;
    });
}

function albumList(type, title) {
    return apiGet("getAlbumList2", {type: type, size: 30, offset: 0}).then(function (body) {
        var albums = asArray(body.albumList2 && body.albumList2.album);
        return {
            title: title,
            data: albums.map(function (album) {
                var formatted = formatAlbum(album);
                return {
                    id: formatted.id,
                    title: formatted.title,
                    artist: formatted.artist,
                    artwork: formatted.artwork,
                    coverImg: formatted.artwork,
                    description: formatted.artist,
                    worksNum: formatted.worksNum
                };
            })
        };
    });
}

function uniqueSongs(items) {
    var seen = {};
    var result = [];
    (items || []).forEach(function (item) {
        var id = String(item && item.id || "");
        if (id && !seen[id]) {
            seen[id] = true;
            result.push(item);
        }
    });
    return result;
}

function fetchAllSongsBySearch(offset, collected) {
    var size = 500;
    return apiGet("search3", {
        query: "",
        artistCount: 0,
        albumCount: 0,
        songCount: size,
        songOffset: offset
    }).then(function (body) {
        var songs = asArray(body.searchResult3 && body.searchResult3.song);
        collected = collected.concat(songs);
        if (songs.length < size || collected.length >= 10000) {
            return uniqueSongs(collected).map(formatSong);
        }
        return fetchAllSongsBySearch(offset + songs.length, collected);
    });
}

function fetchAllAlbums(offset, collected) {
    var size = 500;
    return apiGet("getAlbumList2", {
        type: "alphabeticalByName",
        size: size,
        offset: offset
    }).then(function (body) {
        var albums = asArray(body.albumList2 && body.albumList2.album);
        collected = collected.concat(albums);
        if (albums.length < size || collected.length >= 10000) {
            return collected;
        }
        return fetchAllAlbums(offset + albums.length, collected);
    });
}

function fetchAlbumSongsInBatches(albums, index, collected) {
    var batchSize = 12;
    var batch = albums.slice(index, index + batchSize);
    if (!batch.length) {
        return Promise.resolve(uniqueSongs(collected).map(formatSong));
    }
    return Promise.all(batch.map(function (album) {
        return apiGet("getAlbum", {id: album.id}).then(function (body) {
            return asArray(body.album && body.album.song);
        });
    })).then(function (groups) {
        groups.forEach(function (songs) {
            collected = collected.concat(songs);
        });
        return fetchAlbumSongsInBatches(albums, index + batch.length, collected);
    });
}

function importMusicSheet(urlLike) {
    var keyword = String(urlLike || "").trim().toLowerCase();
    var supported = {
        "all": true,
        "all songs": true,
        "navidrome://all": true,
        "全部": true,
        "全部歌曲": true,
        "私人曲库": true
    };
    if (!supported[keyword]) {
        return Promise.resolve(null);
    }

    return fetchAllSongsBySearch(0, []).catch(function () {
        return [];
    }).then(function (songs) {
        if (songs.length) {
            return songs;
        }
        return fetchAllAlbums(0, []).then(function (albums) {
            return fetchAlbumSongsInBatches(albums, 0, []);
        });
    }).catch(function (error) {
        console.warn("Navidrome 全部歌曲导入失败:", error && error.message ? error.message : "未知错误");
        return null;
    });
}

module.exports = {
    platform: PLATFORM,
    version: "1.2.6",
    author: "Private deployment",
    description: "连接自己的 Navidrome 音乐库；支持歌曲、专辑、歌手、播放、封面和歌词。",
    appVersion: ">0.1.0-alpha.0",
    primaryKey: ["id"],
    cacheControl: "no-store",
    supportedSearchType: ["music", "album", "artist", "lyric"],
    hints: {
        importMusicSheet: ["全部歌曲", "all", "navidrome://all"]
    },
    userVariables: [
        {key: "serverUrl", name: "服务器地址", hint: "局域网示例：http://192.168.1.10:4533"},
        {key: "username", name: "用户名"},
        {key: "password", name: "密码"}
    ],

    validateUserVariables: function (values) {
        // Validate the draft, never the stored credentials, and never request audio.
        return Promise.resolve().then(function () {
            return apiGet("ping", {}, values);
        }).then(function () {}).catch(normalizePlaybackError);
    },

    search: search,
    getAlbumInfo: getAlbumInfo,
    getArtistWorks: getArtistWorks,
    getLyric: getLyric,
    getMusicInfo: getMusicInfo,
    importMusicSheet: importMusicSheet,

    getMediaSource: function (musicItem, quality) {
        // Validate authentication and song availability before an error body reaches ExoPlayer.
        return Promise.resolve().then(function () {
            return apiGet("getSong", {id: musicItem.id});
        }).then(function () {
            var params = {id: musicItem.id};
            // 已经是 MP3/M4A/Ogg 的文件直接返回原文件，保留准确时长与 Range；
            // FLAC/WAV 等大文件在标准/高音质下转成 MP3，避免公网 FRP 需要
            // 持续承载 1-2 Mbps。转码时请求估算 Content-Length，供播放器
            // 推算时长；超高音质仍允许用户主动选择原始无损文件。
            var suffix = String(musicItem.suffix || "").toLowerCase();
            var lossless = {flac: true, wav: true, wave: true, aiff: true, aif: true, alac: true};
            var transcodeBitrate = null;
            if (quality === "low") {
                transcodeBitrate = 128;
            } else if (lossless[suffix] && quality !== "super") {
                transcodeBitrate = quality === "high" ? 320 : 192;
            }
            if (transcodeBitrate !== null) {
                params.format = "mp3";
                params.maxBitRate = transcodeBitrate;
                params.estimateContentLength = true;
            } else {
                params.format = "raw";
            }
            return {
                url: authenticatedUrl("stream", params)
            };
        }).catch(function (error) {
            return normalizePlaybackError(error);
        });
    },

    getTopLists: function () {
        return Promise.all([
            albumList("newest", "最新专辑"),
            albumList("recent", "最近播放"),
            albumList("random", "随机专辑")
        ]).catch(function (error) {
            console.warn("Navidrome 榜单读取失败:", error && error.message ? error.message : "未知错误");
            return [];
        });
    },

    getTopListDetail: function (topListItem) {
        return getAlbumInfo(topListItem).then(function (result) {
            return {
                isEnd: true,
                topListItem: topListItem,
                musicList: result ? result.musicList : []
            };
        });
    }
};
