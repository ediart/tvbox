const config = {
    host: 'http://139.9.106.196:2345',
    userId: "623ba3ccaae348f9a3ce90adafb05bc1",
    token: "61450f3dc3e34bea80e5cbe4ae34fc05",
    deviceId: "ea27caf7-9a51-4209-b1a5-374bf30c2ffd",
    clientVersion: "4.9.0.31"
};
const deviceProfile = {
    DeviceProfile: {
        MaxStaticBitrate: 140000000,
        MaxStreamingBitrate: 140000000,
        DirectPlayProfiles: [
            { Container: "mp4,mkv,webm", Type: "Video", VideoCodec: "h264,h265,av1,vp9", AudioCodec: "aac,mp3,opus,flac" },
            { Container: "mp3,aac,flac,opus", Type: "Audio" }
        ],
        TranscodingProfiles: [
            { Container: "mp4", Type: "Video", VideoCodec: "h264", AudioCodec: "aac", Context: "Streaming", Protocol: "http" },
            { Container: "aac", Type: "Audio", Context: "Streaming", Protocol: "http" }
        ],
        SubtitleProfiles: [{ Format: "srt,ass,vtt", Method: "External" }],
        CodecProfiles: [
            { Type: "Video", Codec: "h264", ApplyConditions: [{ Condition: "LessThanEqual", Property: "VideoLevel", Value: "62" }] }
        ],
        BreakOnNonKeyFrames: true
    }
};
const getHeaders = (extra = {}) => ({
    "X-Emby-Client": "Emby Web",
    "X-Emby-Device-Name": "Android WebView Android",
    "X-Emby-Device-Id": config.deviceId,
    "X-Emby-Client-Version": config.clientVersion,
    "X-Emby-Token": config.token,
    ...extra
});
const buildUrl = (endpoint, params = {}) => {
    const queryString = Object.entries(params)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&');
    return `${config.host}${endpoint}${endpoint.includes('?') || !queryString ? '' : '?'}${queryString}`;
};
const getImageUrl = (itemId, imageTag) => 
    imageTag ? `${config.host}/emby/Items/${itemId}/Images/Primary?maxWidth=400&tag=${imageTag}&quality=90` : "";
const extractVideos = (jsonData) => 
    (jsonData?.Items || []).map(it => ({
        vod_id: it.Id,
        vod_name: it.Name || "",
        vod_pic: getImageUrl(it.Id, it.ImageTags?.Primary),
        vod_remarks: it.ProductionYear?.toString() || ""
    }));
