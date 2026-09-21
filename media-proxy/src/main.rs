//! Data-plane proxy for AniStream Hub.
//!
//! # Why this exists
//!
//! The Node API is the only thing that knows *which* bytes to serve. Deciding that is genuinely
//! hard here — a thousand lines of per-CDN knowledge about dead domains, obfuscated segment
//! extensions, extensionless manifests and referer requirements — but it is all cheap string work
//! on kilobyte inputs. What is expensive is the other half of the job: moving a 50MB MP4, or a
//! segment every few seconds for every concurrent viewer. That half is pure I/O, it is where a
//! garbage-collected runtime pays for every buffer it touches, and it is the half that decides
//! how many viewers a 512MB container can hold.
//!
//! So the two halves are split along that seam rather than by rewriting the API in Rust. This is
//! nginx's `X-Accel-Redirect` arrangement: the application authorizes and locates the resource,
//! the proxy delivers it. Node keeps every policy decision and never touches a media byte; this
//! process carries the bytes and makes no decisions of its own.
//!
//! # Request flow
//!
//! ```text
//!   client ──▶ media-proxy ──▶ node (127.0.0.1)
//!                   │              │
//!                   │              ├─ ordinary response ──▶ streamed back verbatim
//!                   │              │
//!                   │              └─ 204 + X-Media-Fetch: <upstream url>
//!                   │                        X-Media-Referer / X-Media-Origin
//!                   ▼
//!             upstream CDN ──────────────────────────────▶ streamed to client
//! ```
//!
//! Node never sees the payload, and the client never learns the upstream URL: the redirect is
//! internal, so the CDN link and its referer requirements stay on the server side.

use std::{convert::Infallible, net::SocketAddr, time::Duration};

use axum::{
    body::Body,
    extract::{Request, State},
    http::{header, HeaderMap, HeaderName, HeaderValue, StatusCode},
    response::Response,
    Router,
};
use futures_util::TryStreamExt;

/// Signals that Node has authorized a media fetch and wants this process to perform it.
const HDR_FETCH: &str = "x-media-fetch";
const HDR_REFERER: &str = "x-media-referer";
const HDR_ORIGIN: &str = "x-media-origin";

/// Headers that describe a single hop and must not be copied onto the next one. Forwarding
/// `transfer-encoding` in particular produces a body framed two different ways at once, which
/// clients resolve by hanging.
const HOP_BY_HOP: [&str; 8] = [
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
];

/// Sent upstream when Node does not specify one. CDNs here reject the default reqwest agent.
const DEFAULT_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

#[derive(Clone)]
struct AppState {
    client: reqwest::Client,
    node_base: String,
}

fn is_hop_by_hop(name: &HeaderName) -> bool {
    HOP_BY_HOP
        .iter()
        .any(|h| name.as_str().eq_ignore_ascii_case(h))
}

/// Copy headers between hops, dropping the ones that describe the hop itself.
fn copy_headers(from: &HeaderMap, to: &mut HeaderMap) {
    for (name, value) in from.iter() {
        if !is_hop_by_hop(name) {
            to.append(name.clone(), value.clone());
        }
    }
}

/// The browser reads media cross-origin and needs byte ranges to seek, so it has to be told that
/// ranges exist and be allowed to read the headers describing them.
fn apply_cors(headers: &mut HeaderMap) {
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    headers.insert(
        header::ACCESS_CONTROL_EXPOSE_HEADERS,
        HeaderValue::from_static("Content-Length, Content-Range, Accept-Ranges"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("Range, Content-Type, Accept"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("GET, HEAD, OPTIONS"),
    );
}

/// Stream a `reqwest` response body out as an axum body.
///
/// The bytes are never collected: each chunk is handed straight to the client, so a 50MB file
/// costs one chunk of memory rather than 50MB, and a slow client propagates backpressure up to
/// the CDN connection instead of filling a buffer on this side.
fn stream_body(upstream: reqwest::Response) -> Body {
    Body::from_stream(
        upstream
            .bytes_stream()
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e)),
    )
}

fn error_response(status: StatusCode, reason: &str) -> Response {
    let mut response = Response::new(Body::from(format!("{{\"error\":\"{reason}\"}}")));
    *response.status_mut() = status;
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );
    apply_cors(response.headers_mut());
    response
}

