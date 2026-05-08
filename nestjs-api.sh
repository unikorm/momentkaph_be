proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=mobile_image_cache:10m max_size=5g inactive=60d use_temp_path=off;

server {
    listen 443 ssl; # accept TCP connections on port 443 and and treat these connections as HTTPS (use SSL/TLS)
    server_name api.momentkaph.sk; # nginx looks for SNI (server name indication) on the request and finds that distinct server segment

    # block bad bots
    if ($is_bad_bot) {
        return 418; # I'm a teapot
    }

    # enforce correct case-sensitive hostname and prevent attacks as direct IP access, etc.
    if ($host !~ ^api\.momentkaph\.sk$) {
    return 421; # Misdirected Request
    }

    # CORS headers -> for browser to know from response with those headers who is allowed to access resources, browser enforces CORS policy then
    add_header Access-Control-Allow-Origin "https://momentkaph.sk" always; # only from this origin
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always; # only these methods
    add_header Access-Control-Allow-Headers "Content-Type" always; # with Content-Type header -> in future, i want Authorization implements too
    add_header Access-Control-Max-Age "3600" always; # tells the browser how long he can cache this headers, in this case 1 hour, then it must send another OPTIONS preflight request before actual request


    # Handle preflight requests -> OPTIONS preflight requests are for non-simple requests and tell the browser what is actually allowed to send on this BE
    if ($request_method = 'OPTIONS') {
        return 204; # No Content -> standart response for OPTIONS
    }

    # SSL/TLS logic (for TLS handshake using certificates) -> on network layer with TCP and TLS above it connection before actual HTTPS connection -> for proving to browser i am api.momentkaph.sk
    # Cerbot is ACME client, who orchestrate certificate renewal -> add location for challenge automatically if cerbot nginx is used -> needs to test out if webroot is not used here
    ssl_certificate /etc/letsencrypt/live/api.momentkaph.sk/fullchain.pem; # public part with intermediate
    ssl_certificate_key /etc/letsencrypt/live/api.momentkaph.sk/privkey.pem; # private part for *.momentkaph.sk
    include /etc/letsencrypt/options-ssl-nginx.conf; # TLS settings prefered by Cerbot/nginx
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # use stronger cipher suites/ perform Diffle-Hellman key exchange

    # Rate limiting applied to all endpoints
    limit_req zone=api_req_limit; # no additional request allowed (burst-0)
    limit_conn api_conn_limit 2; # max 2 concurent request from one IP

    # request timeouts to prevent hanging connections
    proxy_connect_timeout 10; # 60 sec is default; connection to localhost BE server is in milliseconds
    proxy_send_timeout 10; # 60 sec is default; timeout set between two successive write operations, not for the transmission of the whole request.
    proxy_read_timeout 10; # 60 sec is default; timeout for reading two successive read operations, not for the transmission of the whole response.

    # add security headers to responses
    add_header Strict-Transport-Security "max-age=31536000" always; # enforce HTTPS for 1 year
    add_header X-Content-Type-Options "nosniff"; # prevents browsers from guessing MIME types and forces them to stick with the declared content type

    # add caching headers for debugging and monitoring cache behavior -> for debugging purposes
    add_header X-Cache-Status $upstream_cache_status always; # for debugging cache behavior; possible values: MISS (not in cache), BYPASS (cache bypassed), EXPIRED (cached response expired), STALE (stale response served due to backend failure), UPDATING (response is being updated in cache), HIT (cached response served)

    # Proxy setup
    proxy_http_version 1.1; # use HTTP/1.1 to support keep-alive connections to backend

    # Proxy buffering settings -> per-request resources
    proxy_buffering on; # default is on; enable buffering of responses from the proxied server
    proxy_buffer_size 4k; # default is 4k or 8k; size of the buffer used for reading the first part of the response (headers) from the proxied server
    proxy_buffers 8 8k; # default is 8 4k or 8 8k; number and size of buffers used for reading a response from the proxied server
    proxy_busy_buffers_size 32k; # default is 8k or 16k; size of buffers that can be busy sending a response to the client while the response is not yet fully read.

    # Shared proxy headers to backend services
    proxy_set_header Host $host; # pass the original Host header
    proxy_set_header X-Real-IP $remote_addr; # pass the client IP address
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; # pass the original X-Forwarded-For header -> list of IPs through which request passed; not useful in my case, but standard practice
    proxy_set_header X-Forwarded-Proto $scheme; # pass the original protocol (http or https) used by the client
    proxy_set_header Connection ""; # disable connection header to allow keep-alive connections to backend
    proxy_set_header X-Request-ID $request_id; # pass unique request ID for tracing and debugging

    # Email sending endpoint, 
    location = /email_sending {
        limit_except POST { # allow only POST requests on this uri
            deny all;
        }
        # backend handling
        proxy_pass http://127.0.0.1:3000$uri$is_args$args; # default is $uri without args -> $uri is decoded/normalized version of original request URI -> safer
    }

    # Cloud storage endpoint with parameter
    location ~ ^/cloud_storage/(weddings|portrait|love-story|family|studio|pregnancy|baptism|newborn)$ {
        limit_except GET { # allow only GET requests on this uri
            deny all;
        }
        proxy_cache mobile_image_cache;
        proxy_cache_valid 200 301 60d;          # cache successful responses for 60 days
        proxy_cache_valid 302 1h;              # cache temporary redirects for 1 hour
        proxy_cache_valid 404 1m;              # cache not found responses for 1 minute to prevent cache pollution

        add_header Cache-Control "public, max-age=86400, stale-while-revalidate=604800"; # cache-control header for clients; 1 day max-age, allow stale content for 7 days while revalidating in background

        proxy_ignore_headers Cache-Control; # override whatever upstream says -> for better control over caching behavior
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504; # serve stale content if backend is down or returns error -> for better availability
        proxy_cache_background_update on; # allow serving stale content while updating cache in background
        proxy_cache_lock on; # prevent multiple requests for the same resource from overwhelming the backend when cache is expired
        # backend handling
        proxy_pass http://127.0.0.1:3000$uri$is_args$args;
    }

    location / { # all other uri-s
        return 404;
    }

}

server {
    listen 80;
    server_name api.momentkaph.sk;
    
    # redirect all HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}
