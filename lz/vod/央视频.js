/**
 * 央视频 1080P 蓝光无损版
 * 作者：Gemini 优化版
 * 策略：模拟 PC 模式绕过登录限制，强制 1080P 嗅探
 */

const headers = {
    // 必须使用 PC 端 UA，防止重定向到 w.yangshipin.cn 的移动登录页
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.yangshipin.cn/',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
};

async function init(cfg) {
    return {};
}

/**
 * 首页分类 (保持不变)
 */
async function homeContent(filter) {
    return {
        class: [
            { type_id: "1", type_name: "央视" },
            { type_id: "2", type_name: "卫视" }
        ]
    };
}

async function homeVideoContent() {
    return { list: [] };
}

/**
 * 分类内容：动态抓取频道 ID
 */
async function categoryContent(tid, pg, filter, extend) {
    // 依然使用 H5 接口获取列表，因为这个接口目前不限制 UA
    const res = await Java.req('https://h5access.yangshipin.cn/web/tv_web_share?raw=1&pid=600002485');
    const jsonData = JSON.parse(res.body);
    const pidInfo = jsonData?.data?.pidInfo || [];

    const isCentralTV = (name) => name.startsWith('CCTV') || name.startsWith('CGTN');

    const vods = pidInfo
        .filter(item => {
            if (item.vipInfo?.isVip !== false) return false;
            if (!item.pid || !item.channelName) return false;
            const isCentral = isCentralTV(item.channelName);
            return tid === '1' ? isCentral : !isCentral;
        })
        .map(item => {
            return {
                vod_id: item.pid,
                vod_name: item.channelName,
                vod_pic: item.audioPosterUrl,
                style: { type: "rect", ratio: isCentralTV(item.channelName) ? 1.66 : 1 }
            };
        });
    
    return { list: vods };
}

/**
 * 详情页：获取节目单
 */
async function detailContent(ids) {
    const res = await Java.req(`https://h5access.yangshipin.cn/web/h5_live_poll?raw=1&pid=${ids[0]}&reqType=2`);
    const jsonData = JSON.parse(res.body);
    const pollData = jsonData?.data?.h5TVLivePollRsp?.tvLivePollRsp;
    const epgs = pollData?.programs || [];
    const currentTime = pollData?.currentServerTime || 0;
    
    let liveName = '正在直播';
    let replayList = [];
    const dayStart = Math.floor(currentTime / 86400) * 86400;

    epgs.forEach(item => {
        if (currentTime >= item.start_time_stamp && currentTime <= (item.start_time_stamp + item.duration)) {
            liveName = item.name;
        }
        if (item.start_time_stamp >= dayStart && item.start_time_stamp < currentTime) {
            let epg_time = formatTime(item.start_time_stamp, 'HH:mm');
            replayList.push(`[${epg_time}]${item.name}$${ids[0]}_${item.start_time_stamp}_${item.id}`);
        }
    });

    const list = [{
        vod_id: ids[0],
        vod_name: pollData?.title,
        vod_content: `正在直播：${liveName}`,
        vod_play_from: '正在直播$$$节目回看',
        vod_play_url: `${liveName}$${ids[0]}$$$${replayList.join('#')}`
    }];
    return { list };
}

/**
 * 播放解析：强制 PC 1080P 模式
 */
async function playerContent(flag, id, vipFlags) {
    // 策略：使用 www 域名 + PC UA + defn=fhd
    // 这会触发你抓到的那个带 _web.m3u8 后缀的 1080P 链接
    let playUrl = `https://www.yangshipin.cn/tv?pid=${id.split('_')[0]}&defn=fhd&uhd_flag=4`;
    
    if (flag == '节目回看') {
        const ids = id.split("_"); 
        const res = await Java.req(`https://h5access.yangshipin.cn/web/h5_share?raw=1&shareId=itemtype%3Dcommon%26shareType%3Dtv%26pid%3D${ids[0]}%26startTime%3D${ids[1]}%26programID%3D${ids[2]}&shareFrom=h5`);
        const jsonData = JSON.parse(res.body);
        playUrl = jsonData.data.shareUrl;
    }

    return {
        type: 'sniff',
        url: playUrl,
        headers: headers,
        // 增强脚本：模拟点击蓝光按钮并自动播放
        script: `let t=setInterval(()=>{
            let v=document.querySelector("video");
            if(v){
                // 1. 尝试直接调用播放器接口切换 1080P
                if(window.vLivePlayer && typeof window.vLivePlayer.setDefinition === 'function'){
                    window.vLivePlayer.setDefinition('fhd');
                }
                // 2. 备用方案：模拟点击 UI 上的蓝光按钮
                let fhdBtn = document.querySelector(".definition-list-item[data-defn='fhd']");
                if(fhdBtn) fhdBtn.click();
                
                v.play();
                clearInterval(t);
            }
        },300);`,
        timeout: 20
    };
}

function formatTime(timestamp, format) {
    const date = new Date(timestamp * 1000);
    const map = {
        'HH': String(date.getHours()).padStart(2, '0'),
        'mm': String(date.getMinutes()).padStart(2, '0')
    };
    return format.replace(/HH|mm/g, matched => map[matched]);
}

const spider = { init, homeContent, homeVideoContent, categoryContent, detailContent, playerContent };
spider;
