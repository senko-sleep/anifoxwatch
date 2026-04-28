export const axios = {
    get: async (url, conf) => {
        const urlStr = url instanceof URL ? url.toString() : url;
        const res = await fetch(urlStr, {
            method: 'GET',
            headers: conf?.headers
        });
        const text = await res.text();
        try {
            return { status: res.status, data: JSON.parse(text), headers: res.headers };
        }
        catch (e) {
            return { status: res.status, data: text, headers: res.headers };
        }
    },
    post: async (url, body, conf) => {
        const urlStr = url instanceof URL ? url.toString() : url;
        const res = await fetch(urlStr, {
            method: 'POST',
            headers: conf?.headers,
            body: typeof body === 'string' || body instanceof URLSearchParams ? body : JSON.stringify(body)
        });
        const text = await res.text();
        try {
            return { status: res.status, data: JSON.parse(text), headers: res.headers };
        }
        catch (e) {
            return { status: res.status, data: text, headers: res.headers };
        }
    }
};
export default axios;
//# sourceMappingURL=axios-edge.js.map