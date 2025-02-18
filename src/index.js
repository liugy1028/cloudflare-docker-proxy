function routeByHosts(host) {
    const routes = {
        // 生产环境
        "quay": "quay.io",
        "gcr": "gcr.io",
        "k8s-gcr": "k8s.gcr.io",
        "k8s": "registry.k8s.io",
        "ghcr": "ghcr.io",
        "cloudsmith": "docker.cloudsmith.io",
        "nvcr": "nvcr.io"
    };

    if (host in routes) return routes[host];
    else return "registry-1.docker.io";
}

export default {
    async fetch(request, env, ctx) {
        let url = new URL(request.url); // 解析请求URL
        const workers_host = url.host;

        let hub_host;
        // 获取请求参数中的 ns
        const ns = url.searchParams.get('ns');
        const hostname = url.searchParams.get('hubhost') || url.hostname;
        const hostTop = hostname.split('.')[0]; // 获取主机名的第一部分

        // 如果存在 ns 参数，优先使用它来确定 hub_host
        if (ns) {
            hub_host = ns === 'docker.io' ? 'registry-1.docker.io' : ns;
        } else {
            hub_host = routeByHosts(hostTop);
        }

        // 处理token请求
        if (url.pathname.includes('/token')) {
            // 补全library请求路径
            if (!/%2F/i.test(url.search) && /%3A/i.test(url.search)) {
                url.search = url.search.replace(/%3A(?=.*?&)/i, '%3Alibrary%2F');
                return Response.redirect(url.toString(), 301);
            }
            url.host = "auth.docker.io";
            return fetch(new Request(url, request));
        }

        // 补全/v2/library请求路径
        if (hub_host == 'registry-1.docker.io' && /^\/v2\/[^/]+\/[^/]+\/[^/]+$/.test(url.pathname) && !/^\/v2\/library/.test(url.pathname)) {
            url.pathname = '/v2/library/' + url.pathname.split('/v2/')[1];
            return Response.redirect(url.toString(), 301);
        }

        // 处理/v2请求
        url.host = hub_host;
        let response = await fetch(new Request(url, request));
        const newHeaders = new Headers(response.headers);
        // 修改 Www-Authenticate 头
        const authHeader = response.headers.get("www-authenticate");
        if (authHeader) {
            let re = new RegExp('auth.docker.io', 'g');
            newHeaders.set("www-authenticate", authHeader.replace(re, workers_host));
        }
        // 处理重定向
        if (response.status === 301 || response.status === 302) {
            const locationHeader = response.headers.get('Location');
            if (locationHeader) {
                const locationURL = new URL(locationHeader);
                locationURL.host = workers_host;
                newHeaders.set('Location', locationURL.toString());
            }
        }

        // 返回修改后的响应
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
        });
    }
};