const fetchApi = async (url, options = {}) => {
    const resp = await req(url, {
        ...options,
        headers: getHeaders(options.headers || {})
    });
    return resp?.content ? JSON.parse(resp.content) : null;
};
const getViews = async () => {
    const url = buildUrl(`/emby/Users/${config.userId}/Views`);
    return await fetchApi(url);
};
const homeVod = async () => {
    const url = buildUrl(`/emby/Users/${config.userId}/Items`, {
        SortBy: 'DateCreated',
        SortOrder: 'Descending',
        IncludeItemTypes: 'Movie,Series',
        Recursive: 'true',
        Limit: 40,
        Fields: 'BasicSyncInfo,CanDelete,Container,PrimaryImageAspectRatio,ProductionYear,CommunityRating,Status,CriticRating,EndDate,Path,Overview',
        EnableImageTypes: 'Primary,Backdrop,Thumb,Banner',
        ImageTypeLimit: 1
    });
    const json = await fetchApi(url);
    return JSON.stringify({ 
        list: json ? extractVideos(json) : [] 
    });
};
const home = async () => {
    const json = await getViews();
    const classList = (json?.Items || [])
        .filter(it => !it.Name.includes("播放列表") && !it.Name.includes("相机"))
        .map(it => ({
            type_id: it.Id,
            type_name: it.Name
        }));
    return JSON.stringify({
        class: classList,
        filters: {},
        list: []
    });
};
const category = async (tid, pg = 1) => {
    const startIndex = (pg - 1) * 30;
    const url = buildUrl(`/emby/Users/${config.userId}/Items`, {
        SortBy: 'DateLastContentAdded,SortName',
        SortOrder: 'Descending',
        IncludeItemTypes: 'Movie,Series',
        Recursive: 'true',
        Fields: 'BasicSyncInfo,CanDelete,Container,PrimaryImageAspectRatio,ProductionYear,CommunityRating,Status,CriticRating,EndDate,Path',
        StartIndex: startIndex,
        ParentId: tid,
        EnableImageTypes: 'Primary,Backdrop,Thumb,Banner',
        ImageTypeLimit: 1,
        Limit: 30,
        EnableUserData: 'true'
    });
    const json = await fetchApi(url, { headers: getHeaders() });
    if (!json) {
        return JSON.stringify({ 
            list: [], 
            page: +pg, 
            pagecount: 1, 
            limit: 30 
        });
    }
    const list = extractVideos(json);
    const total = json.TotalRecordCount || 0;
    const pagecount = pg * 30 < total ? +pg + 1 : +pg;
    return JSON.stringify({ 
        list, 
        page: +pg, 
        pagecount, 
        limit: 30, 
        total 
    });
};
const detail = async (id) => {
    const info = await fetchApi(buildUrl(`/emby/Users/${config.userId}/Items/${id}`, {
        Fields: 'BasicSyncInfo,CanDelete,Container,PrimaryImageAspectRatio,ProductionYear,CommunityRating,Status,CriticRating,EndDate,Path,Overview,Genres,People,Taglines,Studios'
    }));
    const rating = info?.CommunityRating || info?.CriticRating;
    const formattedRating = rating ? rating.toFixed(1) : "";
    const year = info?.ProductionYear?.toString() || "";
    let remarks = year;
    if (formattedRating) {
        remarks = remarks ? `${remarks} / ${formattedRating}分` : `${formattedRating}分`;
    }
    const directors = info?.People?.filter(person => person.Type === "Director" || person.Role === "Director").map(person => person.Name) || [];
    const actors = info?.People?.filter(person => person.Type === "Actor" || person.Role === "Actor").map(person => person.Name) || [];
    const studios = info?.Studios || [];
    const VOD = {
        vod_id: id,
        vod_name: info?.Name || "",
        vod_pic: getImageUrl(id, info?.ImageTags?.Primary),
        vod_content: info?.Overview?.replace(/\xa0/g, ' ').replace(/\n\n/g, '\n').trim() || "暂无简介",
        vod_year: year,
        vod_director: directors.join(" / "),
        vod_actor: actors.join(" / "),
        vod_area: studios.map(studio => studio.Name).join(" / "),
        vod_remarks: remarks,
        vod_score: formattedRating, 
        vod_type: info?.Genres?.join(" / ") || "",
        vod_play_from: "",
        vod_play_url: ""
    };
    if (!info) return JSON.stringify({ list: [VOD] });
    if (info.Type === "Series") {
        const seasons = await fetchApi(buildUrl(`/emby/Shows/${id}/Seasons`, {
            UserId: config.userId,
            Fields: 'BasicSyncInfo,CanDelete,Container,PrimaryImageAspectRatio,ProductionYear,CommunityRating,Status,CriticRating,EndDate,Path,Overview',
            EnableTotalRecordCount: 'false'
        }));
        const from = [];
        const result = [];
        for (const season of seasons?.Items || []) {
            from.push(season.Name);
            const episodes = await fetchApi(buildUrl(`/emby/Shows/${id}/Episodes`, {
                SeasonId: season.Id,
                ImageTypeLimit: 1,
                UserId: config.userId,
                Fields: 'Overview,PrimaryImageAspectRatio',
                Limit: 1000
            }));
            if (episodes?.Items) {
                const playlist = episodes.Items.map(item => `${item.Name}$${item.Id}`);
                result.push(playlist.join("#"));
            }
        }
        VOD.vod_play_from = from.join("$$$");
        VOD.vod_play_url = result.join("$$$");
    } else if (!info.IsFolder) {
        VOD.vod_play_from = "EMBY";
        VOD.vod_play_url = `${info.Name || "播放"}$${id}`;
    }
    return JSON.stringify({
        list: [VOD]
    });
};
const search = async (wd, quick, pg = 1) => {
    const url = buildUrl(`/emby/Users/${config.userId}/Items`, {
        SortBy: 'SortName',
        SortOrder: 'Ascending',
        Fields: 'BasicSyncInfo,CanDelete,Container,PrimaryImageAspectRatio,ProductionYear,Status,EndDate',
        StartIndex: (pg - 1) * 50,
        EnableImageTypes: 'Primary,Backdrop,Thumb',
        ImageTypeLimit: 1,
        Recursive: 'true',
        SearchTerm: wd,
        GroupProgramsBySeries: 'true',
        Limit: 50
    });
    const json = await fetchApi(url, { headers: getHeaders() });
    if (!json) {
        return JSON.stringify({ list: [] });
    }
    return JSON.stringify({ list: extractVideos(json) });
};
const play = async (_, id) => {
    const url = buildUrl(`/Items/${id}/PlaybackInfo`, {
        UserId: config.userId,
        IsPlayback: 'true',
        AutoOpenLiveStream: 'false',
        StartTimeTicks: 0,
        MaxStreamingBitrate: 140000000
    });
    const headers = getHeaders({ 'Content-Type': 'application/json' });
    const resp = await req(url, { method: 'POST', headers, body: JSON.stringify(deviceProfile) });
    const json = JSON.parse(resp.content);
    const mediaSource = json.MediaSources?.[0];
    if (!mediaSource) {
        return JSON.stringify({ parse: 1, msg: '无可用媒体源' });
    }
    const getPublicUrl = (originalUrl) => {
        if (!originalUrl) return '';
        const cleanPath = originalUrl.replace(/^https?:\/\/[^\/]+/i, '');
        return config.host + cleanPath;
    };

    let playUrl = '';
    if (mediaSource.DirectStreamUrl) {
        playUrl = getPublicUrl(mediaSource.DirectStreamUrl);
    } else if (mediaSource.DirectPlayUrl) {
        playUrl = getPublicUrl(mediaSource.DirectPlayUrl);
    } else {
        return JSON.stringify({ parse: 1, msg: '无直通播放链接' });
    }

    return JSON.stringify({
        parse: 0,
        url: playUrl,
        header: {
            'X-Emby-Client': 'Emby Web',
            'X-Emby-Device-Name': 'Android WebView Android',
            'X-Emby-Device-Id': config.deviceId,
            'X-Emby-Client-Version': config.clientVersion,
            'X-Emby-Token': config.token
        }
    });
};
export default { home, homeVod, category, detail, search, play };
