package com.sanye.anime.sanye_anime.media;

import java.net.URI;

/** 公开页面读取抽象，便于单元测试替换真实网络客户端。 */
public interface MediaPageFetcher {

    /** 读取一个经过来源白名单校验的页面 HTML。 */
    String fetch(URI uri);
}
