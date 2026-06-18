user momentkaph; # User and group for worker processes
worker_processes auto; # 1 worker per 1 core -> adjust based on CPU cores
pid /run/nginx.pid; # file to store the process ID
error_log /var/log/nginx/error.log; # log file for errors

events {
        worker_connections 1024; # default, 1 worker can handle 1024 simultaneous connections -> increase if you have lots of clients
        use epoll;  # More efficient connection processing on Linux -> I/O multiplexing kernel system calls in event-driven architecture as nginx is build on, managing multiple I/O events in single event loop
        multi_accept on; # Accept multiple connections at once in 1 worker process
}

http {

        # Basic Settings
        sendfile on; # Enable copy file from disk cache to the network socket for better performance, for my usecase not needed, i just responding with dynamically generated JSON
        tcp_nopush on; # Improve file transfer performance -> waits for full batch of TCP packets and send it (efficient for large response transfer)
        tcp_nodelay on; # Improve small packet performance -> doesn't add small delayes between sending small TCP packets (efficient for small response transfer )
        types_hash_bucket_size 64; # Increase if you have long file extension names
        types_hash_max_size 2048; # Increase if you have lots of MIME file types
        server_tokens off; # Hide nginx version number for security

        include /etc/nginx/mime.types; # Map file extensions to MIME types
        default_type application/octet-stream; # Default MIME type, if Nginx can't determine actual type of content being served

        # Malicious bots detection for 418
        map $http_user_agent $is_bad_bot {
            default 0;
            # this could be endless list, just adding the most known bad bots / scanners / vulnerability scanners / exploit tools
            ~*(masscan|python-requests|curl|wget|nikto|acunetix|sqlmap|fimap|havij|morfeus|netsparker|openvas|nessus|dirbuster|dirb|wfuzz|bot|crawler|spider|scraper|java|Bytespider|GPTBot|SeekportBot|TinyTestBot) 1;
            "" 1;  # Empty user agent
        }

        # Aggressive Rate Limiting - Single Zone Strategy -> global resources
        # Using a single unified zone reduces memory overhead and simplifies management
        # 5m zone can track ~80,000 unique IPv4 addresses -> shared memory for rate limiting
        # 5 requests per second per IP
        limit_req_zone $binary_remote_addr zone=api_req_limit:5m rate=5r/s;
        limit_conn_zone $binary_remote_addr zone=api_conn_limit:5m; # creating api_conn_limit zone with 5m of shared memory -> ~80,000 unique IPv4 addresses
        limit_req_status 429; # default 503; respond Too Many Requests
        limit_conn_status 429; # default 503; respond Too Many Requests

        # Aggressive Timeout Settings -> per-request resources (client <-> nginx)
        client_header_timeout 25s; # default is 60sec;  25 seconds to wait for client to send headers
        client_body_timeout 35s; # default is 60sec; 35 seconds to waits for client to send request body (for POST requests)
        keepalive_timeout 40s; # default is 65sec; 40 seconds idle keepalive connections stays open
        send_timeout 35s; # default is 60sec; 35 seconds to transmit response to client -> arrays of links of photos are quite large
        client_max_body_size 4k; # default is 1M uncompressed; 4kb maximum allowed size of client request body -> there would be only text in contact form, so it is enough
        
        # Buffer sizes -> conservative -> per-request resources 
        client_header_buffer_size 1k; # default; buffer for headers of request, for my usecase 1k is enough, if header would be bigger, it automatically upgrades
        large_client_header_buffers 4 8k; # for unusually big request headers is ready 4x 8kb of memory
        client_body_buffer_size 8k; # default is 8k; for request body maintained in memory, not on disk -> ??? need to find out my actual body weight with longer description ???

        # SSL Settings
        ssl_protocols TLSv1.2 TLSv1.3; # what encryption types must connections use
        ssl_prefer_server_ciphers on; # enforce that connections use strong ciphers (server preference over client preference)


        # Logging Settings
        log_format detailed '$remote_addr - $remote_user [$time_local] '
                       '"$request" $status $body_bytes_sent '
                       '"$http_referer" "$http_user_agent" '
                       'totalRequestTime=$request_time TCP="$upstream_connect_time" '
                       'responseHeaders="$upstream_header_time" requestToResponse="$upstream_response_time" "$request_id" ';
        access_log /var/log/nginx/access.log detailed;

        # compression logic
        gzip on; # turn on
        gzip_min_length 256; # responses smaller than 256 bytes left uncompressed, it would be contra-productive
        gzip_comp_level 5; # default; balance between compression ratio and CPU usage
        gzip_types
            application/json # responses in my case are always json

        # Virtual Host Configs
        include /etc/nginx/conf.d/*.conf; # Include all configuration files in conf.d
        include /etc/nginx/sites-enabled/*; # Include all enabled site configurations
}