/// Fetch the media Node pointed at, and stream it to the client.
///
/// The client's `Range` is forwarded verbatim and the upstream's status is preserved, so a seek
/// stays a 206 with its `Content-Range` intact. Rewriting either one to 200 is what makes a
/// player refuse to scrub.
async fn serve_media(
    state: &AppState,
    directive: &HeaderMap,
    client_range: Option<HeaderValue>,
) -> Response {
    let Some(target) = directive.get(HDR_FETCH).and_then(|v| v.to_str().ok()) else {
        return error_response(StatusCode::BAD_GATEWAY, "missing_media_target");
    };

    let mut request = state
        .client
        .get(target)
        .header(header::USER_AGENT, DEFAULT_UA)
        .header(header::ACCEPT, "*/*");

    if let Some(referer) = directive.get(HDR_REFERER).and_then(|v| v.to_str().ok()) {
        request = request.header(header::REFERER, referer);
    }
    if let Some(origin) = directive.get(HDR_ORIGIN).and_then(|v| v.to_str().ok()) {
        request = request.header(header::ORIGIN, origin);
    }
    if let Some(range) = client_range {
        request = request.header(header::RANGE, range);
    }

    let upstream = match request.send().await {
        Ok(response) => response,
        Err(error) => {
            eprintln!("[media-proxy] upstream fetch failed: {error}");
            return error_response(StatusCode::BAD_GATEWAY, "upstream_unreachable");
        }
    };

    let status = StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::OK);
    let mut headers = HeaderMap::new();
    copy_headers(upstream.headers(), &mut headers);
    // Stated unconditionally: a CDN that omits it still serves ranges, and without it the player
    // will not attempt to seek at all.
    headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    apply_cors(&mut headers);

    let mut response = Response::new(stream_body(upstream));
    *response.status_mut() = status;
    *response.headers_mut() = headers;
    response
}

/// Forward every request to Node, then either stream its response back or carry out the media
/// fetch it asked for.
async fn handle(State(state): State<AppState>, request: Request) -> Result<Response, Infallible> {
    let (parts, body) = request.into_parts();

    let path_and_query = parts.uri.path_and_query().map(|pq| pq.as_str()).unwrap_or("/");
    let node_uri = format!("{}{}", state.node_base, path_and_query);

    // API request bodies here are small JSON payloads; the streamed responses are what matter.
    // The cap keeps a malformed or hostile request from being buffered without bound.
    let body_bytes = match axum::body::to_bytes(body, 2 * 1024 * 1024).await {
        Ok(bytes) => bytes,
        Err(_) => return Ok(error_response(StatusCode::PAYLOAD_TOO_LARGE, "request_body_too_large")),
    };

    let mut forward_headers = HeaderMap::new();
    copy_headers(&parts.headers, &mut forward_headers);
    // Node is addressed on loopback, so the inbound Host would point it at the wrong authority.
    forward_headers.remove(header::HOST);

    let node_response = state
        .client
        .request(parts.method.clone(), &node_uri)
        .headers(forward_headers)
        .body(body_bytes)
        .send()
        .await;

    let node_response = match node_response {
        Ok(response) => response,
        Err(error) => {
            eprintln!("[media-proxy] node unreachable at {node_uri}: {error}");
            return Ok(error_response(StatusCode::BAD_GATEWAY, "api_unreachable"));
        }
    };

    // The internal redirect. Node has decided what to serve and has sent no body of its own.
    if node_response.headers().contains_key(HDR_FETCH) {
        let directive = node_response.headers().clone();
        let client_range = parts.headers.get(header::RANGE).cloned();
        return Ok(serve_media(&state, &directive, client_range).await);
    }

    let status = StatusCode::from_u16(node_response.status().as_u16()).unwrap_or(StatusCode::OK);
    let mut headers = HeaderMap::new();
    copy_headers(node_response.headers(), &mut headers);

    let mut response = Response::new(stream_body(node_response));
    *response.status_mut() = status;
    *response.headers_mut() = headers;
    Ok(response)
}

fn env_or(key: &str, fallback: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| fallback.to_string())
}

#[tokio::main]
async fn main() {
    let port: u16 = env_or("PORT", "8080").parse().unwrap_or(8080);
    let node_port: u16 = env_or("NODE_PORT", "3001").parse().unwrap_or(3001);
    let node_base = format!("http://127.0.0.1:{node_port}");

    let client = reqwest::Client::builder()
        // Media responses are long-lived by nature, so there is no whole-request timeout: it
        // would cut a slow download mid-file. The connect timeout still bounds an unreachable
        // host, which is the failure worth bounding.
        .connect_timeout(Duration::from_secs(15))
        .pool_idle_timeout(Duration::from_secs(90))
        .pool_max_idle_per_host(32)
        // Upstream redirects are followed here so the client never sees the CDN URL.
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .expect("failed to build HTTP client");

    let state = AppState {
        client,
        node_base: node_base.clone(),
    };
    let app = Router::new().fallback(handle).with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .unwrap_or_else(|e| panic!("failed to bind {addr}: {e}"));

    println!("[media-proxy] listening on {addr}, forwarding to {node_base}");

    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
            println!("[media-proxy] shutting down");
        })
        .await
        .expect("server error");
}
