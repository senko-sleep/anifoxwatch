export const axios = {
    get: async <T = any>(url: string | URL, conf?: any): Promise<{ data: T; status: number; headers: Headers }> => {
        const urlStr = url instanceof URL ? url.toString() : url;
        const res = await fetch(urlStr, { 
            method: 'GET',
            headers: conf?.headers 
        });
        const text = await res.text();
        try {
            return { status: res.status, data: JSON.parse(text), headers: res.headers };
        } catch(e) {
            return { status: res.status, data: text as unknown as T, headers: res.headers };
        }
    },
    post: async <T = any>(url: string | URL, body?: any, conf?: any): Promise<{ data: T; status: number; headers: Headers }> => {
        const urlStr = url instanceof URL ? url.toString() : url;
        const res = await fetch(urlStr, { 
            method: 'POST', 
            headers: conf?.headers, 
            body: typeof body === 'string' || body instanceof URLSearchParams ? body : JSON.stringify(body) 
        });
        const text = await res.text();
        try {
            return { status: res.status, data: JSON.parse(text), headers: res.headers };
        } catch(e) {
            return { status: res.status, data: text as unknown as T, headers: res.headers };
        }
    }
};
export default axios;
